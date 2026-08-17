import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/engine/blocks/BlockRegistry';
import { findPath } from '../src/engine/entities/ai/Pathfinder';
import { World } from '../src/engine/world/World';
import { emptyWorld, fillLayer } from './helpers';

/** 在 y=9 铺一层石头地板，站立面就是 y=10。 */
function floorWorld(): World {
  const world = emptyWorld(2);
  fillLayer(world, 9, 20, BlockId.STONE);
  return world;
}

describe('A* 寻路', () => {
  it('空地上走直线，长度等于曼哈顿距离', () => {
    const world = floorWorld();
    const path = findPath(world, { x: 0, y: 10, z: 0 }, { x: 4, y: 10, z: 0 });
    expect(path.length).toBe(4);
    expect(path[path.length - 1]).toEqual({ x: 4, y: 10, z: 0 });
  });

  it('绕开挡在中间的墙', () => {
    const world = floorWorld();
    // 在 x=2 竖一堵墙，只在 z=3 留个门
    for (let z = -6; z <= 6; z++) {
      if (z === 3) {
        continue;
      }
      world.setBlock(2, 10, z, BlockId.STONE);
      world.setBlock(2, 11, z, BlockId.STONE);
    }
    const path = findPath(world, { x: 0, y: 10, z: 0 }, { x: 5, y: 10, z: 0 });
    expect(path.length).toBeGreaterThan(5);
    // 必须从留出的门那一格穿过去
    expect(path.some((n) => n.x === 2 && n.z === 3)).toBe(true);
    expect(path.some((n) => n.x === 2 && n.z !== 3)).toBe(false);
    expect(path[path.length - 1]).toEqual({ x: 5, y: 10, z: 0 });
  });

  it('会上一格台阶，但不会翻两格高的墙', () => {
    const world = floorWorld();
    world.setBlock(1, 10, 0, BlockId.STONE);
    const stepUp = findPath(world, { x: 0, y: 10, z: 0 }, { x: 1, y: 11, z: 0 });
    expect(stepUp).toEqual([{ x: 1, y: 11, z: 0 }]);

    // 把这一列加高到两格，并把两侧都封死，就过不去了
    const walled = floorWorld();
    for (let z = -20; z <= 20; z++) {
      walled.setBlock(1, 10, z, BlockId.STONE);
      walled.setBlock(1, 11, z, BlockId.STONE);
    }
    expect(findPath(walled, { x: 0, y: 10, z: 0 }, { x: 3, y: 10, z: 0 })).toEqual([]);
  });

  it('愿意跳下 3 格，但不会跳进更深的坑', () => {
    const world = floorWorld();
    // 目标脚下挖到 y=6（落差 3 格）
    for (let d = 0; d < 3; d++) {
      world.setBlock(3, 9 - d, 0, BlockId.AIR);
    }
    world.setBlock(3, 6, 0, BlockId.STONE);
    const path = findPath(world, { x: 0, y: 10, z: 0 }, { x: 3, y: 7, z: 0 });
    expect(path[path.length - 1]).toEqual({ x: 3, y: 7, z: 0 });
  });

  it('目标不可达时返回空路径（不会一直搜下去）', () => {
    const world = floorWorld();
    // 把目标整个用石头围死
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      world.setBlock(6 + dx, 10, dz, BlockId.STONE);
      world.setBlock(6 + dx, 11, dz, BlockId.STONE);
    }
    expect(findPath(world, { x: 0, y: 10, z: 0 }, { x: 6, y: 10, z: 0 })).toEqual([]);
  });
});
