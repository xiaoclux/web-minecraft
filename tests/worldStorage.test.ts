import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BlockId } from '../src/engine/blocks/BlockRegistry';
import { ChunkManager } from '../src/engine/world/ChunkManager';
import { FlatGenerator } from '../src/engine/world/FlatGenerator';
import { LightEngine } from '../src/engine/world/LightEngine';
import { World } from '../src/engine/world/World';
import { loadWorld, saveWorld } from '../server/worldStorage';

function makeWorld(): { world: World; chunkManager: ChunkManager } {
  const world = new World(true);
  const light = new LightEngine(world);
  const chunkManager = new ChunkManager(world, new FlatGenerator('storage-seed', false), light);
  return { world, chunkManager };
}

describe('服务端存档', () => {
  it('改过的方块能存下来并原样读回', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcws-'));
    const path = join(dir, 'world.mcws');
    try {
      const a = makeWorld();
      a.chunkManager.ensureLoaded(0, 0, 0);
      a.world.setBlock(3, 10, 4, BlockId.DIAMOND_BLOCK);
      a.world.setBlock(3, 11, 4, BlockId.STONE, 0);
      const saved = saveWorld(path, a.world, 12345);
      expect(saved.chunkCount).toBe(1);

      const b = makeWorld();
      const restored = loadWorld(path, b.chunkManager, true);
      expect(restored?.timeTick).toBe(12345);
      expect(restored?.chunkCount).toBe(1);
      expect(b.world.getBlock(3, 10, 4)).toBe(BlockId.DIAMOND_BLOCK);
      expect(b.world.getBlock(3, 11, 4)).toBe(BlockId.STONE);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('没改过任何方块时存的是空存档', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcws-'));
    const path = join(dir, 'empty.mcws');
    try {
      const a = makeWorld();
      a.chunkManager.ensureLoaded(0, 0, 0);
      expect(saveWorld(path, a.world, 0).chunkCount).toBe(0);
      const b = makeWorld();
      expect(loadWorld(path, b.chunkManager, true)?.chunkCount).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('文件不存在 / 魔数不对 / 半截文件都当作新世界，不抛异常', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcws-'));
    try {
      const { chunkManager } = makeWorld();
      expect(loadWorld(join(dir, '不存在.mcws'), chunkManager, true)).toBeNull();

      const bad = join(dir, 'bad.mcws');
      writeFileSync(bad, Buffer.from('这不是存档文件的开头'));
      expect(loadWorld(bad, chunkManager, true)).toBeNull();

      // 正常存一份，再砍掉一半
      const good = join(dir, 'good.mcws');
      const a = makeWorld();
      a.chunkManager.ensureLoaded(0, 0, 0);
      a.world.setBlock(1, 10, 1, BlockId.STONE);
      saveWorld(good, a.world, 1);
      const bytes = readFileSync(good);
      const truncated = join(dir, 'half.mcws');
      writeFileSync(truncated, bytes.subarray(0, Math.floor(bytes.length / 2)));
      const result = loadWorld(truncated, makeWorld().chunkManager, true);
      // 头部还在所以能读出来，但 chunk 会少
      expect(result?.chunkCount).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('存盘走临时文件再改名，不会留下 .tmp', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcws-'));
    const path = join(dir, 'atomic.mcws');
    try {
      const a = makeWorld();
      a.chunkManager.ensureLoaded(0, 0, 0);
      a.world.setBlock(0, 10, 0, BlockId.STONE);
      saveWorld(path, a.world, 0);
      expect(() => readFileSync(path)).not.toThrow();
      expect(() => readFileSync(`${path}.tmp`)).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
