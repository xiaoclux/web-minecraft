import { createNoise2D, createNoise3D } from 'simplex-noise';
import { BlockId } from '../blocks/BlockRegistry';
import { CHUNK_SIZE, SEA_LEVEL, WORLD_SIZE_Y } from '../constants/world';
import { createRng, hashCoords, hashString } from '../textures/PixelCanvas';
import type { Chunk } from './Chunk';
import type { ChunkGenerator, SpawnPoint } from './ChunkGenerator';
import { VillageGenerator, VillageStyle } from './structures/VillageGenerator';

/** 群系。 */
export const Biome = {
  PLAINS: 'plains',
  FOREST: 'forest',
  DESERT: 'desert',
  MOUNTAINS: 'mountains',
  SNOWY: 'snowy',
} as const;
export type Biome = (typeof Biome)[keyof typeof Biome];

const BASE_HEIGHT = SEA_LEVEL + 2;
const CONTINENT_SCALE = 1 / 180;
const HILL_SCALE = 1 / 48;
const DETAIL_SCALE = 1 / 14;
const CONTINENT_AMPLITUDE = 18;
const HILL_AMPLITUDE = 6;
const DETAIL_AMPLITUDE = 2;
const MOUNTAIN_EXTRA = 30;
const MOUNTAIN_THRESHOLD = 0.55;
const BIOME_SCALE = 1 / 120;
const CAVE_SCALE = 1 / 22;
const CAVE_Y_STRETCH = 1.6;
const CAVE_THRESHOLD = 0.62;
const CAVE_MIN_Y = 4;
const CAVE_MAX_DEPTH_BELOW_SURFACE = 4;
const DIRT_DEPTH = 3;
const SAND_DEPTH = 4;
const BEDROCK_JITTER_CHANCE = 0.4;
/** 山地积雪的最低高度。 */
const SNOW_HEIGHT = SEA_LEVEL + 18;
const MOUNTAIN_STONE_SURFACE_CHANCE = 0.35;
const UNDERWATER_SAND_CHANCE = 0.6;
const MIN_TERRAIN_HEIGHT = 2;
const MAX_TERRAIN_HEIGHT = WORLD_SIZE_Y - 3;

/** 位置哈希的盐，用来区分同一坐标上的不同随机用途。 */
const Salt = {
  COLUMN: 1,
  ORES: 2,
  TREES: 3,
  PLANTS: 4,
} as const;

/** 矿脉配置。 */
interface OreConfig {
  block: number;
  minY: number;
  maxY: number;
  /** 每 chunk 尝试次数。 */
  attempts: number;
  size: number;
}
/** 矿脉分布高度取自 1.8.9（煤 ≤128、铁 ≤64、金 ≤32、钻石 ≤16）。 */
const ORES: OreConfig[] = [
  { block: BlockId.COAL_ORE, minY: 5, maxY: 128, attempts: 20, size: 10 },
  { block: BlockId.IRON_ORE, minY: 2, maxY: 64, attempts: 16, size: 6 },
  { block: BlockId.GOLD_ORE, minY: 2, maxY: 32, attempts: 3, size: 5 },
  { block: BlockId.DIAMOND_ORE, minY: 1, maxY: 16, attempts: 2, size: 5 },
  { block: BlockId.GRAVEL, minY: 4, maxY: 60, attempts: 8, size: 12 },
];

const TREE_MIN_HEIGHT = 4;
const TREE_HEIGHT_VARIANCE = 3;
const TREE_CANOPY_RADIUS = 2;
const TREE_CHANCE: Record<Biome, number> = { plains: 0.003, forest: 0.05, desert: 0, mountains: 0.006, snowy: 0.012 };
/** 树概率上限：随机数超过它的列不用再查群系。 */
const MAX_TREE_CHANCE = Math.max(...Object.values(TREE_CHANCE));
const GRASS_CHANCE: Record<Biome, number> = { plains: 0.08, forest: 0.06, desert: 0, mountains: 0.02, snowy: 0 };
const FLOWER_CHANCE: Record<Biome, number> = { plains: 0.012, forest: 0.008, desert: 0, mountains: 0.003, snowy: 0 };
const PUMPKIN_CHANCE = 0.0006;
/** 出生点搜索半径与步长。 */
const SPAWN_SEARCH_RADIUS = 256;
const SPAWN_SEARCH_STEP = 2;

/** 一列的噪声派生信息。 */
interface ColumnInfo {
  height: number;
  biome: Biome;
}
/** 列缓存键的坐标偏移 / 跨度与容量（约 6 个 chunk 邻域的列数）。 */
const COLUMN_KEY_OFFSET = 1 << 25;
const COLUMN_KEY_SPAN = 1 << 26;
const COLUMN_CACHE_LIMIT = 16384;

/** 一棵树的确定性描述。 */
export interface TreePlacement {
  x: number;
  /** 树干底部 y。 */
  y: number;
  z: number;
  height: number;
  /** 树冠四角是否缺失（按 [dy 层][角序号] 展开成一维，供裁剪时复现）。 */
  cornerSeed: number;
}

/**
 * 无限世界生成器：噪声地形 + 群系 + 洞穴 + 矿石 + 植被。
 * 全部随机来自 (seed, 位置) 的哈希，因此每个 chunk 独立且可复现。
 */
export class TerrainGenerator implements ChunkGenerator {
  private readonly base: number;
  private readonly continent: (x: number, y: number) => number;
  private readonly hills: (x: number, y: number) => number;
  private readonly detail: (x: number, y: number) => number;
  private readonly temperature: (x: number, y: number) => number;
  private readonly humidity: (x: number, y: number) => number;
  private readonly cave: (x: number, y: number, z: number) => number;
  /** 村庄生成器（关闭结构时为 null）。 */
  readonly villages: VillageGenerator | null;
  private readonly columnCache = new Map<number, ColumnInfo>();

  constructor(
    readonly seed: string,
    generateStructures = true,
  ) {
    this.base = hashString(seed);
    this.continent = createNoise2D(createRng(this.base + 1));
    this.hills = createNoise2D(createRng(this.base + 2));
    this.detail = createNoise2D(createRng(this.base + 3));
    this.temperature = createNoise2D(createRng(this.base + 4));
    this.humidity = createNoise2D(createRng(this.base + 5));
    this.cave = createNoise3D(createRng(this.base + 6));
    this.villages = generateStructures
      ? new VillageGenerator(
          seed,
          (x, z) => this.heightAt(x, z),
          (x, z) => this.villageStyleAt(x, z),
        )
      : null;
  }

  /** 村庄只出现在海面之上的平原 / 沙漠。 */
  private villageStyleAt(x: number, z: number): VillageStyle | null {
    if (this.heightAt(x, z) <= SEA_LEVEL + 1) {
      return null;
    }
    const biome = this.biomeAt(x, z);
    if (biome === Biome.PLAINS) {
      return VillageStyle.PLAINS;
    }
    if (biome === Biome.DESERT) {
      return VillageStyle.DESERT;
    }
    return null;
  }

  /** 某列是否被村庄建筑占用。 */
  private isReservedColumn(x: number, z: number): boolean {
    return this.villages?.isReserved(x, z) ?? false;
  }

  /** 位置相关的确定性随机数生成器。 */
  rngAt(x: number, z: number, salt: number): () => number {
    return createRng(hashCoords(this.base, x, z, salt));
  }

  /** 计算群系。 */
  biomeAt(x: number, z: number): Biome {
    return this.column(x, z).biome;
  }

  /** 计算地表高度（最高实心方块的 y）。 */
  heightAt(x: number, z: number): number {
    return this.column(x, z).height;
  }

  /**
   * 一列的噪声信息（高度 + 群系），5 个 2D 噪声只算一次并缓存。
   * 缓存以最近使用的列为主，超出容量即清空——同一 chunk 生成期间的 3×3 邻域访问全部命中。
   */
  private column(x: number, z: number): ColumnInfo {
    const key = (x + COLUMN_KEY_OFFSET) * COLUMN_KEY_SPAN + (z + COLUMN_KEY_OFFSET);
    const cached = this.columnCache.get(key);
    if (cached) {
      return cached;
    }
    const c = this.continent(x * CONTINENT_SCALE, z * CONTINENT_SCALE);
    const h = this.hills(x * HILL_SCALE, z * HILL_SCALE);
    const d = this.detail(x * DETAIL_SCALE, z * DETAIL_SCALE);
    let height = BASE_HEIGHT + c * CONTINENT_AMPLITUDE + h * HILL_AMPLITUDE + d * DETAIL_AMPLITUDE;
    if (c > MOUNTAIN_THRESHOLD) {
      const m = (c - MOUNTAIN_THRESHOLD) / (1 - MOUNTAIN_THRESHOLD);
      height += m * m * MOUNTAIN_EXTRA + Math.abs(h) * 6;
    }
    const t = this.temperature(x * BIOME_SCALE, z * BIOME_SCALE);
    const hum = this.humidity(x * BIOME_SCALE + 100, z * BIOME_SCALE + 100);
    let biome: Biome;
    if (c > MOUNTAIN_THRESHOLD) {
      biome = t < -0.2 ? Biome.SNOWY : Biome.MOUNTAINS;
    } else if (t > 0.45 && hum < 0) {
      biome = Biome.DESERT;
    } else if (t < -0.5) {
      biome = Biome.SNOWY;
    } else {
      biome = hum > 0.1 ? Biome.FOREST : Biome.PLAINS;
    }
    const info: ColumnInfo = {
      height: Math.max(MIN_TERRAIN_HEIGHT, Math.min(MAX_TERRAIN_HEIGHT, Math.floor(height))),
      biome,
    };
    if (this.columnCache.size >= COLUMN_CACHE_LIMIT) {
      this.columnCache.clear();
    }
    this.columnCache.set(key, info);
    return info;
  }

  /** 该列的地表方块（与 generateColumn 一致，供结构/植被判断，不读取方块数据）。 */
  surfaceBlockAt(x: number, z: number): number {
    return this.surfaceBlock(this.biomeAt(x, z), this.heightAt(x, z), this.rngAt(x, z, Salt.COLUMN));
  }

  /** 生成一个 chunk：地形列 → 矿脉 → 3×3 邻域的树（裁剪）→ 本 chunk 的草花 → 结构。 */
  generateChunk(chunk: Chunk): void {
    const x0 = chunk.originX;
    const z0 = chunk.originZ;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const x = x0 + lx;
        const z = z0 + lz;
        this.generateColumn(chunk, lx, lz, this.heightAt(x, z), this.biomeAt(x, z), this.rngAt(x, z, Salt.COLUMN));
      }
    }
    this.generateOres(chunk);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const tree of this.listTrees(chunk.cx + dx, chunk.cz + dz)) {
          this.placeTree(chunk, tree);
        }
      }
    }
    this.generatePlants(chunk);
    this.villages?.placeInChunk(chunk);
  }

  private generateColumn(chunk: Chunk, lx: number, lz: number, height: number, biome: Biome, rng: () => number): void {
    const x = chunk.originX + lx;
    const z = chunk.originZ + lz;
    // 顺序固定：先取地表/土层用的随机数，再逐层填充，保证 surfaceBlockAt 与此处一致
    const surface = this.surfaceBlock(biome, height, rng);
    const bedrockJitter = rng() < BEDROCK_JITTER_CHANCE;
    const underwaterFill = rng() < 0.5 ? BlockId.SAND : BlockId.DIRT;
    for (let y = 0; y <= height; y++) {
      let id: number = BlockId.STONE;
      if (y === 0 || (y === 1 && bedrockJitter)) {
        id = BlockId.BEDROCK;
      } else if (y > CAVE_MIN_Y && y < height - CAVE_MAX_DEPTH_BELOW_SURFACE && this.isCave(x, y, z)) {
        id = BlockId.AIR;
      } else if (biome === Biome.DESERT && y > height - SAND_DEPTH) {
        id = y > height - 2 ? BlockId.SAND : BlockId.SANDSTONE;
      } else if (y === height) {
        id = surface;
      } else if (y > height - DIRT_DEPTH) {
        id = height < SEA_LEVEL ? underwaterFill : BlockId.DIRT;
      }
      chunk.setLocal(lx, y, lz, id);
    }
    for (let y = height + 1; y <= SEA_LEVEL; y++) {
      chunk.setLocal(lx, y, lz, BlockId.WATER);
    }
    if (biome === Biome.SNOWY && height >= SEA_LEVEL && height + 1 < WORLD_SIZE_Y) {
      chunk.setLocal(lx, height + 1, lz, BlockId.SNOW);
    }
  }

  private surfaceBlock(biome: Biome, height: number, rng: () => number): number {
    const roll = rng();
    if (height < SEA_LEVEL) {
      return roll < UNDERWATER_SAND_CHANCE ? BlockId.SAND : BlockId.GRAVEL;
    }
    if (height <= SEA_LEVEL + 1) {
      return BlockId.SAND;
    }
    if (biome === Biome.MOUNTAINS && height > SNOW_HEIGHT) {
      return BlockId.STONE;
    }
    if (biome === Biome.MOUNTAINS && roll < MOUNTAIN_STONE_SURFACE_CHANCE) {
      return BlockId.STONE;
    }
    return BlockId.GRASS;
  }

  private isCave(x: number, y: number, z: number): boolean {
    const n = this.cave(x * CAVE_SCALE, y * CAVE_SCALE * CAVE_Y_STRETCH, z * CAVE_SCALE);
    return n > CAVE_THRESHOLD;
  }

  private generateOres(chunk: Chunk): void {
    const rng = this.rngAt(chunk.cx, chunk.cz, Salt.ORES);
    for (const ore of ORES) {
      for (let i = 0; i < ore.attempts; i++) {
        const x = chunk.originX + Math.floor(rng() * CHUNK_SIZE);
        const z = chunk.originZ + Math.floor(rng() * CHUNK_SIZE);
        const y = ore.minY + Math.floor(rng() * (ore.maxY - ore.minY));
        this.placeVein(chunk, x, y, z, ore, rng);
      }
    }
  }

  private placeVein(chunk: Chunk, x: number, y: number, z: number, ore: OreConfig, rng: () => number): void {
    let px = x;
    let py = y;
    let pz = z;
    for (let i = 0; i < ore.size; i++) {
      if (chunk.getWorld(px, py, pz) === BlockId.STONE) {
        chunk.setWorld(px, py, pz, ore.block);
      }
      px += Math.floor(rng() * 3) - 1;
      py += Math.floor(rng() * 3) - 1;
      pz += Math.floor(rng() * 3) - 1;
    }
  }

  /** 某列是否长草地植被：地表为草方块、在海面之上、未被结构占用。 */
  private isVegetationColumn(x: number, z: number): boolean {
    if (this.isReservedColumn(x, z)) {
      return false;
    }
    return this.surfaceBlockAt(x, z) === BlockId.GRASS;
  }

  /**
   * 列出某 chunk 内确定性生成的树。只依赖噪声与哈希，不读取方块，
   * 因此任何相邻 chunk 都能复现同一棵树并只写入自己范围内的部分。
   */
  listTrees(cx: number, cz: number): TreePlacement[] {
    const rng = this.rngAt(cx, cz, Salt.TREES);
    const out: TreePlacement[] = [];
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        // 每列固定消耗 3 个随机数，保证列间独立
        const roll = rng();
        const heightRoll = rng();
        const cornerSeed = Math.floor(rng() * 0xffffffff);
        if (roll >= MAX_TREE_CHANCE) {
          continue;
        }
        const x = x0 + lx;
        const z = z0 + lz;
        const biome = this.biomeAt(x, z);
        if (roll >= TREE_CHANCE[biome] || !this.isVegetationColumn(x, z)) {
          continue;
        }
        const y = this.heightAt(x, z) + 1;
        const height = TREE_MIN_HEIGHT + Math.floor(heightRoll * TREE_HEIGHT_VARIANCE);
        if (y + height + 2 >= WORLD_SIZE_Y) {
          continue;
        }
        out.push({ x, y, z, height, cornerSeed });
      }
    }
    return out;
  }

  /** 把一棵树落在 chunk 内的部分写入（树干覆盖树叶，树叶只填空气）。 */
  placeTree(chunk: Chunk, tree: TreePlacement): void {
    const cornerRng = createRng(tree.cornerSeed);
    for (let dy = tree.height - 3; dy <= tree.height; dy++) {
      const radius = dy >= tree.height - 1 ? 1 : TREE_CANOPY_RADIUS;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const isCorner = Math.abs(dx) === radius && Math.abs(dz) === radius;
          // 角落缺失的随机数必须无条件消耗，保证不同 chunk 复现同一形状
          const cornerMissing = isCorner && (radius === 1 || cornerRng() < 0.5);
          if (cornerMissing) {
            continue;
          }
          const x = tree.x + dx;
          const y = tree.y + dy;
          const z = tree.z + dz;
          if (chunk.getWorld(x, y, z) === BlockId.AIR) {
            chunk.setWorld(x, y, z, BlockId.LEAVES);
          }
        }
      }
    }
    for (let i = 0; i < tree.height; i++) {
      chunk.setWorld(tree.x, tree.y + i, tree.z, BlockId.LOG);
    }
  }

  private generatePlants(chunk: Chunk): void {
    const rng = this.rngAt(chunk.cx, chunk.cz, Salt.PLANTS);
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const roll = rng();
        const flowerRoll = rng();
        const x = chunk.originX + lx;
        const z = chunk.originZ + lz;
        const h = this.heightAt(x, z);
        if (
          h + 1 >= WORLD_SIZE_Y ||
          chunk.getLocal(lx, h, lz) !== BlockId.GRASS ||
          chunk.getLocal(lx, h + 1, lz) !== BlockId.AIR
        ) {
          continue;
        }
        if (this.isReservedColumn(x, z)) {
          continue;
        }
        const biome = this.biomeAt(x, z);
        const treeChance = TREE_CHANCE[biome];
        const grassEnd = treeChance + GRASS_CHANCE[biome];
        const flowerEnd = grassEnd + FLOWER_CHANCE[biome];
        if (roll < treeChance) {
          continue;
        }
        if (roll < grassEnd) {
          chunk.setLocal(lx, h + 1, lz, BlockId.TALL_GRASS);
        } else if (roll < flowerEnd) {
          chunk.setLocal(lx, h + 1, lz, flowerRoll < 0.5 ? BlockId.DANDELION : BlockId.POPPY);
        } else if (roll < flowerEnd + PUMPKIN_CHANCE) {
          chunk.setLocal(lx, h + 1, lz, BlockId.PUMPKIN);
        }
      }
    }
  }

  /** 绕原点螺旋搜索海面之上的草地作为出生点。 */
  findSpawn(): SpawnPoint {
    for (let r = 0; r <= SPAWN_SEARCH_RADIUS; r += SPAWN_SEARCH_STEP) {
      for (let dx = -r; dx <= r; dx += SPAWN_SEARCH_STEP) {
        for (let dz = -r; dz <= r; dz += SPAWN_SEARCH_STEP) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) {
            continue;
          }
          const h = this.heightAt(dx, dz);
          if (h > SEA_LEVEL && this.surfaceBlockAt(dx, dz) === BlockId.GRASS && !this.isCave(dx, h + 1, dz)) {
            return { x: dx + 0.5, y: h + 1, z: dz + 0.5 };
          }
        }
      }
    }
    return { x: 0.5, y: this.heightAt(0, 0) + 1, z: 0.5 };
  }
}
