import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/engine/blocks/BlockRegistry';
import { GravitySystem } from '../src/engine/systems/GravitySystem';
import { emptyWorld } from './helpers';

describe('GravitySystem', () => {
  it('悬空放下的沙子下一 tick 落到底，链式带动上面的', () => {
    const world = emptyWorld(1);
    const gravity = new GravitySystem(world);
    world.setBlock(3, 1, 3, BlockId.STONE);
    world.setBlock(3, 6, 3, BlockId.SAND);
    world.setBlock(3, 7, 3, BlockId.GRAVEL);
    expect(gravity.pendingCount).toBe(2);
    gravity.tick();
    expect(world.getBlock(3, 2, 3)).toBe(BlockId.SAND);
    // 沙子落走后砾石脚下空了，被重新排队，再 tick 一次落到沙子上
    gravity.tick();
    expect(world.getBlock(3, 3, 3)).toBe(BlockId.GRAVEL);
    expect(world.getBlock(3, 6, 3)).toBe(BlockId.AIR);
    expect(world.getBlock(3, 7, 3)).toBe(BlockId.AIR);
  });

  it('脚下方块被掏空时上面的沙子会掉', () => {
    const world = emptyWorld(1);
    const gravity = new GravitySystem(world);
    world.setBlock(2, 3, 2, BlockId.STONE);
    world.setBlock(2, 4, 2, BlockId.SAND);
    gravity.tick();
    expect(world.getBlock(2, 4, 2)).toBe(BlockId.SAND);
    world.setBlock(2, 3, 2, BlockId.AIR);
    gravity.tick();
    expect(world.getBlock(2, 0, 2)).toBe(BlockId.SAND);
    expect(world.getBlock(2, 4, 2)).toBe(BlockId.AIR);
  });

  it('联机客户端：拦截器接管后本地世界不变、意图被记录', () => {
    const world = emptyWorld(1);
    const sent: number[][] = [];
    world.writeInterceptor = (x, y, z, id, meta) => {
      sent.push([x, y, z, id, meta]);
      return true;
    };
    expect(world.setBlock(1, 1, 1, BlockId.STONE)).toBe(false);
    expect(world.getBlock(1, 1, 1)).toBe(BlockId.AIR);
    world.writeInterceptor = null;
    world.setBlock(1, 1, 1, BlockId.WOODEN_DOOR, 0);
    world.writeInterceptor = (x, y, z, id, meta) => {
      sent.push([x, y, z, id, meta]);
      return true;
    };
    expect(world.setMeta(1, 1, 1, 4)).toBe(false);
    expect(world.getMeta(1, 1, 1)).toBe(0);
    expect(sent).toEqual([
      [1, 1, 1, BlockId.STONE, 0],
      [1, 1, 1, BlockId.WOODEN_DOOR, 4],
    ]);
  });
});
