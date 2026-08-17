import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/engine/blocks/BlockRegistry';
import { RandomTickSystem } from '../src/engine/systems/RandomTickSystem';
import { matchRecipe } from '../src/engine/items/Recipes';
import { World } from '../src/engine/world/World';
import { emptyWorld } from './helpers';

/** 固定序列的伪随机，保证测试可复现又能取到不同的方向。 */
function seededRandom(): () => number {
  let state = 1;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

function tickSystem(world: World, light: number): RandomTickSystem {
  const random = seededRandom();
  return new RandomTickSystem({
    world,
    random,
    lightLevelAt: () => light,
    get isRaining(): boolean {
      return false;
    },
  });
}

describe('蘑菇', () => {
  it('太亮就枯死', () => {
    const world = emptyWorld(1);
    world.setBlock(0, 9, 0, BlockId.STONE);
    world.setBlock(0, 10, 0, BlockId.BROWN_MUSHROOM);
    tickSystem(world, 15).tickBlock(0, 10, 0);
    expect(world.getBlock(0, 10, 0)).toBe(BlockId.AIR);
  });

  it('暗处会往附近的实心方块上蔓延，且蔓延出的是同一种蘑菇', () => {
    const world = emptyWorld(1);
    for (let x = -3; x <= 3; x++) {
      for (let z = -3; z <= 3; z++) {
        world.setBlock(x, 9, z, BlockId.STONE);
      }
    }
    world.setBlock(0, 10, 0, BlockId.RED_MUSHROOM);
    const system = tickSystem(world, 3);
    for (let i = 0; i < 20; i++) {
      system.tickBlock(0, 10, 0);
    }
    let spread = 0;
    for (let x = -3; x <= 3; x++) {
      for (let z = -3; z <= 3; z++) {
        if (world.getBlock(x, 10, z) === BlockId.RED_MUSHROOM && !(x === 0 && z === 0)) {
          spread++;
        }
        expect(world.getBlock(x, 10, z)).not.toBe(BlockId.BROWN_MUSHROOM);
      }
    }
    expect(spread).toBeGreaterThan(0);
  });

  it('两种蘑菇加一个碗合成蘑菇煲，吃完剩个碗', async () => {
    const stew = matchRecipe(
      [{ id: 'brown_mushroom', count: 1 }, { id: 'red_mushroom', count: 1 }, { id: 'bowl', count: 1 }, null],
      2,
    );
    expect(stew?.id).toBe('mushroom_stew');
    const { getItem } = await import('../src/engine/items/ItemRegistry');
    expect(getItem('mushroom_stew')?.food?.leftover).toBe('bowl');
  });
});
