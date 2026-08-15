import { describe, expect, it } from 'vitest';
import { emptyWorld } from './helpers';
import { BlockId } from '../src/engine/blocks/BlockRegistry';
import { MAX_LIGHT } from '../src/engine/constants/world';
import { RandomTickSystem } from '../src/engine/systems/RandomTickSystem';
import type { World } from '../src/engine/world/World';

/** 固定光照、可控随机数的宿主。 */
function host(world: World, light = MAX_LIGHT, values: number[] = []) {
  let i = 0;
  return {
    world,
    lightLevelAt: () => light,
    random: () => (values.length > 0 ? values[i++ % values.length] : Math.random()),
  };
}

/** 反复对某个方块跑随机 tick 直到条件成立或超时。 */
function runUntil(
  system: RandomTickSystem,
  pos: readonly [number, number, number],
  check: () => boolean,
  maxTicks = 2000,
): boolean {
  for (let i = 0; i < maxTicks; i++) {
    system.tickBlock(pos[0], pos[1], pos[2]);
    if (check()) {
      return true;
    }
  }
  return false;
}

describe('随机 tick', () => {
  it('露天的泥土挨着草方块时会长出草', () => {
    const world = emptyWorld(0);
    world.setBlock(0, 10, 0, BlockId.GRASS);
    world.setBlock(1, 10, 0, BlockId.DIRT);
    const system = new RandomTickSystem(host(world));
    expect(runUntil(system, [1, 10, 0], () => world.getBlock(1, 10, 0) === BlockId.GRASS)).toBe(true);
  });

  it('被不透光方块压住的草会退化成泥土', () => {
    const world = emptyWorld(0);
    world.setBlock(0, 10, 0, BlockId.GRASS);
    world.setBlock(0, 11, 0, BlockId.STONE);
    const system = new RandomTickSystem(host(world));
    expect(runUntil(system, [0, 10, 0], () => world.getBlock(0, 10, 0) === BlockId.DIRT)).toBe(true);
  });

  it('太暗的地方草不会蔓延', () => {
    const world = emptyWorld(0);
    world.setBlock(0, 10, 0, BlockId.GRASS);
    world.setBlock(1, 10, 0, BlockId.DIRT);
    const system = new RandomTickSystem(host(world, 2));
    runUntil(system, [1, 10, 0], () => false, 300);
    expect(world.getBlock(1, 10, 0)).toBe(BlockId.DIRT);
  });

  it('够亮且上方空旷的树苗会长成树', () => {
    const world = emptyWorld(0);
    world.setBlock(0, 10, 0, BlockId.DIRT);
    world.setBlock(0, 11, 0, BlockId.SAPLING);
    const system = new RandomTickSystem(host(world));
    expect(runUntil(system, [0, 11, 0], () => world.getBlock(0, 11, 0) === BlockId.LOG)).toBe(true);
    // 树干上方还有树干，四周有树叶
    expect(world.getBlock(0, 12, 0)).toBe(BlockId.LOG);
    let leaves = 0;
    for (let y = 12; y < 18; y++) {
      for (let x = -2; x <= 2; x++) {
        for (let z = -2; z <= 2; z++) {
          if (world.getBlock(x, y, z) === BlockId.LEAVES) {
            leaves++;
          }
        }
      }
    }
    expect(leaves).toBeGreaterThan(10);
  });

  it('上方被挡住的树苗不会长大', () => {
    const world = emptyWorld(0);
    world.setBlock(0, 10, 0, BlockId.DIRT);
    world.setBlock(0, 11, 0, BlockId.SAPLING);
    world.setBlock(0, 13, 0, BlockId.STONE);
    const system = new RandomTickSystem(host(world));
    runUntil(system, [0, 11, 0], () => false, 300);
    expect(world.getBlock(0, 11, 0)).toBe(BlockId.SAPLING);
  });
});
