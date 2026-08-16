import { describe, expect, it } from 'vitest';
import { emptyWorld } from './helpers';
import { BlockId } from '../src/engine/blocks/BlockRegistry';
import { CROP_MAX_STAGE, FARMLAND_MAX_MOISTURE } from '../src/engine/blocks/blockShapes';
import { MAX_LIGHT } from '../src/engine/constants/world';
import { RandomTickSystem } from '../src/engine/systems/RandomTickSystem';
import type { World } from '../src/engine/world/World';

/** 固定光照、可控随机数的宿主。 */
function host(world: World, light = MAX_LIGHT, values: number[] = []) {
  let i = 0;
  return {
    world,
    isRaining: false,
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

  it('小麦在湿耕地上会一阶段一阶段长到成熟', () => {
    const world = emptyWorld(0);
    world.setBlock(0, 10, 0, BlockId.FARMLAND, FARMLAND_MAX_MOISTURE);
    world.setBlock(0, 11, 0, BlockId.WHEAT, 0);
    const system = new RandomTickSystem(host(world));
    expect(runUntil(system, [0, 11, 0], () => world.getMeta(0, 11, 0) === CROP_MAX_STAGE)).toBe(true);
    // 成熟后不再变化
    system.tickBlock(0, 11, 0);
    expect(world.getMeta(0, 11, 0)).toBe(CROP_MAX_STAGE);
  });

  it('胡萝卜与土豆和小麦一样会生长', () => {
    for (const crop of [BlockId.CARROTS, BlockId.POTATOES]) {
      const world = emptyWorld(0);
      world.setBlock(0, 10, 0, BlockId.FARMLAND, FARMLAND_MAX_MOISTURE);
      world.setBlock(0, 11, 0, crop, 0);
      const system = new RandomTickSystem(host(world));
      expect(runUntil(system, [0, 11, 0], () => world.getMeta(0, 11, 0) === CROP_MAX_STAGE)).toBe(true);
    }
  });

  it('太暗的小麦不会生长', () => {
    const world = emptyWorld(0);
    world.setBlock(0, 10, 0, BlockId.FARMLAND, FARMLAND_MAX_MOISTURE);
    world.setBlock(0, 11, 0, BlockId.WHEAT, 0);
    const system = new RandomTickSystem(host(world, 5));
    runUntil(system, [0, 11, 0], () => false, 500);
    expect(world.getMeta(0, 11, 0)).toBe(0);
  });

  it('附近有水的耕地保持湿润，没水会变干并最终退回泥土', () => {
    const world = emptyWorld(0);
    world.setBlock(0, 10, 0, BlockId.FARMLAND, 0);
    world.setBlock(3, 10, 0, BlockId.WATER);
    const system = new RandomTickSystem(host(world));
    system.tickBlock(0, 10, 0);
    expect(world.getMeta(0, 10, 0)).toBe(FARMLAND_MAX_MOISTURE);
    // 把水挪走后逐渐变干
    world.setBlock(3, 10, 0, BlockId.AIR);
    runUntil(system, [0, 10, 0], () => world.getBlock(0, 10, 0) === BlockId.DIRT, 100);
    expect(world.getBlock(0, 10, 0)).toBe(BlockId.DIRT);
  });

  it('种了东西的干耕地不会退回泥土', () => {
    const world = emptyWorld(0);
    world.setBlock(0, 10, 0, BlockId.FARMLAND, 0);
    world.setBlock(0, 11, 0, BlockId.WHEAT, 0);
    const system = new RandomTickSystem(host(world));
    runUntil(system, [0, 10, 0], () => false, 100);
    expect(world.getBlock(0, 10, 0)).toBe(BlockId.FARMLAND);
  });

  it('没有支撑也没有燃料的火会熄灭', () => {
    const world = emptyWorld(0);
    world.setBlock(0, 10, 0, BlockId.FIRE, 0);
    const system = new RandomTickSystem(host(world));
    system.tickBlock(0, 10, 0);
    expect(world.getBlock(0, 10, 0)).toBe(BlockId.AIR);
  });

  it('石头上的火会慢慢变老，烧完就灭', () => {
    const world = emptyWorld(0);
    world.setBlock(0, 10, 0, BlockId.STONE);
    world.setBlock(0, 11, 0, BlockId.FIRE, 0);
    const system = new RandomTickSystem(host(world));
    expect(runUntil(system, [0, 11, 0], () => world.getBlock(0, 11, 0) === BlockId.AIR, 100)).toBe(true);
  });

  it('火会烧掉脚下的可燃方块', () => {
    const world = emptyWorld(0);
    world.setBlock(0, 10, 0, BlockId.PLANKS);
    world.setBlock(0, 11, 0, BlockId.FIRE, 0);
    const system = new RandomTickSystem(host(world));
    expect(runUntil(system, [0, 11, 0], () => world.getBlock(0, 10, 0) === BlockId.AIR, 200)).toBe(true);
  });

  it('火会蔓延到紧挨可燃方块的空气里', () => {
    const world = emptyWorld(0);
    // 火烧在石头上（不会被吃掉），上方有木板当长期燃料，隔壁 (1,11,0) 是紧挨木板的空气
    world.setBlock(0, 10, 0, BlockId.STONE);
    world.setBlock(0, 11, 0, BlockId.FIRE, 0);
    world.setBlock(0, 12, 0, BlockId.PLANKS);
    world.setBlock(1, 10, 0, BlockId.PLANKS);
    const system = new RandomTickSystem(host(world));
    expect(runUntil(system, [0, 11, 0], () => world.getBlock(1, 11, 0) === BlockId.FIRE, 800)).toBe(true);
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
