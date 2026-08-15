import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/engine/blocks/BlockRegistry';
import { AABB } from '../src/engine/physics/AABB';
import { moveWithCollisions } from '../src/engine/physics/collision';
import { raycastBlocks } from '../src/engine/physics/raycast';
import { World } from '../src/engine/world/World';

describe('collision', () => {
  it('下落时停在地面上', () => {
    const world = new World();
    world.setBlockRaw(10, 5, 10, BlockId.STONE);
    const box = AABB.fromFeet(10.5, 8, 10.5, 0.6, 1.8);
    const result = moveWithCollisions(world, box, 0, -5, 0);
    expect(result.onGround).toBe(true);
    expect(result.box.minY).toBeCloseTo(6, 3);
  });

  it('水平方向被墙阻挡', () => {
    const world = new World();
    world.setBlockRaw(12, 5, 10, BlockId.STONE);
    world.setBlockRaw(12, 6, 10, BlockId.STONE);
    const box = AABB.fromFeet(10.5, 5, 10.5, 0.6, 1.8);
    const result = moveWithCollisions(world, box, 3, 0, 0);
    expect(result.collidedX).toBe(true);
    expect(result.box.maxX).toBeLessThanOrEqual(12);
  });

  it('世界边界视为实心', () => {
    const world = new World();
    const box = AABB.fromFeet(0.5, 5, 10.5, 0.6, 1.8);
    const result = moveWithCollisions(world, box, -3, 0, 0);
    expect(result.collidedX).toBe(true);
    expect(result.box.minX).toBeGreaterThanOrEqual(0);
  });
});

describe('raycast', () => {
  it('命中正前方的方块并给出法线', () => {
    const world = new World();
    world.setBlockRaw(10, 5, 5, BlockId.STONE);
    const hit = raycastBlocks(world, 10.5, 5.5, 10.5, 0, 0, -1, 10);
    expect(hit).not.toBeNull();
    expect(hit?.x).toBe(10);
    expect(hit?.z).toBe(5);
    expect(hit?.nz).toBe(1);
  });

  it('默认忽略水', () => {
    const world = new World();
    world.setBlockRaw(10, 5, 5, BlockId.WATER);
    expect(raycastBlocks(world, 10.5, 5.5, 10.5, 0, 0, -1, 10)).toBeNull();
    expect(raycastBlocks(world, 10.5, 5.5, 10.5, 0, 0, -1, 10, true)?.z).toBe(5);
  });
});
