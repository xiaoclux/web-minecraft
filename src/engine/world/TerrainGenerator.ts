import { createNoise2D, createNoise3D } from 'simplex-noise';
import { BlockId } from '../blocks/BlockRegistry';
import { SEA_LEVEL, WORLD_SIZE_Y } from '../constants/world';
import { createRng, hashString } from '../textures/PixelCanvas';
import type { World } from './World';

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
const CONTINENT_AMPLITUDE = 14;
const HILL_AMPLITUDE = 6;
const DETAIL_AMPLITUDE = 2;
const MOUNTAIN_EXTRA = 18;
const BIOME_SCALE = 1 / 120;
const CAVE_SCALE = 1 / 22;
const CAVE_THRESHOLD = 0.62;
const CAVE_MIN_Y = 4;
const CAVE_MAX_DEPTH_BELOW_SURFACE = 4;
const DIRT_DEPTH = 3;
const SAND_DEPTH = 4;
const BEDROCK_JITTER_CHANCE = 0.4;
const SNOW_HEIGHT = 50;
/** 地图边缘向内平滑压低的宽度，用来把边缘做成海洋。 */
const EDGE_FALLOFF = 24;
const EDGE_DROP = 12;

/** 矿脉配置。 */
interface OreConfig {
  block: number;
  minY: number;
  maxY: number;
  /** 每 chunk 尝试次数。 */
  attempts: number;
  size: number;
}
const ORES: OreConfig[] = [
  { block: BlockId.COAL_ORE, minY: 4, maxY: 60, attempts: 12, size: 10 },
  { block: BlockId.IRON_ORE, minY: 2, maxY: 40, attempts: 8, size: 6 },
  { block: BlockId.GOLD_ORE, minY: 2, maxY: 24, attempts: 2, size: 5 },
  { block: BlockId.DIAMOND_ORE, minY: 1, maxY: 14, attempts: 1, size: 5 },
  { block: BlockId.GRAVEL, minY: 4, maxY: 50, attempts: 4, size: 12 },
];

const TREE_MIN_HEIGHT = 4;
const TREE_HEIGHT_VARIANCE = 3;
const TREE_CHANCE: Record<Biome, number> = { plains: 0.003, forest: 0.05, desert: 0, mountains: 0.006, snowy: 0.012 };
const GRASS_CHANCE: Record<Biome, number> = { plains: 0.08, forest: 0.06, desert: 0, mountains: 0.02, snowy: 0 };
const FLOWER_CHANCE: Record<Biome, number> = { plains: 0.012, forest: 0.008, desert: 0, mountains: 0.003, snowy: 0 };
const PUMPKIN_CHANCE = 0.0006;
const CHUNK_SPAN = 16;

/** 世界生成器：噪声地形 + 群系 + 洞穴 + 矿石 + 植被。 */
export class TerrainGenerator {
  private readonly rng: () => number;
  private readonly continent: (x: number, y: number) => number;
  private readonly hills: (x: number, y: number) => number;
  private readonly detail: (x: number, y: number) => number;
  private readonly temperature: (x: number, y: number) => number;
  private readonly humidity: (x: number, y: number) => number;
  private readonly cave: (x: number, y: number, z: number) => number;
  readonly seed: string;

  constructor(seed: string) {
    this.seed = seed;
    const base = hashString(seed);
    this.rng = createRng(base);
    this.continent = createNoise2D(createRng(base + 1));
    this.hills = createNoise2D(createRng(base + 2));
    this.detail = createNoise2D(createRng(base + 3));
    this.temperature = createNoise2D(createRng(base + 4));
    this.humidity = createNoise2D(createRng(base + 5));
    this.cave = createNoise3D(createRng(base + 6));
  }

  /** 计算群系。 */
  biomeAt(x: number, z: number): Biome {
    const t = this.temperature(x * BIOME_SCALE, z * BIOME_SCALE);
    const h = this.humidity(x * BIOME_SCALE + 100, z * BIOME_SCALE + 100);
    const mountain = this.continent(x * CONTINENT_SCALE, z * CONTINENT_SCALE);
    if (mountain > 0.55) {
      return t < -0.2 ? Biome.SNOWY : Biome.MOUNTAINS;
    }
    if (t > 0.45 && h < 0) {
      return Biome.DESERT;
    }
    if (t < -0.5) {
      return Biome.SNOWY;
    }
    return h > 0.1 ? Biome.FOREST : Biome.PLAINS;
  }

  /** 计算地表高度。 */
  heightAt(x: number, z: number, sizeX: number, sizeZ: number): number {
    const c = this.continent(x * CONTINENT_SCALE, z * CONTINENT_SCALE);
    const h = this.hills(x * HILL_SCALE, z * HILL_SCALE);
    const d = this.detail(x * DETAIL_SCALE, z * DETAIL_SCALE);
    let height = BASE_HEIGHT + c * CONTINENT_AMPLITUDE + h * HILL_AMPLITUDE + d * DETAIL_AMPLITUDE;
    if (c > 0.55) {
      const m = (c - 0.55) / 0.45;
      height += m * m * MOUNTAIN_EXTRA + Math.abs(h) * 6;
    }
    const edge = Math.min(x, z, sizeX - 1 - x, sizeZ - 1 - z);
    if (edge < EDGE_FALLOFF) {
      const f = 1 - edge / EDGE_FALLOFF;
      height -= f * f * EDGE_DROP;
    }
    return Math.max(2, Math.min(WORLD_SIZE_Y - 3, Math.floor(height)));
  }

  /** 生成整个世界。 */
  generate(world: World): void {
    const heights = new Uint8Array(world.sizeX * world.sizeZ);
    for (let z = 0; z < world.sizeZ; z++) {
      for (let x = 0; x < world.sizeX; x++) {
        heights[z * world.sizeX + x] = this.heightAt(x, z, world.sizeX, world.sizeZ);
      }
    }
    for (let z = 0; z < world.sizeZ; z++) {
      for (let x = 0; x < world.sizeX; x++) {
        this.generateColumn(world, x, z, heights[z * world.sizeX + x], this.biomeAt(x, z));
      }
    }
    this.generateOres(world);
    this.generateVegetation(world, heights);
  }

  private generateColumn(world: World, x: number, z: number, height: number, biome: Biome): void {
    for (let y = 0; y <= height; y++) {
      let id: number = BlockId.STONE;
      if (y === 0 || (y === 1 && this.rng() < BEDROCK_JITTER_CHANCE)) {
        id = BlockId.BEDROCK;
      } else if (y > CAVE_MIN_Y && y < height - CAVE_MAX_DEPTH_BELOW_SURFACE && this.isCave(x, y, z)) {
        id = BlockId.AIR;
      } else if (biome === Biome.DESERT && y > height - SAND_DEPTH) {
        id = y > height - 2 ? BlockId.SAND : BlockId.SANDSTONE;
      } else if (y === height) {
        id = this.surfaceBlock(biome, height);
      } else if (y > height - DIRT_DEPTH) {
        id = height < SEA_LEVEL ? (this.rng() < 0.5 ? BlockId.SAND : BlockId.DIRT) : BlockId.DIRT;
      }
      world.setBlockRaw(x, y, z, id);
    }
    for (let y = height + 1; y <= SEA_LEVEL; y++) {
      world.setBlockRaw(x, y, z, BlockId.WATER);
    }
    if (biome === Biome.SNOWY && height >= SEA_LEVEL && height + 1 < world.sizeY) {
      world.setBlockRaw(x, height + 1, z, BlockId.SNOW);
    }
  }

  private surfaceBlock(biome: Biome, height: number): number {
    if (height < SEA_LEVEL) {
      return this.rng() < 0.6 ? BlockId.SAND : BlockId.GRAVEL;
    }
    if (height <= SEA_LEVEL + 1) {
      return BlockId.SAND;
    }
    if (biome === Biome.MOUNTAINS && height > SNOW_HEIGHT) {
      return BlockId.STONE;
    }
    if (biome === Biome.MOUNTAINS && this.rng() < 0.35) {
      return BlockId.STONE;
    }
    return BlockId.GRASS;
  }

  private isCave(x: number, y: number, z: number): boolean {
    const n = this.cave(x * CAVE_SCALE, y * CAVE_SCALE * 1.6, z * CAVE_SCALE);
    return n > CAVE_THRESHOLD;
  }

  private generateOres(world: World): void {
    const chunksX = world.sizeX / CHUNK_SPAN;
    const chunksZ = world.sizeZ / CHUNK_SPAN;
    for (let cz = 0; cz < chunksZ; cz++) {
      for (let cx = 0; cx < chunksX; cx++) {
        for (const ore of ORES) {
          for (let i = 0; i < ore.attempts; i++) {
            const x = cx * CHUNK_SPAN + Math.floor(this.rng() * CHUNK_SPAN);
            const z = cz * CHUNK_SPAN + Math.floor(this.rng() * CHUNK_SPAN);
            const y = ore.minY + Math.floor(this.rng() * (ore.maxY - ore.minY));
            this.placeVein(world, x, y, z, ore);
          }
        }
      }
    }
  }

  private placeVein(world: World, x: number, y: number, z: number, ore: OreConfig): void {
    let px = x;
    let py = y;
    let pz = z;
    for (let i = 0; i < ore.size; i++) {
      if (world.getBlock(px, py, pz) === BlockId.STONE) {
        world.setBlockRaw(px, py, pz, ore.block);
      }
      px += Math.floor(this.rng() * 3) - 1;
      py += Math.floor(this.rng() * 3) - 1;
      pz += Math.floor(this.rng() * 3) - 1;
    }
  }

  private generateVegetation(world: World, heights: Uint8Array): void {
    for (let z = 2; z < world.sizeZ - 2; z++) {
      for (let x = 2; x < world.sizeX - 2; x++) {
        const h = heights[z * world.sizeX + x];
        if (world.getBlock(x, h, z) !== BlockId.GRASS || world.getBlock(x, h + 1, z) !== BlockId.AIR) {
          continue;
        }
        const biome = this.biomeAt(x, z);
        const r = this.rng();
        if (r < TREE_CHANCE[biome]) {
          this.placeTree(world, x, h + 1, z);
        } else if (r < TREE_CHANCE[biome] + GRASS_CHANCE[biome]) {
          world.setBlockRaw(x, h + 1, z, BlockId.TALL_GRASS);
        } else if (r < TREE_CHANCE[biome] + GRASS_CHANCE[biome] + FLOWER_CHANCE[biome]) {
          world.setBlockRaw(x, h + 1, z, this.rng() < 0.5 ? BlockId.DANDELION : BlockId.POPPY);
        } else if (r < TREE_CHANCE[biome] + GRASS_CHANCE[biome] + FLOWER_CHANCE[biome] + PUMPKIN_CHANCE) {
          world.setBlockRaw(x, h + 1, z, BlockId.PUMPKIN);
        }
      }
    }
  }

  /** 在指定位置放置一棵橡树（底部为 y）。 */
  placeTree(world: World, x: number, y: number, z: number): boolean {
    const height = TREE_MIN_HEIGHT + Math.floor(this.rng() * TREE_HEIGHT_VARIANCE);
    if (y + height + 2 >= world.sizeY) {
      return false;
    }
    for (let i = 1; i < height; i++) {
      if (world.getBlock(x, y + i, z) !== BlockId.AIR) {
        return false;
      }
    }
    for (let dy = height - 3; dy <= height; dy++) {
      const radius = dy >= height - 1 ? 1 : 2;
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const isCorner = Math.abs(dx) === radius && Math.abs(dz) === radius;
          if (isCorner && (radius === 1 || this.rng() < 0.5)) {
            continue;
          }
          if (world.getBlock(x + dx, y + dy, z + dz) === BlockId.AIR) {
            world.setBlockRaw(x + dx, y + dy, z + dz, BlockId.LEAVES);
          }
        }
      }
    }
    for (let i = 0; i < height; i++) {
      world.setBlockRaw(x, y + i, z, BlockId.LOG);
    }
    return true;
  }

  /** 找到靠近地图中心的可站立出生点。 */
  findSpawn(world: World): { x: number; y: number; z: number } {
    const cx = Math.floor(world.sizeX / 2);
    const cz = Math.floor(world.sizeZ / 2);
    for (let r = 0; r < 64; r += 2) {
      for (let dx = -r; dx <= r; dx += 2) {
        for (let dz = -r; dz <= r; dz += 2) {
          const x = cx + dx;
          const z = cz + dz;
          const y = world.getSurfaceY(x, z);
          if (y > SEA_LEVEL && world.getBlock(x, y - 1, z) === BlockId.GRASS) {
            return { x: x + 0.5, y, z: z + 0.5 };
          }
        }
      }
    }
    return { x: cx + 0.5, y: world.getSurfaceY(cx, cz), z: cz + 0.5 };
  }
}
