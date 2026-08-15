import { BlockId, getBlock } from '../blocks/BlockRegistry';
import { CHUNK_SIZE, SECTION_COUNT, SECTION_HEIGHT, WORLD_SIZE_Y } from '../constants/world';
import { toChunkCoord } from '../world/Chunk';
import type { World } from '../world/World';
import { CROP_MAX_STAGE, FARMLAND_MAX_MOISTURE } from '../blocks/blockShapes';
import { TREE_HEIGHT_VARIANCE, TREE_MIN_HEIGHT, forEachTreeBlock } from '../world/treeShape';

/** 每个已分配段每 tick 随机抽取的方块数（1.8.9 是 3）。 */
export const RANDOM_TICKS_PER_SECTION = 3;
/** 只在玩家周围这么多 chunk 内跑随机 tick。 */
export const RANDOM_TICK_CHUNK_RADIUS = 4;
/** 草蔓延所需的最低光照，以及草被压死的光照上限。 */
const GRASS_SPREAD_MIN_LIGHT = 9;
const GRASS_DIE_MAX_LIGHT = 4;
/** 树苗长大的光照下限与每次随机 tick 的概率。 */
const SAPLING_MIN_LIGHT = 9;
const SAPLING_GROW_CHANCE = 0.15;
/** 树苗长大需要的净空高度。 */
const SAPLING_CLEARANCE = 6;
/** 树冠缺角随机种子的取值上限。 */
const MAX_TREE_SEED = 0xffffffff;
/** 作物生长所需的最低光照。 */
const CROP_MIN_LIGHT = 9;
/** 每次随机 tick 的生长概率：湿耕地上更快。 */
const CROP_GROW_CHANCE_WET = 0.25;
const CROP_GROW_CHANCE_DRY = 0.1;
/** 耕地找水的水平半径与向上的格数（1.8.9 是 4 格半径）。 */
const FARMLAND_WATER_RADIUS = 4;

/** 随机 tick 需要从游戏取的上下文。 */
export interface RandomTickHost {
  readonly world: World;
  /** 0~1 随机数（与世界生成分开的运行时随机源）。 */
  random(): number;
  /** 该位置的有效光照（取天空光与方块光的较大者，天空光已按昼夜衰减）。 */
  lightLevelAt(x: number, y: number, z: number): number;
}

/**
 * 随机 tick：每 tick 在玩家附近的每个已分配段里抽几个方块，交给对应的处理逻辑。
 * 草蔓延、树苗长大、作物生长、火焰蔓延这类"慢慢发生"的规则都挂在这里。
 */
export class RandomTickSystem {
  constructor(private readonly host: RandomTickHost) {}

  /** 跑一轮随机 tick（每游戏 tick 调用一次）。 */
  tick(playerX: number, playerZ: number): void {
    const world = this.host.world;
    const pcx = toChunkCoord(playerX);
    const pcz = toChunkCoord(playerZ);
    for (let cz = pcz - RANDOM_TICK_CHUNK_RADIUS; cz <= pcz + RANDOM_TICK_CHUNK_RADIUS; cz++) {
      for (let cx = pcx - RANDOM_TICK_CHUNK_RADIUS; cx <= pcx + RANDOM_TICK_CHUNK_RADIUS; cx++) {
        const chunk = world.getChunk(cx, cz);
        if (!chunk || !chunk.isLit) {
          continue;
        }
        for (let sy = 0; sy < SECTION_COUNT; sy++) {
          if (!chunk.sections[sy]) {
            continue;
          }
          for (let i = 0; i < RANDOM_TICKS_PER_SECTION; i++) {
            const lx = Math.floor(this.host.random() * CHUNK_SIZE);
            const lz = Math.floor(this.host.random() * CHUNK_SIZE);
            const y = sy * SECTION_HEIGHT + Math.floor(this.host.random() * SECTION_HEIGHT);
            this.tickBlock(chunk.originX + lx, y, chunk.originZ + lz);
          }
        }
      }
    }
  }

  /** 对单个方块跑一次随机 tick 的逻辑（骨粉催熟、测试等也可直接调用）。 */
  tickBlock(x: number, y: number, z: number): void {
    switch (this.host.world.getBlock(x, y, z)) {
      case BlockId.GRASS:
        this.tickGrass(x, y, z);
        break;
      case BlockId.DIRT:
        this.trySpreadGrassOnto(x, y, z);
        break;
      case BlockId.SAPLING:
        this.tickSapling(x, y, z);
        break;
      case BlockId.FARMLAND:
        this.tickFarmland(x, y, z);
        break;
      case BlockId.WHEAT:
        this.tickCrop(x, y, z);
        break;
      default:
        break;
    }
  }

  /** 被不透光方块压住或太暗的草会退化成泥土。 */
  private tickGrass(x: number, y: number, z: number): void {
    const world = this.host.world;
    const above = getBlock(world.getBlock(x, y + 1, z));
    if (above.opaque || this.host.lightLevelAt(x, y + 1, z) < GRASS_DIE_MAX_LIGHT) {
      world.setBlock(x, y, z, BlockId.DIRT);
    }
  }

  /** 露天且够亮的泥土，若邻近有草方块就长出草。 */
  private trySpreadGrassOnto(x: number, y: number, z: number): void {
    const world = this.host.world;
    if (getBlock(world.getBlock(x, y + 1, z)).opaque) {
      return;
    }
    if (this.host.lightLevelAt(x, y + 1, z) < GRASS_DIE_MAX_LIGHT) {
      return;
    }
    // 随机看一个邻居，够亮的草才会蔓延过来
    const nx = x + Math.floor(this.host.random() * 3) - 1;
    const ny = y + Math.floor(this.host.random() * 3) - 1;
    const nz = z + Math.floor(this.host.random() * 3) - 1;
    if (ny < 0 || ny >= WORLD_SIZE_Y || world.getBlock(nx, ny, nz) !== BlockId.GRASS) {
      return;
    }
    if (this.host.lightLevelAt(nx, ny + 1, nz) < GRASS_SPREAD_MIN_LIGHT) {
      return;
    }
    world.setBlock(x, y, z, BlockId.GRASS);
  }

  /** 耕地：附近有水就保持湿润，没水就慢慢变干，干透且没种东西时退回泥土。 */
  private tickFarmland(x: number, y: number, z: number): void {
    const world = this.host.world;
    const moisture = world.getMeta(x, y, z);
    if (this.hasWaterNearby(x, y, z)) {
      if (moisture < FARMLAND_MAX_MOISTURE) {
        world.setMeta(x, y, z, FARMLAND_MAX_MOISTURE);
      }
      return;
    }
    if (moisture > 0) {
      world.setMeta(x, y, z, moisture - 1);
      return;
    }
    if (world.getBlock(x, y + 1, z) !== BlockId.WHEAT) {
      world.setBlock(x, y, z, BlockId.DIRT);
    }
  }

  /** 耕地水平 4 格内、同层或上一层是否有水。 */
  private hasWaterNearby(x: number, y: number, z: number): boolean {
    const world = this.host.world;
    for (let dz = -FARMLAND_WATER_RADIUS; dz <= FARMLAND_WATER_RADIUS; dz++) {
      for (let dx = -FARMLAND_WATER_RADIUS; dx <= FARMLAND_WATER_RADIUS; dx++) {
        for (let dy = 0; dy <= 1; dy++) {
          if (world.getBlock(x + dx, y + dy, z + dz) === BlockId.WATER) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /** 作物：够亮就按耕地湿度决定的概率长一阶段。 */
  private tickCrop(x: number, y: number, z: number): void {
    const world = this.host.world;
    const stage = world.getMeta(x, y, z);
    if (stage >= CROP_MAX_STAGE) {
      return;
    }
    if (this.host.lightLevelAt(x, y, z) < CROP_MIN_LIGHT) {
      return;
    }
    const wet = world.getMeta(x, y - 1, z) > 0 && world.getBlock(x, y - 1, z) === BlockId.FARMLAND;
    if (this.host.random() >= (wet ? CROP_GROW_CHANCE_WET : CROP_GROW_CHANCE_DRY)) {
      return;
    }
    world.setMeta(x, y, z, stage + 1);
  }

  /** 树苗在够亮、上方够空旷时长成树。 */
  private tickSapling(x: number, y: number, z: number): void {
    if (this.host.random() >= SAPLING_GROW_CHANCE) {
      return;
    }
    if (this.host.lightLevelAt(x, y, z) < SAPLING_MIN_LIGHT) {
      return;
    }
    const world = this.host.world;
    const ground = world.getBlock(x, y - 1, z);
    if (ground !== BlockId.GRASS && ground !== BlockId.DIRT) {
      return;
    }
    for (let dy = 1; dy <= SAPLING_CLEARANCE; dy++) {
      if (world.getBlock(x, y + dy, z) !== BlockId.AIR) {
        return;
      }
    }
    const height = TREE_MIN_HEIGHT + Math.floor(this.host.random() * TREE_HEIGHT_VARIANCE);
    const tree = { x, y, z, height, cornerSeed: Math.floor(this.host.random() * MAX_TREE_SEED) };
    world.batch(() => {
      world.setBlock(x, y, z, BlockId.AIR);
      forEachTreeBlock(tree, (bx, by, bz, id) => {
        if (id === BlockId.LEAVES && world.getBlock(bx, by, bz) !== BlockId.AIR) {
          return;
        }
        world.setBlock(bx, by, bz, id);
      });
    });
  }
}
