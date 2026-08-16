/**
 * 专用服务端的存档：把被玩家改动过的 chunk 存成一个二进制文件，重启后原样读回来。
 *
 * 格式（全部小端序）：
 *   魔数 "MCWS"(4) | 版本(u32) | 世界时间(u32) | chunk 数(u32)
 *   每个 chunk：cx(i32) cz(i32) blocks 长度(u32) blocks(u32×n) meta 长度(u32) meta(u32×n)
 * 方块数据直接复用浏览器存档的 RLE 编码，两边格式一致。
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { deserializeChunk, serializeChunk } from '../src/engine/save/chunkSerializer';
import type { ChunkManager } from '../src/engine/world/ChunkManager';
import type { World } from '../src/engine/world/World';

const MAGIC = 'MCWS';
const VERSION = 1;
const HEADER_BYTES = 16;

/** 存档内容。 */
export interface ServerSave {
  timeTick: number;
  chunkCount: number;
}

/** 把世界里被改动过的 chunk 写到文件（先写临时文件再改名，避免写一半崩了把存档毁了）。 */
export function saveWorld(path: string, world: World, timeTick: number): ServerSave {
  const chunks = world.listModifiedChunks().map(serializeChunk);
  let size = HEADER_BYTES;
  for (const chunk of chunks) {
    size += 8 + 4 + chunk.blocks.length * 4 + 4 + chunk.meta.length * 4;
  }
  const buffer = Buffer.alloc(size);
  buffer.write(MAGIC, 0, 'ascii');
  buffer.writeUInt32LE(VERSION, 4);
  buffer.writeUInt32LE(timeTick >>> 0, 8);
  buffer.writeUInt32LE(chunks.length, 12);
  let offset = HEADER_BYTES;
  for (const chunk of chunks) {
    buffer.writeInt32LE(chunk.cx, offset);
    buffer.writeInt32LE(chunk.cz, offset + 4);
    offset += 8;
    offset = writeWords(buffer, offset, chunk.blocks);
    offset = writeWords(buffer, offset, chunk.meta);
  }
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp`;
  writeFileSync(temp, buffer);
  renameSync(temp, path);
  return { timeTick, chunkCount: chunks.length };
}

function writeWords(buffer: Buffer, offset: number, words: Uint32Array): number {
  buffer.writeUInt32LE(words.length, offset);
  let next = offset + 4;
  for (const word of words) {
    buffer.writeUInt32LE(word, next);
    next += 4;
  }
  return next;
}

/**
 * 读取存档并把 chunk 放回世界。
 * @returns 读到的内容；文件不存在或格式不对返回 null（当作新世界）
 */
export function loadWorld(path: string, chunkManager: ChunkManager, hasSkyLight: boolean): ServerSave | null {
  let buffer: Buffer;
  try {
    buffer = readFileSync(path);
  } catch {
    return null;
  }
  if (buffer.length < HEADER_BYTES || buffer.toString('ascii', 0, 4) !== MAGIC) {
    return null;
  }
  if (buffer.readUInt32LE(4) !== VERSION) {
    return null;
  }
  const timeTick = buffer.readUInt32LE(8);
  const count = buffer.readUInt32LE(12);
  let offset = HEADER_BYTES;
  let loaded = 0;
  for (let i = 0; i < count; i++) {
    if (offset + 8 > buffer.length) {
      break;
    }
    const cx = buffer.readInt32LE(offset);
    const cz = buffer.readInt32LE(offset + 4);
    offset += 8;
    const blocks = readWords(buffer, offset);
    if (!blocks) {
      break;
    }
    offset = blocks.next;
    const meta = readWords(buffer, offset);
    if (!meta) {
      break;
    }
    offset = meta.next;
    chunkManager.addLoadedChunk(deserializeChunk({ cx, cz, blocks: blocks.words, meta: meta.words }, hasSkyLight));
    loaded++;
  }
  return { timeTick, chunkCount: loaded };
}

function readWords(buffer: Buffer, offset: number): { words: Uint32Array; next: number } | null {
  if (offset + 4 > buffer.length) {
    return null;
  }
  const length = buffer.readUInt32LE(offset);
  const end = offset + 4 + length * 4;
  if (end > buffer.length) {
    return null;
  }
  const words = new Uint32Array(length);
  for (let i = 0; i < length; i++) {
    words[i] = buffer.readUInt32LE(offset + 4 + i * 4);
  }
  return { words, next: end };
}
