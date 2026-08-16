import { Chunk } from '../world/Chunk';
import type { ChunkSaveData } from './SaveManager';
import { rleDecode, rleDecodeAuto, rleEncode } from './serialize';

/**
 * 序列化一个 chunk：方块与附加数据展开成跨全高的线性数组后 RLE 压缩（光照与高度图读档时重算）。
 * 数组长度按 chunk 最高的已分配段截断，因此高空全是空气时不会写入无用数据。
 */
export function serializeChunk(chunk: Chunk): ChunkSaveData {
  return {
    cx: chunk.cx,
    cz: chunk.cz,
    blocks: rleEncode(chunk.toFlatBlocks()),
    meta: rleEncode(chunk.toFlatMeta()),
  };
}

/**
 * 反序列化为已标记修改的 chunk。
 * 长度由 RLE 自身决定，因此更矮的旧存档（如世界高度 64 时代）可直接落到底部，其余保持空气。
 */
export function deserializeChunk(data: ChunkSaveData, hasSkyLight = true): Chunk {
  const chunk = new Chunk(data.cx, data.cz, hasSkyLight);
  const blocks = rleDecodeAuto(data.blocks);
  const meta = rleDecode(data.meta, blocks.length);
  chunk.loadFlat(blocks, meta);
  chunk.isModified = true;
  return chunk;
}
