import { BlockId } from '../blocks/BlockRegistry';
import { CHUNK_SIZE } from '../constants/world';
import type { Chunk } from './Chunk';
import type { ChunkGenerator, SpawnPoint } from './ChunkGenerator';
import { VillageGenerator, VillageStyle } from './structures/VillageGenerator';

/** 超平坦分层（自下而上），对应 1.8 经典预设：基岩 + 2 层泥土 + 草方块。 */
export const FLAT_LAYERS: readonly number[] = [BlockId.BEDROCK, BlockId.DIRT, BlockId.DIRT, BlockId.GRASS];

const FLAT_BIOME_NAME = 'flat';

/** 超平坦世界生成器。 */
export class FlatGenerator implements ChunkGenerator {
  /** 村庄生成器（关闭结构时为 null）。 */
  readonly villages: VillageGenerator | null;

  constructor(
    readonly seed: string,
    generateStructures: boolean,
  ) {
    this.villages = generateStructures
      ? new VillageGenerator(
          seed,
          () => FLAT_LAYERS.length - 1,
          () => VillageStyle.PLAINS,
        )
      : null;
  }

  generateChunk(chunk: Chunk): void {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let y = 0; y < FLAT_LAYERS.length; y++) {
          chunk.setLocal(lx, y, lz, FLAT_LAYERS[y]);
        }
      }
    }
    this.villages?.placeInChunk(chunk);
  }

  findSpawn(): SpawnPoint {
    return { x: 0.5, y: FLAT_LAYERS.length, z: 0.5 };
  }

  biomeAt(): string {
    return FLAT_BIOME_NAME;
  }
}
