import { describe, expect, it } from 'vitest';
import { emptyWorld } from './helpers';
import { BlockId } from '../src/engine/blocks/BlockRegistry';
import { WATER_FALLING_META, WATER_MAX_LEVEL, WATER_SOURCE_META } from '../src/engine/constants/fluids';
import { FluidSimulator, waterHeight } from '../src/engine/world/FluidSimulator';
import type { World } from '../src/engine/world/World';

/** 铺一层 y=4 的石板并把变更接到模拟器。 */
function setup(): { world: World; fluids: FluidSimulator } {
  const world = emptyWorld(1);
  for (let x = -16; x < 32; x++) {
    for (let z = -16; z < 32; z++) {
      world.setBlockRaw(x, 4, z, BlockId.STONE);
    }
  }
  const fluids = new FluidSimulator(world);
  world.onBlockChange((x, y, z) => fluids.scheduleAround(x, y, z));
  return { world, fluids };
}

function run(fluids: FluidSimulator, rounds: number): void {
  for (let i = 0; i < rounds; i++) {
    fluids.tick();
  }
}

describe('FluidSimulator', () => {
  it('源方块在平地上向四周扩散 7 格并逐级变浅', () => {
    const { world, fluids } = setup();
    world.setBlock(0, 5, 0, BlockId.WATER, WATER_SOURCE_META);
    run(fluids, 20);
    for (let d = 1; d <= WATER_MAX_LEVEL; d++) {
      expect(world.getBlock(d, 5, 0)).toBe(BlockId.WATER);
      expect(world.getMeta(d, 5, 0)).toBe(d);
    }
    expect(world.getBlock(WATER_MAX_LEVEL + 1, 5, 0)).toBe(BlockId.AIR);
    expect(world.getMeta(0, 5, 0)).toBe(WATER_SOURCE_META);
  });

  it('移除源后流动水逐级消退', () => {
    const { world, fluids } = setup();
    world.setBlock(0, 5, 0, BlockId.WATER, WATER_SOURCE_META);
    run(fluids, 20);
    world.setBlock(0, 5, 0, BlockId.STONE);
    run(fluids, 30);
    for (let d = 1; d <= WATER_MAX_LEVEL; d++) {
      expect(world.getBlock(d, 5, 0)).toBe(BlockId.AIR);
    }
  });

  it('两源之间的流动水升级为源（无限水）', () => {
    const { world, fluids } = setup();
    world.setBlock(0, 5, 0, BlockId.WATER, WATER_SOURCE_META);
    world.setBlock(2, 5, 0, BlockId.WATER, WATER_SOURCE_META);
    run(fluids, 5);
    expect(world.getBlock(1, 5, 0)).toBe(BlockId.WATER);
    expect(world.getMeta(1, 5, 0)).toBe(WATER_SOURCE_META);
  });

  it('遇到落差时向下形成下落水且不横向扩散', () => {
    const { world, fluids } = setup();
    // 在 (1,4,0) 挖一个深坑
    world.setBlockRaw(1, 4, 0, BlockId.AIR);
    world.setBlockRaw(1, 3, 0, BlockId.AIR);
    world.setBlockRaw(1, 2, 0, BlockId.STONE);
    world.setBlock(0, 5, 0, BlockId.WATER, WATER_SOURCE_META);
    run(fluids, 20);
    expect(world.getMeta(1, 5, 0)).toBe(1);
    expect(world.getMeta(1, 4, 0)).toBe(WATER_FALLING_META);
    expect(world.getMeta(1, 3, 0)).toBe(WATER_FALLING_META);
    // 坑底（下方是石头）的下落水以 1 级向外扩散
    expect(world.getMeta(2, 3, 0)).toBe(1);
  });

  it('水面高度随水位递减，下落水满高', () => {
    expect(waterHeight(WATER_SOURCE_META, false)).toBeGreaterThan(waterHeight(3, false));
    expect(waterHeight(3, false)).toBeGreaterThan(waterHeight(WATER_MAX_LEVEL, false));
    expect(waterHeight(WATER_FALLING_META, false)).toBe(1);
    expect(waterHeight(2, true)).toBe(1);
  });
});
