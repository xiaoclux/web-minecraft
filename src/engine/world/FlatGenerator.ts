import { BlockId } from '../blocks/BlockRegistry';
import { CHUNK_SIZE } from '../constants/world';
import type { Chunk } from './Chunk';
import type { ChunkGenerator, SpawnPoint } from './ChunkGenerator';

/** 超平坦分层（自下而上），对应 1.8 经典预设：基岩 + 2 层泥土 + 草方块。 */
export const FLAT_LAYERS: readonly number[] = [BlockId.BEDROCK, BlockId.DIRT, BlockId.DIRT, BlockId.GRASS];

/** 超平坦世界生成器。 */
export class FlatGenerator implements ChunkGenerator {
  constructor(
    readonly seed: string,
    /** 是否生成村庄等结构（结构生成在后续步骤接入）。 */
    readonly generateStructures: boolean,
  ) {}

  /** 地表高度（第一个空气方块的 y）。 */
  get surfaceY(): number {
    return FLAT_LAYERS.length;
  }

  generateChunk(chunk: Chunk): void {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let y = 0; y < FLAT_LAYERS.length; y++) {
          chunk.setLocal(lx, y, lz, FLAT_LAYERS[y]);
        }
      }
    }
  }

  findSpawn(): SpawnPoint {
    return { x: 0.5, y: this.surfaceY, z: 0.5 };
  }
}
