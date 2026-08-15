import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/engine/blocks/BlockRegistry';
import { CHUNK_AREA, MAX_LIGHT, SECTION_HEIGHT } from '../src/engine/constants/world';
import { Chunk } from '../src/engine/world/Chunk';
import { World } from '../src/engine/world/World';

/** 已分配的段数。 */
function sectionCount(chunk: Chunk): number {
  return chunk.sections.filter((s) => s !== null).length;
}

describe('Chunk 分段存储', () => {
  it('新建 chunk 不分配任何段', () => {
    const chunk = new Chunk(0, 0);
    expect(sectionCount(chunk)).toBe(0);
    expect(chunk.getLocal(3, 40, 7)).toBe(BlockId.AIR);
    expect(chunk.filledMaxY).toBe(0);
  });

  it('写入方块只分配所在的段，写空气不分配', () => {
    const chunk = new Chunk(0, 0);
    chunk.setLocal(1, SECTION_HEIGHT + 2, 1, BlockId.STONE);
    expect(sectionCount(chunk)).toBe(1);
    expect(chunk.getLocal(1, SECTION_HEIGHT + 2, 1)).toBe(BlockId.STONE);
    expect(chunk.filledMinY).toBe(SECTION_HEIGHT);
    expect(chunk.filledMaxY).toBe(SECTION_HEIGHT * 2);
    chunk.setLocal(1, 0, 1, BlockId.AIR);
    expect(sectionCount(chunk)).toBe(1);
  });

  it('写默认光照值不分配段，写非默认值才分配', () => {
    const world = new World();
    const chunk = new Chunk(0, 0);
    world.addChunk(chunk);
    world.setSkyLight(2, 40, 2, MAX_LIGHT);
    world.setBlockLight(2, 40, 2, 0);
    expect(sectionCount(chunk)).toBe(0);
    expect(world.getSkyLight(2, 40, 2)).toBe(MAX_LIGHT);
    world.setSkyLight(2, 40, 2, 3);
    expect(sectionCount(chunk)).toBe(1);
    expect(world.getSkyLight(2, 40, 2)).toBe(3);
  });

  it('展开成线性数组后可原样还原', () => {
    const chunk = new Chunk(-2, 5);
    chunk.setLocal(0, 0, 0, BlockId.BEDROCK);
    chunk.setLocal(15, 20, 15, BlockId.WATER, 4);
    const restored = new Chunk(-2, 5);
    restored.loadFlat(chunk.toFlatBlocks(), chunk.toFlatMeta());
    expect(restored.getLocal(0, 0, 0)).toBe(BlockId.BEDROCK);
    expect(restored.getLocal(15, 20, 15)).toBe(BlockId.WATER);
    expect(restored.getLocalMeta(15, 20, 15)).toBe(4);
    expect(sectionCount(restored)).toBe(sectionCount(chunk));
  });

  it('比世界更矮的旧数据落到世界底部', () => {
    const legacyHeight = SECTION_HEIGHT;
    const blocks = new Uint8Array(CHUNK_AREA * legacyHeight);
    blocks[0] = BlockId.BEDROCK;
    const chunk = new Chunk(0, 0);
    chunk.loadFlat(blocks, new Uint8Array(blocks.length));
    expect(chunk.getLocal(0, 0, 0)).toBe(BlockId.BEDROCK);
    expect(chunk.filledMaxY).toBe(legacyHeight);
  });
});
