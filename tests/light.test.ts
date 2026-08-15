import { describe, expect, it } from 'vitest';
import { emptyWorld } from './helpers';
import { BlockId } from '../src/engine/blocks/BlockRegistry';
import { CHUNK_SIZE, MAX_LIGHT } from '../src/engine/constants/world';
import { Chunk } from '../src/engine/world/Chunk';
import { LightEngine } from '../src/engine/world/LightEngine';
import { World } from '../src/engine/world/World';

/** 把已有 chunk 填成 height 高的石板并点亮。 */
function flatWorld(height: number, radius = 3): { world: World; engine: LightEngine } {
  const world = emptyWorld(radius);
  for (const chunk of world.chunks.values()) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let y = 0; y < height; y++) {
          chunk.setLocal(lx, y, lz, BlockId.STONE);
        }
      }
    }
    chunk.isLit = false;
  }
  const engine = new LightEngine(world);
  for (const chunk of world.chunks.values()) {
    engine.lightChunk(chunk);
  }
  return { world, engine };
}

describe('LightEngine', () => {
  it('地表之上天空光为 15，地下为 0', () => {
    const { world } = flatWorld(10);
    expect(world.getSkyLight(5, 10, 5)).toBe(MAX_LIGHT);
    expect(world.getSkyLight(5, 5, 5)).toBe(0);
    expect(world.getSkyLight(-20, 10, -20)).toBe(MAX_LIGHT);
  });

  it('挖开洞后增量更新让天空光透入', () => {
    const { world } = flatWorld(10);
    world.setBlock(5, 9, 5, BlockId.AIR);
    world.setBlock(5, 8, 5, BlockId.AIR);
    world.setBlock(6, 8, 5, BlockId.AIR);
    expect(world.getSkyLight(5, 8, 5)).toBe(MAX_LIGHT);
    expect(world.getSkyLight(6, 8, 5)).toBe(MAX_LIGHT - 1);
  });

  it('火把在地下发出方块光并随距离衰减', () => {
    const { world } = flatWorld(10);
    for (let x = -10; x < 10; x++) {
      world.setBlock(x, 5, 5, BlockId.AIR);
    }
    world.setBlock(0, 5, 5, BlockId.TORCH);
    expect(world.getBlockLight(0, 5, 5)).toBe(14);
    expect(world.getBlockLight(3, 5, 5)).toBe(11);
    expect(world.getBlockLight(0, 8, 5)).toBe(0);
  });

  it('后加载的 chunk 会把光传入相邻已点亮 chunk 的洞穴', () => {
    const { world, engine } = flatWorld(10, 1);
    // chunk(2,0) 尚未加载；chunk(1,0) 靠边有一条水平通道，通道口朝向 x=32
    for (let x = 20; x < 32; x++) {
      world.setBlock(x, 5, 0, BlockId.AIR);
    }
    expect(world.getSkyLight(31, 5, 0)).toBe(0);
    // 加载 chunk(2,0)：x=32 处地面只有 3 高，通道口暴露在天空下
    const chunk = new Chunk(2, 0);
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let y = 0; y < 3; y++) {
          chunk.setLocal(lx, y, lz, BlockId.STONE);
        }
      }
    }
    world.addChunk(chunk);
    engine.lightChunk(chunk);
    expect(world.getSkyLight(31, 5, 0)).toBe(MAX_LIGHT - 1);
    expect(world.getSkyLight(28, 5, 0)).toBe(MAX_LIGHT - 4);
  });
});

describe('LightEngine 增量更新', () => {
  it('放回方块后光照与从未挖开时一致（撤光正确）', () => {
    const { world } = flatWorld(10);
    const before = world.getSkyLight(6, 8, 5);
    world.setBlock(5, 9, 5, BlockId.AIR);
    world.setBlock(5, 8, 5, BlockId.AIR);
    world.setBlock(6, 8, 5, BlockId.AIR);
    world.setBlock(5, 9, 5, BlockId.STONE);
    expect(world.getSkyLight(5, 8, 5)).toBe(0);
    expect(world.getSkyLight(6, 8, 5)).toBe(before);
  });

  it('移除火把后方块光被回收', () => {
    const { world } = flatWorld(10);
    for (let x = -10; x < 10; x++) {
      world.setBlock(x, 5, 5, BlockId.AIR);
    }
    world.setBlock(0, 5, 5, BlockId.TORCH);
    expect(world.getBlockLight(3, 5, 5)).toBe(11);
    world.setBlock(0, 5, 5, BlockId.AIR);
    expect(world.getBlockLight(3, 5, 5)).toBe(0);
    expect(world.getBlockLight(0, 5, 5)).toBe(0);
  });

  it('在露天放置方块会遮住下方的直射天光', () => {
    const { world } = flatWorld(10);
    world.setBlock(5, 12, 5, BlockId.STONE);
    expect(world.getSkyLight(5, 11, 5)).toBe(MAX_LIGHT - 1);
    expect(world.getSkyLight(5, 13, 5)).toBe(MAX_LIGHT);
    world.setBlock(5, 12, 5, BlockId.AIR);
    expect(world.getSkyLight(5, 11, 5)).toBe(MAX_LIGHT);
  });
});
