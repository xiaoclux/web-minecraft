import { BlockId } from '../../blocks/BlockRegistry';
import { CHUNK_SIZE } from '../../constants/world';
import { MobType } from '../../entities/MobDefs';
import { createRng, hashCoords, hashString } from '../../textures/PixelCanvas';
import { chunkKey, type Chunk } from '../Chunk';
import { LootTable } from './LootTables';
import {
  boundsIntersectXZ,
  chunkBounds,
  placeBlocksInChunk,
  StructureBuilder,
  type Bounds,
  type StructureBlock,
} from './StructureBuilder';

/** 矿井按格子分布：每 GRID 个 chunk 的方格里最多一座。 */
const MINESHAFT_GRID_CHUNKS = 12;
/** 一个格子里真的长出矿井的概率。 */
const MINESHAFT_CHANCE = 0.5;
/** 主巷道所在的 y 范围。 */
const MIN_Y = 12;
const MAX_Y = 44;
/** 巷道尺寸：内部 3 宽 3 高。 */
const CORRIDOR_HALF_WIDTH = 1;
const CORRIDOR_HEIGHT = 3;
/** 主巷道长度与分支数。 */
const MAIN_LENGTH = 56;
const BRANCH_COUNT = 4;
const BRANCH_MIN_LENGTH = 12;
const BRANCH_MAX_LENGTH = 28;
/** 每隔几格架一组木支撑。 */
const SUPPORT_SPACING = 5;
/** 巷道里各种小东西的概率。 */
const COBWEB_CHANCE = 0.06;
const CHEST_CHANCE = 0.02;
const SPAWNER_CHANCE = 0.012;
/** 分支相对主巷道的最大高度差。 */
const BRANCH_Y_JITTER = 3;
const SALT_MINESHAFT = 733;
/** 木支撑立在巷道的两侧壁上；模块级冻结数组避免每个支撑点都新建临时数组。 */
const SUPPORT_SIDES: readonly number[] = Object.freeze([-CORRIDOR_HALF_WIDTH, CORRIDOR_HALF_WIDTH]);

/** 一段巷道：从 (x, y, z) 起沿某个水平方向铺 length 格。 */
interface Corridor {
  x: number;
  y: number;
  z: number;
  /** false = 沿 +x 延伸，true = 沿 +z 延伸。 */
  alongZ: boolean;
  length: number;
  seed: number;
  /** 掷种时一次性生成的全部方块，各 chunk 只做裁剪写入，不再重复搭建。 */
  blocks: StructureBlock[];
  /** 战利品箱 / 刷怪笼，同样在掷种时定下位置。 */
  props: CorridorProp[];
  bounds: Bounds;
}

/** 巷道里的一个道具（箱子或洞穴蜘蛛刷怪笼）。 */
interface CorridorProp {
  x: number;
  y: number;
  z: number;
  kind: 'chest' | 'spawner';
}

/** 一座废弃矿井。 */
interface Mineshaft {
  corridors: Corridor[];
  /** 全部巷道的 XZ 包围盒，用来快速跳过不相干的 chunk。 */
  bounds: Bounds;
}

/**
 * 废弃矿井：地下纵横的木撑巷道，铺着铁轨，挂着蜘蛛网，
 * 偶尔有战利品箱和洞穴蜘蛛刷怪笼（1.8.9 的洞穴蜘蛛只在这里刷）。
 *
 * 和其他结构一样只由 (seed, 格子坐标) 决定，chunk 可以随时丢弃再生。
 */
export class MineshaftGenerator {
  private readonly baseSeed: number;
  private readonly cache = new Map<number, Mineshaft | null>();

  constructor(seed: string) {
    this.baseSeed = hashString(seed);
  }

  /** 某个格子里的矿井（没有则为 null）。 */
  private mineshaftAt(cellX: number, cellZ: number): Mineshaft | null {
    // 与其它结构生成器保持一致，格子坐标复用 chunkKey 编码
    const key = chunkKey(cellX, cellZ);
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const shaft = this.roll(cellX, cellZ);
    this.cache.set(key, shaft);
    return shaft;
  }

  private roll(cellX: number, cellZ: number): Mineshaft | null {
    const rng = createRng(hashCoords(this.baseSeed, cellX, cellZ, SALT_MINESHAFT));
    if (rng() >= MINESHAFT_CHANCE) {
      return null;
    }
    const span = MINESHAFT_GRID_CHUNKS * CHUNK_SIZE;
    const originX = cellX * span + Math.floor(rng() * span);
    const originZ = cellZ * span + Math.floor(rng() * span);
    const y = MIN_Y + Math.floor(rng() * (MAX_Y - MIN_Y));
    const mainAlongZ = rng() < 0.5;
    const corridors: Corridor[] = [
      buildCorridor(originX, y, originZ, mainAlongZ, MAIN_LENGTH, Math.floor(rng() * 0xffffffff)),
    ];
    for (let i = 0; i < BRANCH_COUNT; i++) {
      // 分支从主巷道上的某一点垂直岔出去，高度略有起伏
      const offset = Math.floor(rng() * MAIN_LENGTH);
      const length = BRANCH_MIN_LENGTH + Math.floor(rng() * (BRANCH_MAX_LENGTH - BRANCH_MIN_LENGTH));
      const back = rng() < 0.5;
      const branchY = y + Math.floor(rng() * (BRANCH_Y_JITTER * 2 + 1)) - BRANCH_Y_JITTER;
      // 分支与主巷道垂直：主巷道沿 z 则分支沿 x，反之亦然；
      // 巷道只朝正方向铺，所以"往负方向岔"就是把起点整体挪回 length 格
      const shift = back ? -length : 0;
      const startX = mainAlongZ ? originX + shift : originX + offset;
      const startZ = mainAlongZ ? originZ + offset : originZ + shift;
      corridors.push(buildCorridor(startX, branchY, startZ, !mainAlongZ, length, Math.floor(rng() * 0xffffffff)));
    }
    const bounds: Bounds = { ...corridors[0].bounds };
    for (const c of corridors) {
      bounds.minX = Math.min(bounds.minX, c.bounds.minX);
      bounds.maxX = Math.max(bounds.maxX, c.bounds.maxX);
      bounds.minZ = Math.min(bounds.minZ, c.bounds.minZ);
      bounds.maxZ = Math.max(bounds.maxZ, c.bounds.maxZ);
    }
    return { corridors, bounds };
  }

  /** 把可能影响该 chunk 的矿井写进去。 */
  placeInChunk(chunk: Chunk): void {
    const cellX = Math.floor(chunk.cx / MINESHAFT_GRID_CHUNKS);
    const cellZ = Math.floor(chunk.cz / MINESHAFT_GRID_CHUNKS);
    const bounds = chunkBounds(chunk);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const shaft = this.mineshaftAt(cellX + dx, cellZ + dz);
        if (!shaft || !boundsIntersectXZ(shaft.bounds, bounds)) {
          continue;
        }
        for (const corridor of shaft.corridors) {
          // 巷道方块早已缓存，这里只按包围盒裁剪，不与本 chunk 相交的整段跳过
          if (!boundsIntersectXZ(corridor.bounds, bounds)) {
            continue;
          }
          placeBlocksInChunk(chunk, corridor.blocks);
          placeProps(chunk, corridor.props);
        }
      }
    }
  }
}

/** 搭一段巷道：掏空、铺地板与铁轨、架木支撑、挂蜘蛛网，再定下箱子与刷怪笼的位置。 */
function buildCorridor(x: number, y: number, z: number, alongZ: boolean, length: number, seed: number): Corridor {
  const rng = createRng(seed);
  const b = new StructureBuilder();
  for (let i = 0; i <= length; i++) {
    const cx = alongZ ? x : x + i;
    const cz = alongZ ? z + i : z;
    // 掏空巷道
    for (let dy = 0; dy < CORRIDOR_HEIGHT; dy++) {
      for (let w = -CORRIDOR_HALF_WIDTH; w <= CORRIDOR_HALF_WIDTH; w++) {
        const bx = alongZ ? cx + w : cx;
        const bz = alongZ ? cz : cz + w;
        b.set(bx, y + dy, bz, BlockId.AIR);
      }
    }
    // 地板：悬空处补木板，中间铺铁轨
    for (let w = -CORRIDOR_HALF_WIDTH; w <= CORRIDOR_HALF_WIDTH; w++) {
      const bx = alongZ ? cx + w : cx;
      const bz = alongZ ? cz : cz + w;
      b.set(bx, y - 1, bz, BlockId.PLANKS);
    }
    b.set(cx, y, cz, BlockId.RAIL, alongZ ? 1 : 0);
    // 每隔几格架一组木支撑：两侧立栅栏，顶上横一根木板梁
    if (i % SUPPORT_SPACING === 0) {
      for (const w of SUPPORT_SIDES) {
        const bx = alongZ ? cx + w : cx;
        const bz = alongZ ? cz : cz + w;
        b.set(bx, y, bz, BlockId.FENCE);
        b.set(bx, y + 1, bz, BlockId.FENCE);
        b.set(bx, y + CORRIDOR_HEIGHT - 1, bz, BlockId.PLANKS);
      }
      b.set(cx, y + CORRIDOR_HEIGHT - 1, cz, BlockId.PLANKS);
    }
    // 零零散散的蜘蛛网
    if (rng() < COBWEB_CHANCE) {
      const w = Math.floor(rng() * 3) - 1;
      const bx = alongZ ? cx + w : cx;
      const bz = alongZ ? cz : cz + w;
      b.set(bx, y + 1, bz, BlockId.COBWEB);
    }
  }
  const props = rollProps(x, y, z, alongZ, length, rng);
  // 包围盒按巷道走向撑开并外扩 1 格（两侧壁的支撑柱与蜘蛛网都在这一圈里）
  const endX = x + (alongZ ? 0 : length);
  const endZ = z + (alongZ ? length : 0);
  const bounds: Bounds = {
    minX: Math.min(x, endX) - CORRIDOR_HALF_WIDTH - 1,
    maxX: Math.max(x, endX) + CORRIDOR_HALF_WIDTH + 1,
    minZ: Math.min(z, endZ) - CORRIDOR_HALF_WIDTH - 1,
    maxZ: Math.max(z, endZ) + CORRIDOR_HALF_WIDTH + 1,
    minY: y - 1,
    maxY: y + CORRIDOR_HEIGHT - 1,
  };
  return { x, y, z, alongZ, length, seed, blocks: b.list(), props, bounds };
}

/** 沿巷道逐格掷骰决定箱子与刷怪笼；一次掷骰分段取值，箱子与刷怪笼互斥。 */
function rollProps(
  x: number,
  y: number,
  z: number,
  alongZ: boolean,
  length: number,
  rng: () => number,
): CorridorProp[] {
  const props: CorridorProp[] = [];
  for (let i = 0; i <= length; i++) {
    const cx = alongZ ? x : x + i;
    const cz = alongZ ? z + i : z;
    const r = rng();
    if (r < CHEST_CHANCE) {
      // 箱子靠在巷道一侧壁边
      const side = rng() < 0.5 ? -CORRIDOR_HALF_WIDTH : CORRIDOR_HALF_WIDTH;
      const bx = alongZ ? cx + side : cx;
      const bz = alongZ ? cz : cz + side;
      props.push({ x: bx, y, z: bz, kind: 'chest' });
      continue;
    }
    if (r < CHEST_CHANCE + SPAWNER_CHANCE) {
      props.push({ x: cx, y, z: cz, kind: 'spawner' });
    }
  }
  return props;
}

/** 把落在本 chunk 内的道具写入，并登记对应的方块实体。 */
function placeProps(chunk: Chunk, props: readonly CorridorProp[]): void {
  for (const p of props) {
    if (!chunk.containsColumn(p.x, p.z)) {
      continue;
    }
    if (p.kind === 'chest') {
      chunk.setWorld(p.x, p.y, p.z, BlockId.CHEST);
      chunk.pendingBlockEntities.push({ x: p.x, y: p.y, z: p.z, loot: LootTable.MINESHAFT });
      continue;
    }
    chunk.setWorld(p.x, p.y, p.z, BlockId.MOB_SPAWNER);
    chunk.pendingBlockEntities.push({ x: p.x, y: p.y, z: p.z, spawns: MobType.CAVE_SPIDER });
  }
}
