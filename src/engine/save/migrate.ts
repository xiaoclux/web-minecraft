import { LEGACY_WORLD_SIZE_X, LEGACY_WORLD_SIZE_Z, SAVE_FORMAT_VERSION } from '../constants/save';
import { CHUNK_SIZE, CHUNK_VOLUME, WORLD_SIZE_Y, WorldType } from '../constants/world';
import { localIndex } from '../world/Chunk';
import type { ChunkSaveData, WorldSave } from './SaveManager';
import { rleDecode, rleEncode } from './serialize';

/** 版本 1 存档：256×256×64 整卷方块。 */
export interface LegacyWorldSave extends Omit<WorldSave, 'chunks' | 'version'> {
  version: 1;
  blocks: Uint32Array;
  blockCount: number;
}

/**
 * 把旧的整卷存档切成 16×16 个 chunk（坐标不变、全部视为已修改），外围由无限地形接续。
 */
export function migrateLegacySave(save: LegacyWorldSave): WorldSave {
  const volume = LEGACY_WORLD_SIZE_X * WORLD_SIZE_Y * LEGACY_WORLD_SIZE_Z;
  if (save.blockCount !== volume) {
    throw new Error(`旧存档尺寸不符：${save.blockCount}（期望 ${volume}）`);
  }
  const all = rleDecode(save.blocks, volume);
  const chunksX = LEGACY_WORLD_SIZE_X / CHUNK_SIZE;
  const chunksZ = LEGACY_WORLD_SIZE_Z / CHUNK_SIZE;
  const chunks: ChunkSaveData[] = [];
  const emptyMeta = rleEncode(new Uint8Array(CHUNK_VOLUME));
  for (let cz = 0; cz < chunksZ; cz++) {
    for (let cx = 0; cx < chunksX; cx++) {
      const blocks = new Uint8Array(CHUNK_VOLUME);
      for (let y = 0; y < WORLD_SIZE_Y; y++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          const z = cz * CHUNK_SIZE + lz;
          const rowStart = (y * LEGACY_WORLD_SIZE_Z + z) * LEGACY_WORLD_SIZE_X + cx * CHUNK_SIZE;
          blocks.set(all.subarray(rowStart, rowStart + CHUNK_SIZE), localIndex(0, y, lz));
        }
      }
      chunks.push({ cx, cz, blocks: rleEncode(blocks), meta: emptyMeta });
    }
  }
  return {
    version: SAVE_FORMAT_VERSION,
    meta: { ...save.meta, worldType: save.meta.worldType ?? WorldType.DEFAULT },
    tick: save.tick,
    timeTick: save.timeTick,
    chunks,
    player: save.player,
    entities: save.entities,
    nextEntityId: save.nextEntityId,
    furnaces: save.furnaces,
  };
}
