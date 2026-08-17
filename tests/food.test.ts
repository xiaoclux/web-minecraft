import { describe, expect, it } from 'vitest';
import { BlockId, getBlock } from '../src/engine/blocks/BlockRegistry';
import { CAKE_BITES, COCOA_MAX_STAGE, COCOA_STAGE_SHIFT, shapeBoxes } from '../src/engine/blocks/blockShapes';
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

describe('蛋糕', () => {
  it('每吃一口就从一边缺一块，最后一口之后没得吃了', () => {
    const cake = getBlock(BlockId.CAKE);
    const whole = shapeBoxes(cake, 0)[0];
    const halfEaten = shapeBoxes(cake, 3)[0];
    const last = shapeBoxes(cake, CAKE_BITES - 1)[0];
    expect(whole.y1).toBeCloseTo(0.5);
    // 缺角只从 -x 那一侧啃，右边缘始终不动
    expect(halfEaten.x0).toBeGreaterThan(whole.x0);
    expect(last.x0).toBeGreaterThan(halfEaten.x0);
    expect(halfEaten.x1).toBe(whole.x1);
  });

  it('南瓜派与蛋糕都能合出来', () => {
    expect(matchRecipe([{ id: 'pumpkin', count: 1 }, { id: 'sugar', count: 1 }, { id: 'egg', count: 1 }, null], 2)?.id).toBe(
      'pumpkin_pie',
    );
    const milk = { id: 'milk_bucket', count: 1 };
    const wheat = { id: 'wheat', count: 1 };
    const sugar = { id: 'sugar', count: 1 };
    const cake = matchRecipe([milk, milk, milk, sugar, { id: 'egg', count: 1 }, sugar, wheat, wheat, wheat], 3);
    expect(cake?.id).toBe('cake');
  });
});

describe('可可果', () => {
  it('三个成熟阶段的豆荚一个比一个大，且都贴在朝向那一面', () => {
    const cocoa = getBlock(BlockId.COCOA);
    // FACINGS[0] = +x：豆荚贴在 +x 那一侧
    const small = shapeBoxes(cocoa, 0)[0];
    const large = shapeBoxes(cocoa, COCOA_MAX_STAGE << COCOA_STAGE_SHIFT)[0];
    expect(large.x1 - large.x0).toBeGreaterThan(small.x1 - small.x0);
    expect(small.x1).toBe(1);
    expect(large.x1).toBe(1);
  });

  it('随机 tick 会慢慢长熟，熟了就不再长', () => {
    const world = emptyWorld(1);
    world.setBlock(0, 10, 0, BlockId.COCOA, 0);
    const system = new RandomTickSystem({
      world,
      random: () => 0.1,
      lightLevelAt: () => 15,
      get isRaining(): boolean {
        return false;
      },
    });
    for (let i = 0; i < 50; i++) {
      system.tickBlock(0, 10, 0);
    }
    expect(world.getMeta(0, 10, 0) >> COCOA_STAGE_SHIFT).toBe(COCOA_MAX_STAGE);
  });

  it('可可豆能做曲奇，也能当棕色染料用', () => {
    const cookie = matchRecipe(
      [{ id: 'wheat', count: 1 }, { id: 'cocoa_beans', count: 1 }, { id: 'wheat', count: 1 }, null, null, null, null, null, null],
      3,
    );
    expect(cookie?.id).toBe('cookie');
    expect(cookie?.count).toBe(8);
    expect(matchRecipe([{ id: 'cocoa_beans', count: 1 }, null, null, null], 2)?.id).toBe('brown_dye');
  });
});
