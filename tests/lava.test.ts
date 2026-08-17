import { describe, expect, it } from 'vitest';
import { emptyWorld, fillLayer } from './helpers';
import { BlockId } from '../src/engine/blocks/BlockRegistry';
import { LAVA_MAX_LEVEL, WATER_SOURCE_META } from '../src/engine/constants/fluids';
import { FluidSimulator, fluidSpecOf } from '../src/engine/world/FluidSimulator';
import type { World } from '../src/engine/world/World';

/** 跑 n 轮流体 tick。 */
function run(sim: FluidSimulator, n: number): void {
  for (let i = 0; i < n; i++) {
    sim.tick();
  }
}

/** 在 y=10 铺一层石头地板。 */
function floorWorld(): World {
  const world = emptyWorld(1);
  fillLayer(world, 10, 8, BlockId.STONE);
  return world;
}

describe('流体参数表', () => {
  it('水和岩浆有各自的流动距离与更新间隔', () => {
    expect(fluidSpecOf(BlockId.WATER)?.infiniteSource).toBe(true);
    expect(fluidSpecOf(BlockId.LAVA)?.infiniteSource).toBe(false);
    expect(fluidSpecOf(BlockId.LAVA)?.maxLevel).toBe(LAVA_MAX_LEVEL);
    expect(fluidSpecOf(BlockId.STONE)).toBeNull();
  });
});

describe('岩浆流动', () => {
  it('岩浆只流 3 格且比水慢', () => {
    const world = floorWorld();
    const sim = new FluidSimulator(world);
    world.setBlock(0, 11, 0, BlockId.LAVA, WATER_SOURCE_META);
    run(sim, 200);
    expect(world.getBlock(LAVA_MAX_LEVEL, 11, 0)).toBe(BlockId.LAVA);
    expect(world.getBlock(LAVA_MAX_LEVEL + 1, 11, 0)).toBe(BlockId.AIR);
  });

  it('岩浆没有无限源：两个源之间不会补出第三个源', () => {
    const world = floorWorld();
    const sim = new FluidSimulator(world);
    world.setBlock(-1, 11, 0, BlockId.LAVA, WATER_SOURCE_META);
    world.setBlock(1, 11, 0, BlockId.LAVA, WATER_SOURCE_META);
    run(sim, 200);
    expect(world.getMeta(0, 11, 0)).not.toBe(WATER_SOURCE_META);
  });
});

describe('岩浆遇水凝固', () => {
  it('岩浆源碰到水变黑曜石', () => {
    const world = floorWorld();
    const sim = new FluidSimulator(world);
    world.setBlock(0, 11, 0, BlockId.LAVA, WATER_SOURCE_META);
    world.setBlock(0, 12, 0, BlockId.WATER, WATER_SOURCE_META);
    run(sim, 40);
    expect(world.getBlock(0, 11, 0)).toBe(BlockId.OBSIDIAN);
  });

  it('流动的岩浆碰到水变圆石', () => {
    const world = floorWorld();
    const sim = new FluidSimulator(world);
    world.setBlock(0, 11, 0, BlockId.LAVA, 1);
    world.setBlock(1, 11, 0, BlockId.WATER, WATER_SOURCE_META);
    run(sim, 40);
    expect(world.getBlock(0, 11, 0)).toBe(BlockId.COBBLESTONE);
  });
});
