/**
 * 下界地形：顶部与底部各一层基岩，中间由 3D 噪声挖出连绵的洞窟，
 * 低处灌满岩浆海，地表撒灵魂沙 / 砾石斑块，洞顶挂萤石簇，另有下界石英矿。
 * 与主世界一样：同一 (seed, cx, cz) 的结果固定，chunk 可以随时丢弃再生。
 */

import { createNoise2D, createNoise3D } from 'simplex-noise';
import { BlockId } from '../blocks/BlockRegistry';
import { CHUNK_SIZE, WORLD_SIZE_Y } from '../constants/world';
import { createRng, hashCoords, hashString } from '../textures/PixelCanvas';
import type { Chunk } from './Chunk';
import type { ChunkGenerator, SpawnPoint } from './ChunkGenerator';

/** 下界的可活动高度（1.8.9 是 128，这里也用 128，上面留空）。 */
export const NETHER_HEIGHT = 128;
/** 岩浆海海平面。 */
export const NETHER_LAVA_LEVEL = 31;
/** 顶部与底部基岩的厚度。 */
const BEDROCK_LAYERS = 5;
/** 3D 噪声的缩放与判定阈值：值大于阈值算实心。 */
const CAVE_SCALE_XZ = 0.055;
const CAVE_SCALE_Y = 0.09;
const CAVE_THRESHOLD = 0.24;
/** 越靠近上下边界越实心，保证有连续的天花板与地面。 */
const EDGE_FALLOFF = 24;
/** 各种点缀的概率。 */
const SOUL_SAND_CHANCE = 0.06;
const GRAVEL_CHANCE = 0.05;
const GLOWSTONE_CLUSTER_CHANCE = 0.012;
const QUARTZ_ORE_CHANCE = 0.02;
const FIRE_CHANCE = 0.01;
/** 萤石簇的大小。 */
const GLOWSTONE_CLUSTER_RADIUS = 2;
const SALT_NETHER = 977;
const SALT_DECOR = 613;
/** 灵魂沙 / 砾石斑块的噪声缩放。 */
const PATCH_SCALE = 0.08;
/** 斑块判定阈值。 */
const SOUL_SAND_PATCH_MIN = 0.72;
const GRAVEL_PATCH_MAX = 0.28;
/** 斑块内的出现概率放大倍数。 */
const PATCH_DENSITY = 8;

/** 下界地形生成器。 */
export class NetherGenerator implements ChunkGenerator {
  readonly seed: string;
  private readonly base: number;
  private readonly cave: ReturnType<typeof createNoise3D>;
  private readonly patch: ReturnType<typeof createNoise2D>;

  constructor(seed: string) {
    this.seed = seed;
    this.base = hashString(`${seed}:nether`);
    this.cave = createNoise3D(createRng(this.base + 1));
    this.patch = createNoise2D(createRng(this.base + SALT_DECOR));
  }

  /** 该点是不是实心（3D 噪声 + 上下边界收束）。 */
  private isSolid(x: number, y: number, z: number): boolean {
    if (y < BEDROCK_LAYERS || y >= NETHER_HEIGHT - BEDROCK_LAYERS) {
      return true;
    }
    const distanceToEdge = Math.min(y - BEDROCK_LAYERS, NETHER_HEIGHT - BEDROCK_LAYERS - y);
    const edge = Math.min(1, distanceToEdge / EDGE_FALLOFF);
    // simplex 输出 -1~1，折算到 0~1 再比阈值
    const value = (this.cave(x * CAVE_SCALE_XZ, y * CAVE_SCALE_Y, z * CAVE_SCALE_XZ) + 1) / 2;
    // edge 越小（越靠近上下）越容易判定为实心
    return value > CAVE_THRESHOLD * edge + (1 - edge);
  }

  generateChunk(chunk: Chunk): void {
    const x0 = chunk.originX;
    const z0 = chunk.originZ;
    const rng = createRng(hashCoords(this.base, chunk.cx, chunk.cz, SALT_NETHER));
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const x = x0 + lx;
        const z = z0 + lz;
        this.generateColumn(chunk, lx, lz, x, z, rng);
      }
    }
  }

  private generateColumn(chunk: Chunk, lx: number, lz: number, x: number, z: number, rng: () => number): void {
    for (let y = 0; y < NETHER_HEIGHT; y++) {
      const isBedrock = y < 1 || y >= NETHER_HEIGHT - 1;
      if (isBedrock) {
        chunk.setLocal(lx, y, lz, BlockId.BEDROCK);
        continue;
      }
      // 上下各几层基岩做成参差不齐的过渡
      if (y < BEDROCK_LAYERS || y >= NETHER_HEIGHT - BEDROCK_LAYERS) {
        const depth = Math.min(y, NETHER_HEIGHT - 1 - y);
        chunk.setLocal(lx, y, lz, rng() < 1 - depth / BEDROCK_LAYERS ? BlockId.BEDROCK : BlockId.NETHERRACK);
        continue;
      }
      if (this.isSolid(x, y, z)) {
        chunk.setLocal(lx, y, lz, this.stoneAt(x, z, rng));
        continue;
      }
      if (y <= NETHER_LAVA_LEVEL) {
        chunk.setLocal(lx, y, lz, BlockId.LAVA);
      }
    }
    this.decorateColumn(chunk, lx, lz, rng);
  }

  /** 实心部分的方块：绝大多数是地狱岩，夹杂石英矿与灵魂沙 / 砾石斑块。 */
  private stoneAt(x: number, z: number, rng: () => number): number {
    if (rng() < QUARTZ_ORE_CHANCE) {
      return BlockId.QUARTZ_ORE;
    }
    const patch = (this.patch(x * PATCH_SCALE, z * PATCH_SCALE) + 1) / 2;
    if (patch > SOUL_SAND_PATCH_MIN && rng() < SOUL_SAND_CHANCE * PATCH_DENSITY) {
      return BlockId.SOUL_SAND;
    }
    if (patch < GRAVEL_PATCH_MAX && rng() < GRAVEL_CHANCE * PATCH_DENSITY) {
      return BlockId.GRAVEL;
    }
    return BlockId.NETHERRACK;
  }

  /** 洞顶挂萤石、地面上偶尔烧一团永不熄灭的火。 */
  private decorateColumn(chunk: Chunk, lx: number, lz: number, rng: () => number): void {
    for (let y = BEDROCK_LAYERS + 1; y < NETHER_HEIGHT - BEDROCK_LAYERS - 1; y++) {
      const here = chunk.getLocal(lx, y, lz);
      if (here !== BlockId.AIR) {
        continue;
      }
      const above = chunk.getLocal(lx, y + 1, lz);
      const below = chunk.getLocal(lx, y - 1, lz);
      if (above === BlockId.NETHERRACK && rng() < GLOWSTONE_CLUSTER_CHANCE) {
        this.placeGlowstone(chunk, lx, y, lz, rng);
        continue;
      }
      if (below === BlockId.NETHERRACK && y > NETHER_LAVA_LEVEL && rng() < FIRE_CHANCE) {
        chunk.setLocal(lx, y, lz, BlockId.FIRE);
      }
    }
  }

  /** 从洞顶往下挂一小簇萤石。 */
  private placeGlowstone(chunk: Chunk, lx: number, y: number, lz: number, rng: () => number): void {
    for (let dy = 0; dy < GLOWSTONE_CLUSTER_RADIUS; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = lx + dx;
          const nz = lz + dz;
          const ny = y - dy;
          if (nx < 0 || nx >= CHUNK_SIZE || nz < 0 || nz >= CHUNK_SIZE || ny < 1) {
            continue;
          }
          if (chunk.getLocal(nx, ny, nz) === BlockId.AIR && rng() < 0.6) {
            chunk.setLocal(nx, ny, nz, BlockId.GLOWSTONE);
          }
        }
      }
    }
  }

  /** 下界出生点：从岩浆海上方往上找第一块空地（只用于指令传送兜底）。 */
  findSpawn(): SpawnPoint {
    for (let y = NETHER_LAVA_LEVEL + 2; y < NETHER_HEIGHT - BEDROCK_LAYERS - 2; y++) {
      if (!this.isSolid(0, y, 0) && !this.isSolid(0, y + 1, 0) && this.isSolid(0, y - 1, 0)) {
        return { x: 0.5, y, z: 0.5 };
      }
    }
    return { x: 0.5, y: NETHER_LAVA_LEVEL + 2, z: 0.5 };
  }

  biomeAt(): string {
    return 'nether';
  }
}

/** 世界高度必须容得下下界（编译期常量检查用）。 */
export const NETHER_FITS_WORLD = NETHER_HEIGHT <= WORLD_SIZE_Y;
