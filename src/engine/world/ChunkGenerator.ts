import type { WorldMeta } from '../save/SaveManager';
import { WorldType } from '../constants/world';
import type { Chunk } from './Chunk';
import { FlatGenerator } from './FlatGenerator';
import { TerrainGenerator } from './TerrainGenerator';

/** 出生点。 */
export interface SpawnPoint {
  x: number;
  y: number;
  z: number;
}

/**
 * 按 chunk 生成地形的生成器。要求：同一 (seed, cx, cz) 的输出与生成顺序、邻居是否存在无关，
 * 这样未被玩家修改过的 chunk 可以随时卸载并在需要时重新生成。
 */
export interface ChunkGenerator {
  readonly seed: string;
  /** 把地形写入空 chunk。 */
  generateChunk(chunk: Chunk): void;
  /** 计算出生点（不依赖已加载的 chunk）。 */
  findSpawn(): SpawnPoint;
}

/** 根据世界元数据创建生成器。 */
export function createChunkGenerator(
  meta: Pick<WorldMeta, 'seed' | 'worldType' | 'generateStructures'>,
): ChunkGenerator {
  const structures = meta.generateStructures !== false;
  if (meta.worldType === WorldType.FLAT) {
    return new FlatGenerator(meta.seed, structures);
  }
  return new TerrainGenerator(meta.seed, structures);
}
