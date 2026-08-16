/**
 * 末地：中央一座末地石主岛（岛心厚、边缘薄，外围是虚空），岛上立若干黑曜石柱，
 * 柱顶各有一颗末影水晶（由 Game 在进入维度时生成实体）。
 * 主岛之外目前是空的（1.8.9 的外岛留到以后）。
 */

import { createNoise2D } from 'simplex-noise';
import { BlockId } from '../blocks/BlockRegistry';
import { CHUNK_SIZE } from '../constants/world';
import { createRng, hashString } from '../textures/PixelCanvas';
import type { Chunk } from './Chunk';
import type { ChunkGenerator, SpawnPoint } from './ChunkGenerator';

/** 主岛中心与半径。 */
export const END_ISLAND_CENTER_X = 0;
export const END_ISLAND_CENTER_Z = 0;
export const END_ISLAND_RADIUS = 56;
/** 岛面的基准高度与最大厚度。 */
export const END_ISLAND_SURFACE_Y = 64;
const END_ISLAND_MAX_THICKNESS = 14;
/** 边缘起伏的噪声缩放与幅度。 */
const EDGE_NOISE_SCALE = 0.06;
const EDGE_NOISE_AMPLITUDE = 9;

/** 黑曜石柱：数量、半径范围、高度范围。 */
export const OBSIDIAN_PILLAR_COUNT = 10;
const PILLAR_RING_RADIUS = 40;
const PILLAR_MIN_RADIUS = 2;
const PILLAR_MAX_RADIUS = 4;
const PILLAR_MIN_HEIGHT = 12;
const PILLAR_MAX_HEIGHT = 30;
const SALT_END = 4321;

/** 一根黑曜石柱。 */
export interface ObsidianPillar {
  x: number;
  z: number;
  radius: number;
  /** 柱顶的 y（水晶就放在这上面）。 */
  topY: number;
}

/** 末地生成器。 */
export class EndGenerator implements ChunkGenerator {
  readonly seed: string;
  private readonly base: number;
  private readonly edge: ReturnType<typeof createNoise2D>;
  private readonly pillarsCache: ObsidianPillar[];

  constructor(seed: string) {
    this.seed = seed;
    this.base = hashString(`${seed}:end`);
    this.edge = createNoise2D(createRng(this.base + SALT_END));
    this.pillarsCache = this.rollPillars();
  }

  /** 十根柱子沿一个圆环等角分布，半径与高度随种子固定。 */
  private rollPillars(): ObsidianPillar[] {
    const rng = createRng(this.base ^ SALT_END);
    const out: ObsidianPillar[] = [];
    for (let i = 0; i < OBSIDIAN_PILLAR_COUNT; i++) {
      const angle = (i / OBSIDIAN_PILLAR_COUNT) * Math.PI * 2;
      const radius = PILLAR_MIN_RADIUS + Math.floor(rng() * (PILLAR_MAX_RADIUS - PILLAR_MIN_RADIUS + 1));
      const height = PILLAR_MIN_HEIGHT + Math.floor(rng() * (PILLAR_MAX_HEIGHT - PILLAR_MIN_HEIGHT + 1));
      out.push({
        x: END_ISLAND_CENTER_X + Math.round(Math.cos(angle) * PILLAR_RING_RADIUS),
        z: END_ISLAND_CENTER_Z + Math.round(Math.sin(angle) * PILLAR_RING_RADIUS),
        radius,
        topY: END_ISLAND_SURFACE_Y + height,
      });
    }
    return out;
  }

  /** 全部黑曜石柱（Game 用来放末影水晶）。 */
  get pillars(): readonly ObsidianPillar[] {
    return this.pillarsCache;
  }

  /** 某列的岛面厚度（0 表示虚空）。 */
  private thicknessAt(x: number, z: number): number {
    const dx = x - END_ISLAND_CENTER_X;
    const dz = z - END_ISLAND_CENTER_Z;
    const distance = Math.hypot(dx, dz) - this.edge(x * EDGE_NOISE_SCALE, z * EDGE_NOISE_SCALE) * EDGE_NOISE_AMPLITUDE;
    if (distance >= END_ISLAND_RADIUS) {
      return 0;
    }
    // 中心最厚、边缘收薄
    const t = 1 - distance / END_ISLAND_RADIUS;
    return Math.max(1, Math.round(END_ISLAND_MAX_THICKNESS * t * t));
  }

  generateChunk(chunk: Chunk): void {
    const x0 = chunk.originX;
    const z0 = chunk.originZ;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const x = x0 + lx;
        const z = z0 + lz;
        const thickness = this.thicknessAt(x, z);
        for (let d = 0; d < thickness; d++) {
          chunk.setLocal(lx, END_ISLAND_SURFACE_Y - d, lz, BlockId.END_STONE);
        }
      }
    }
    this.placePillars(chunk);
  }

  /** 把与该 chunk 相交的黑曜石柱写进去。 */
  private placePillars(chunk: Chunk): void {
    const x0 = chunk.originX;
    const z0 = chunk.originZ;
    for (const pillar of this.pillarsCache) {
      if (
        pillar.x + pillar.radius < x0 ||
        pillar.x - pillar.radius >= x0 + CHUNK_SIZE ||
        pillar.z + pillar.radius < z0 ||
        pillar.z - pillar.radius >= z0 + CHUNK_SIZE
      ) {
        continue;
      }
      for (let dz = -pillar.radius; dz <= pillar.radius; dz++) {
        for (let dx = -pillar.radius; dx <= pillar.radius; dx++) {
          if (dx * dx + dz * dz > pillar.radius * pillar.radius) {
            continue;
          }
          const lx = pillar.x + dx - x0;
          const lz = pillar.z + dz - z0;
          if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) {
            continue;
          }
          for (let y = END_ISLAND_SURFACE_Y; y <= pillar.topY; y++) {
            chunk.setLocal(lx, y, lz, BlockId.OBSIDIAN);
          }
        }
      }
    }
  }

  /** 末地的落脚点：岛中心上方（1.8.9 里玩家从这里出现）。 */
  findSpawn(): SpawnPoint {
    return { x: END_ISLAND_CENTER_X + 0.5, y: END_ISLAND_SURFACE_Y + 1, z: END_ISLAND_CENTER_Z + 0.5 };
  }

  biomeAt(): string {
    return 'end';
  }
}
