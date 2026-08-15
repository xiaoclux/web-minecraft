import { describe, expect, it } from 'vitest';
import { bytesEqual, collectBlockIds, generateArea } from './helpers';
import { BlockId } from '../src/engine/blocks/BlockRegistry';
import { CHUNK_SIZE, SEA_LEVEL, WorldType } from '../src/engine/constants/world';
import { Chunk } from '../src/engine/world/Chunk';
import { createChunkGenerator } from '../src/engine/world/ChunkGenerator';
import { FLAT_LAYERS, FlatGenerator } from '../src/engine/world/FlatGenerator';
import { TerrainGenerator } from '../src/engine/world/TerrainGenerator';

function generate(seed: string, cx: number, cz: number): Chunk {
  const chunk = new Chunk(cx, cz);
  new TerrainGenerator(seed).generateChunk(chunk);
  return chunk;
}

describe('TerrainGenerator', () => {
  it('同种子同 chunk 生成结果一致（含负坐标）', () => {
    expect(bytesEqual(generate('seed-123', -3, 7).blocks, generate('seed-123', -3, 7).blocks)).toBe(true);
  });

  it('不同种子生成结果不同', () => {
    expect(bytesEqual(generate('alpha', 0, 0).blocks, generate('beta', 0, 0).blocks)).toBe(false);
  });

  it('底层为基岩且出生点在海平面之上的草地', () => {
    const gen = new TerrainGenerator('spawn');
    const spawn = gen.findSpawn();
    expect(spawn.y).toBeGreaterThan(SEA_LEVEL);
    const world = generateArea(gen, -1, 1);
    const sx = Math.floor(spawn.x);
    const sz = Math.floor(spawn.z);
    expect(world.getBlock(sx, 0, sz)).toBe(BlockId.BEDROCK);
    expect(world.getBlock(sx, spawn.y - 1, sz)).toBe(BlockId.GRASS);
  });

  it('包含多种方块（矿石、树、水）', () => {
    const world = generateArea(new TerrainGenerator('variety'), -4, 4);
    const present = collectBlockIds(world);
    expect(present.has(BlockId.COAL_ORE)).toBe(true);
    expect(present.has(BlockId.LOG)).toBe(true);
    expect(present.has(BlockId.LEAVES)).toBe(true);
    expect(present.has(BlockId.WATER)).toBe(true);
    expect(present.has(BlockId.SAND)).toBe(true);
  });

  it('跨 chunk 边界的树在两侧 chunk 中都完整出现', () => {
    const gen = new TerrainGenerator('trees');
    let checked = 0;
    for (let cx = -6; cx <= 6 && checked === 0; cx++) {
      for (let cz = -6; cz <= 6 && checked === 0; cz++) {
        const tree = gen.listTrees(cx, cz).find((t) => t.x - cx * CHUNK_SIZE === CHUNK_SIZE - 1);
        if (!tree) {
          continue;
        }
        const own = new Chunk(cx, cz);
        const east = new Chunk(cx + 1, cz);
        gen.generateChunk(own);
        gen.generateChunk(east);
        // 树干在本 chunk，树冠最外圈落到东侧 chunk
        expect(own.getLocal(CHUNK_SIZE - 1, tree.y, tree.z - cz * CHUNK_SIZE)).toBe(BlockId.LOG);
        const leafY = tree.y + tree.height - 2;
        expect(east.getLocal(0, leafY, tree.z - cz * CHUNK_SIZE)).toBe(BlockId.LEAVES);
        checked++;
      }
    }
    expect(checked).toBe(1);
  });
});

describe('FlatGenerator', () => {
  it('按预设分层填充且出生点在地表', () => {
    const gen = createChunkGenerator({ seed: 'flat', worldType: WorldType.FLAT, generateStructures: false });
    expect(gen).toBeInstanceOf(FlatGenerator);
    const chunk = new Chunk(-2, 5);
    gen.generateChunk(chunk);
    for (let y = 0; y < FLAT_LAYERS.length; y++) {
      expect(chunk.getLocal(3, y, 9)).toBe(FLAT_LAYERS[y]);
    }
    expect(chunk.getLocal(3, FLAT_LAYERS.length, 9)).toBe(BlockId.AIR);
    expect(gen.findSpawn().y).toBe(FLAT_LAYERS.length);
  });
});
