import { BlockId } from '../../blocks/BlockRegistry';
import { CHUNK_SIZE } from '../../constants/world';
import { MobType } from '../../entities/MobDefs';
import { createRng, hashCoords, hashString } from '../../textures/PixelCanvas';
import type { Chunk } from '../Chunk';
import { LootTable } from './LootTables';
import { placeBlocksInChunk, StructureBuilder } from './StructureBuilder';

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

/** 一段巷道：从 (x, y, z) 起沿某个水平方向铺 length 格。 */
interface Corridor {
  x: number;
  y: number;
  z: number;
  /** 0 = 沿 +x，1 = 沿 +z。 */
  alongZ: boolean;
  length: number;
  seed: number;
}

/** 一座废弃矿井。 */
interface Mineshaft {
  corridors: Corridor[];
  /** 全部巷道的 XZ 包围盒，用来快速跳过不相干的 chunk。 */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
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
    const key = cellX * 0x10000 + (cellZ & 0xffff);
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
      { x: originX, y, z: originZ, alongZ: mainAlongZ, length: MAIN_LENGTH, seed: Math.floor(rng() * 0xffffffff) },
    ];
    for (let i = 0; i < BRANCH_COUNT; i++) {
      // 分支从主巷道上的某一点垂直岔出去，高度略有起伏
      const offset = Math.floor(rng() * MAIN_LENGTH);
      const length = BRANCH_MIN_LENGTH + Math.floor(rng() * (BRANCH_MAX_LENGTH - BRANCH_MIN_LENGTH));
      const back = rng() < 0.5;
      const branchY = y + Math.floor(rng() * (BRANCH_Y_JITTER * 2 + 1)) - BRANCH_Y_JITTER;
      const startX = mainAlongZ ? originX : originX + offset;
      const startZ = mainAlongZ ? originZ + offset : originZ;
      corridors.push({
        x: back && !mainAlongZ ? startX : startX - (mainAlongZ && back ? length : 0),
        y: branchY,
        z: back && mainAlongZ ? startZ : startZ - (!mainAlongZ && back ? length : 0),
        alongZ: !mainAlongZ,
        length,
        seed: Math.floor(rng() * 0xffffffff),
      });
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const c of corridors) {
      const endX = c.x + (c.alongZ ? 0 : c.length);
      const endZ = c.z + (c.alongZ ? c.length : 0);
      minX = Math.min(minX, c.x - CORRIDOR_HALF_WIDTH - 1, endX - CORRIDOR_HALF_WIDTH - 1);
      maxX = Math.max(maxX, c.x + CORRIDOR_HALF_WIDTH + 1, endX + CORRIDOR_HALF_WIDTH + 1);
      minZ = Math.min(minZ, c.z - CORRIDOR_HALF_WIDTH - 1, endZ - CORRIDOR_HALF_WIDTH - 1);
      maxZ = Math.max(maxZ, c.z + CORRIDOR_HALF_WIDTH + 1, endZ + CORRIDOR_HALF_WIDTH + 1);
    }
    return { corridors, minX, maxX, minZ, maxZ };
  }

  /** 把可能影响该 chunk 的矿井写进去。 */
  placeInChunk(chunk: Chunk): void {
    const cellX = Math.floor(chunk.cx / MINESHAFT_GRID_CHUNKS);
    const cellZ = Math.floor(chunk.cz / MINESHAFT_GRID_CHUNKS);
    const x0 = chunk.originX;
    const z0 = chunk.originZ;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const shaft = this.mineshaftAt(cellX + dx, cellZ + dz);
        if (!shaft || shaft.maxX < x0 || shaft.minX >= x0 + CHUNK_SIZE || shaft.maxZ < z0 || shaft.minZ >= z0 + CHUNK_SIZE) {
          continue;
        }
        for (const corridor of shaft.corridors) {
          this.buildCorridor(chunk, corridor);
        }
      }
    }
  }

  private buildCorridor(chunk: Chunk, corridor: Corridor): void {
    const rng = createRng(corridor.seed);
    const b = new StructureBuilder();
    const { x, y, z, alongZ, length } = corridor;
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
      // 每隔几格架一组木支撑
      if (i % SUPPORT_SPACING === 0) {
        for (const w of [-CORRIDOR_HALF_WIDTH, CORRIDOR_HALF_WIDTH]) {
          const bx = alongZ ? cx + w : cx;
          const bz = alongZ ? cz : cz + w;
          b.set(bx, y, bz, BlockId.FENCE);
          b.set(bx, y + 1, bz, BlockId.FENCE);
          b.set(bx, y + CORRIDOR_HEIGHT - 1, bz, BlockId.PLANKS);
        }
        const beamX = alongZ ? cx : cx;
        const beamZ = alongZ ? cz : cz;
        b.set(beamX, y + CORRIDOR_HEIGHT - 1, beamZ, BlockId.PLANKS);
      }
      // 零零散散的蜘蛛网
      if (rng() < COBWEB_CHANCE) {
        const w = Math.floor(rng() * 3) - 1;
        const bx = alongZ ? cx + w : cx;
        const bz = alongZ ? cz : cz + w;
        b.set(bx, y + 1, bz, BlockId.COBWEB);
      }
    }
    placeBlocksInChunk(chunk, b.list());
    this.placeProps(chunk, corridor, rng);
  }

  /** 战利品箱与洞穴蜘蛛刷怪笼：只在本 chunk 内的那些格子上放。 */
  private placeProps(chunk: Chunk, corridor: Corridor, rng: () => number): void {
    const { x, y, z, alongZ, length } = corridor;
    for (let i = 0; i <= length; i++) {
      const cx = alongZ ? x : x + i;
      const cz = alongZ ? z + i : z;
      const chestRoll = rng();
      const spawnerRoll = rng();
      if (!chunk.containsColumn(cx, cz)) {
        continue;
      }
      if (chestRoll < CHEST_CHANCE) {
        const side = rng() < 0.5 ? -CORRIDOR_HALF_WIDTH : CORRIDOR_HALF_WIDTH;
        const bx = alongZ ? cx + side : cx;
        const bz = alongZ ? cz : cz + side;
        if (chunk.containsColumn(bx, bz)) {
          chunk.setWorld(bx, y, bz, BlockId.CHEST);
          chunk.pendingBlockEntities.push({ x: bx, y, z: bz, loot: LootTable.MINESHAFT });
        }
        continue;
      }
      if (spawnerRoll < SPAWNER_CHANCE) {
        chunk.setWorld(cx, y, cz, BlockId.MOB_SPAWNER);
        chunk.pendingBlockEntities.push({ x: cx, y, z: cz, spawns: MobType.CAVE_SPIDER });
      }
    }
  }
}
