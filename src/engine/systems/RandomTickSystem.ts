import { BlockId, getBlock } from '../blocks/BlockRegistry';
import { COCOA_MAX_STAGE, COCOA_STAGE_SHIFT, FACING_MASK } from '../blocks/blockShapes';
import { CHUNK_SIZE, SECTION_COUNT, SECTION_HEIGHT, WORLD_SIZE_Y } from '../constants/world';
import { toChunkCoord } from '../world/Chunk';
import { unpackPos } from '../world/posKey';
import { BlockPositionTracker } from '../world/BlockPositionTracker';
import type { World } from '../world/World';
import { CROP_MAX_STAGE, FARMLAND_MAX_MOISTURE } from '../blocks/blockShapes';
import {
  FIRE_CONSUME_CHANCE,
  FIRE_CONSUME_MIN_AGE,
  FIRE_MAX_AGE,
  FIRE_SPREAD_CHANCE,
  FIRE_TICK_INTERVAL,
} from '../constants/game';
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
/** 蘑菇：光照高于这个值就枯死，蔓延也只在暗处发生（1.8.9 是 12）。 */
const MUSHROOM_MAX_LIGHT = 12;
/** 可可果每次随机 tick 长一级的概率（1.8.9 为 1/5）。 */
const COCOA_GROW_CHANCE = 0.2;
/** 每次随机 tick 命中蘑菇时向外蔓延的概率。 */
const MUSHROOM_SPREAD_CHANCE = 0.25;
/** 蘑菇蔓延的水平半径。 */
const MUSHROOM_SPREAD_RANGE = 2;
const SAPLING_GROW_CHANCE = 0.15;
/** 树苗长大需要的净空高度。 */
const SAPLING_CLEARANCE = 6;
/** 树冠缺角随机种子的取值上限。 */
const MAX_TREE_SEED = 0xffffffff;
/** 六个方向（火的蔓延与判定用）。 */
const DIRS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
/** 仙人掌 / 甘蔗最高 3 格，每次随机 tick 有一定概率长一节。 */
const COLUMN_PLANT_MAX_HEIGHT = 3;
const COLUMN_PLANT_GROW_CHANCE = 0.12;
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
  /** 是否在下雨：露天的火会被浇灭。 */
  readonly isRaining: boolean;
}

/**
 * 随机 tick：每 tick 在玩家附近的每个已分配段里抽几个方块，交给对应的处理逻辑。
 * 草蔓延、树苗长大、作物生长、火焰蔓延这类"慢慢发生"的规则都挂在这里。
 */
export class RandomTickSystem {
  /** 当前世界里的火（火要按自己的节奏更新，随机 tick 太稀疏了）。 */
  private readonly fires: BlockPositionTracker;
  private readonly posOut = [0, 0, 0];
  private tickCount = 0;

  constructor(private readonly host: RandomTickHost) {
    this.fires = new BlockPositionTracker(host.world, BlockId.FIRE);
  }

  /** 按固定间隔更新所有火（每游戏 tick 调用一次）。 */
  private tickFires(): void {
    this.tickCount++;
    if (this.tickCount % FIRE_TICK_INTERVAL !== 0 || this.fires.size === 0) {
      return;
    }
    for (const key of [...this.fires.positions]) {
      unpackPos(key, this.posOut);
      this.tickBlock(this.posOut[0], this.posOut[1], this.posOut[2]);
    }
  }

  /** 跑一轮随机 tick（每游戏 tick 调用一次）。 */
  tick(playerX: number, playerZ: number): void {
    this.tickFires();
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
    const id = this.host.world.getBlock(x, y, z);
    if (getBlock(id).crop) {
      this.tickCrop(x, y, z);
      return;
    }
    switch (id) {
      case BlockId.GRASS:
        this.tickGrass(x, y, z);
        break;
      case BlockId.DIRT:
        this.trySpreadGrassOnto(x, y, z);
        break;
      case BlockId.SAPLING:
        this.tickSapling(x, y, z);
        break;
      case BlockId.COCOA:
        this.tickCocoa(x, y, z);
        break;
      case BlockId.BROWN_MUSHROOM:
      case BlockId.RED_MUSHROOM:
        this.tickMushroom(x, y, z, id);
        break;
      case BlockId.FARMLAND:
        this.tickFarmland(x, y, z);
        break;
      case BlockId.FIRE:
        this.tickFire(x, y, z);
        break;
      case BlockId.CACTUS:
      case BlockId.SUGAR_CANE:
        this.tickColumnPlant(x, y, z, id);
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

  /** 可可果：随机 tick 慢慢长熟（1.8.9 每次 1/5 的机会长一级）。 */
  private tickCocoa(x: number, y: number, z: number): void {
    const world = this.host.world;
    const meta = world.getMeta(x, y, z);
    const stage = meta >> COCOA_STAGE_SHIFT;
    if (stage >= COCOA_MAX_STAGE || this.host.random() > COCOA_GROW_CHANCE) {
      return;
    }
    world.setBlock(x, y, z, BlockId.COCOA, (meta & FACING_MASK) | ((stage + 1) << COCOA_STAGE_SHIFT));
  }

  /** 蘑菇：太亮就枯掉，否则有概率往附近的暗处蔓延一株。 */
  private tickMushroom(x: number, y: number, z: number, id: number): void {
    const world = this.host.world;
    if (this.host.lightLevelAt(x, y, z) > MUSHROOM_MAX_LIGHT) {
      world.setBlock(x, y, z, BlockId.AIR);
      return;
    }
    if (this.host.random() > MUSHROOM_SPREAD_CHANCE) {
      return;
    }
    const range = MUSHROOM_SPREAD_RANGE * 2 + 1;
    const nx = x + Math.floor(this.host.random() * range) - MUSHROOM_SPREAD_RANGE;
    const nz = z + Math.floor(this.host.random() * range) - MUSHROOM_SPREAD_RANGE;
    const ny = y + Math.floor(this.host.random() * 3) - 1;
    if (ny < 1 || ny >= WORLD_SIZE_Y) {
      return;
    }
    if (world.getBlock(nx, ny, nz) !== BlockId.AIR || this.host.lightLevelAt(nx, ny, nz) > MUSHROOM_MAX_LIGHT) {
      return;
    }
    // 得站在不透光的实心方块上
    const ground = getBlock(world.getBlock(nx, ny - 1, nz));
    if (!ground.solid || !ground.opaque) {
      return;
    }
    world.setBlock(nx, ny, nz, id);
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
    const crop = getBlock(world.getBlock(x, y, z)).crop;
    if (!crop) {
      return;
    }
    const stage = world.getMeta(x, y, z);
    if (stage >= (crop.maxStage ?? CROP_MAX_STAGE)) {
      return;
    }
    if (crop.needsLight !== false && this.host.lightLevelAt(x, y, z) < CROP_MIN_LIGHT) {
      return;
    }
    // 湿耕地长得快；种在别的土壤上（下界疣）按干地速度
    const wet = world.getBlock(x, y - 1, z) === BlockId.FARMLAND && world.getMeta(x, y - 1, z) > 0;
    if (this.host.random() >= (wet ? CROP_GROW_CHANCE_WET : CROP_GROW_CHANCE_DRY)) {
      return;
    }
    world.setMeta(x, y, z, stage + 1);
  }

  /**
   * 火：没有支撑也没有可燃邻居就熄灭；否则慢慢变老，
   * 有几率烧掉脚下的可燃方块，并向旁边紧挨可燃方块的空气蔓延。
   */
  private tickFire(x: number, y: number, z: number): void {
    const world = this.host.world;
    // 下雨浇灭露天的火：火本来就按固定间隔更新，顺手在这里判断，不用另扫一遍地表
    if (this.host.isRaining && world.getHeight(x, z) === y) {
      world.setBlock(x, y, z, BlockId.AIR);
      return;
    }
    const belowDef = getBlock(world.getBlock(x, y - 1, z));
    const hasFuel = this.hasFlammableNeighbor(x, y, z);
    if (!belowDef.solid && !hasFuel) {
      world.setBlock(x, y, z, BlockId.AIR);
      return;
    }
    const age = world.getMeta(x, y, z);
    if (age >= FIRE_MAX_AGE) {
      if (!hasFuel) {
        world.setBlock(x, y, z, BlockId.AIR);
        return;
      }
    } else {
      world.setMeta(x, y, z, age + 1);
    }
    // 每次只朝一个随机方向尝试蔓延，避免火势爆炸式扩散
    const [dx, dy, dz] = DIRS[Math.floor(this.host.random() * DIRS.length)];
    const tx = x + dx;
    const ty = y + dy;
    const tz = z + dz;
    if (
      world.getBlock(tx, ty, tz) === BlockId.AIR &&
      this.hasFlammableNeighbor(tx, ty, tz) &&
      this.host.random() < FIRE_SPREAD_CHANCE
    ) {
      world.setBlock(tx, ty, tz, BlockId.FIRE, 0);
    }
    // 烧久了才会把脚下的方块吃掉，否则火还没来得及蔓延就把自己的燃料烧没了
    if (belowDef.flammable && age >= FIRE_CONSUME_MIN_AGE && this.host.random() < FIRE_CONSUME_CHANCE) {
      world.setBlock(x, y - 1, z, BlockId.AIR);
    }
  }

  /**
   * 仙人掌 / 甘蔗：只有最顶上那一节会长高，且总高度不超过 3 格（与 1.8.9 一致）。
   */
  private tickColumnPlant(x: number, y: number, z: number, id: number): void {
    const world = this.host.world;
    if (world.getBlock(x, y + 1, z) !== BlockId.AIR) {
      return;
    }
    let height = 1;
    while (height < COLUMN_PLANT_MAX_HEIGHT && world.getBlock(x, y - height, z) === id) {
      height++;
    }
    if (height >= COLUMN_PLANT_MAX_HEIGHT || this.host.random() >= COLUMN_PLANT_GROW_CHANCE) {
      return;
    }
    world.setBlock(x, y + 1, z, id);
  }

  /** 六邻中是否有可燃方块。 */
  private hasFlammableNeighbor(x: number, y: number, z: number): boolean {
    for (const [dx, dy, dz] of DIRS) {
      if (getBlock(this.host.world.getBlock(x + dx, y + dy, z + dz)).flammable) {
        return true;
      }
    }
    return false;
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
    // 树苗的 meta 决定长出哪种木材的树
    const wood = world.getMeta(x, y, z);
    const tree = { x, y, z, height, wood, cornerSeed: Math.floor(this.host.random() * MAX_TREE_SEED) };
    world.batch(() => {
      world.setBlock(x, y, z, BlockId.AIR);
      forEachTreeBlock(tree, (bx, by, bz, id, meta) => {
        if (id === BlockId.LEAVES && world.getBlock(bx, by, bz) !== BlockId.AIR) {
          return;
        }
        world.setBlock(bx, by, bz, id, meta);
      });
    });
  }
}
