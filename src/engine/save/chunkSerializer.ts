import { Chunk } from '../world/Chunk';
import type { ChunkSaveData } from './SaveManager';
import { rleDecode, rleEncode } from './serialize';

/** 序列化一个 chunk（方块与附加数据 RLE 压缩；光照与高度图读档时重算）。 */
export function serializeChunk(chunk: Chunk): ChunkSaveData {
  return { cx: chunk.cx, cz: chunk.cz, blocks: rleEncode(chunk.blocks), meta: rleEncode(chunk.meta) };
}

/** 反序列化为已标记修改的 chunk。 */
export function deserializeChunk(data: ChunkSaveData): Chunk {
  const chunk = new Chunk(data.cx, data.cz);
  chunk.blocks.set(rleDecode(data.blocks, chunk.blocks.length));
  chunk.meta.set(rleDecode(data.meta, chunk.meta.length));
  chunk.isModified = true;
  return chunk;
}
