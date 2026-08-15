import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/engine/blocks/BlockRegistry';
import { MAX_LIGHT } from '../src/engine/constants/world';
import { LightEngine } from '../src/engine/world/LightEngine';
import { World } from '../src/engine/world/World';

function flatWorld(height: number): World {
  const world = new World();
  for (let z = 0; z < world.sizeZ; z++) {
    for (let x = 0; x < world.sizeX; x++) {
      for (let y = 0; y < height; y++) {
        world.setBlockRaw(x, y, z, BlockId.STONE);
      }
    }
  }
  return world;
}

describe('LightEngine', () => {
  it('地表之上天空光为 15，地下为 0', () => {
    const world = flatWorld(10);
    const engine = new LightEngine(world);
    engine.computeAll();
    expect(world.getSkyLight(50, 10, 50)).toBe(MAX_LIGHT);
    expect(world.getSkyLight(50, 5, 50)).toBe(0);
  });

  it('挖开洞后局部重算让天空光透入', () => {
    const world = flatWorld(10);
    const engine = new LightEngine(world);
    engine.computeAll();
    world.setBlock(50, 9, 50, BlockId.AIR);
    world.setBlock(50, 8, 50, BlockId.AIR);
    world.setBlock(51, 8, 50, BlockId.AIR);
    engine.updateAround(50, 50);
    expect(world.getSkyLight(50, 8, 50)).toBe(MAX_LIGHT);
    expect(world.getSkyLight(51, 8, 50)).toBe(MAX_LIGHT - 1);
  });

  it('火把在地下发出方块光并随距离衰减', () => {
    const world = flatWorld(10);
    for (let x = 40; x < 60; x++) {
      world.setBlockRaw(x, 5, 50, BlockId.AIR);
    }
    world.setBlockRaw(50, 5, 50, BlockId.TORCH);
    const engine = new LightEngine(world);
    engine.computeAll();
    expect(world.getBlockLight(50, 5, 50)).toBe(14);
    expect(world.getBlockLight(53, 5, 50)).toBe(11);
    expect(world.getBlockLight(50, 8, 50)).toBe(0);
  });
});
