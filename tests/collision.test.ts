import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/engine/blocks/BlockRegistry';
import { AABB } from '../src/engine/physics/AABB';
import { moveWithCollisions } from '../src/engine/physics/collision';
import { raycastBlocks } from '../src/engine/physics/raycast';
import type { World } from '../src/engine/world/World';
import { emptyWorld } from './helpers';
import { WATER_CLIMB_VELOCITY } from '../src/engine/constants/game';
import type { EntityContext } from '../src/engine/entities/EntityContext';
import { ItemDropEntity } from '../src/engine/entities/ItemDropEntity';
import { createStack } from '../src/engine/items/ItemStack';

describe('collision', () => {
  it('下落时停在地面上', () => {
    const world = emptyWorld(2);
    world.setBlockRaw(10, 5, 10, BlockId.STONE);
    const box = AABB.fromFeet(10.5, 8, 10.5, 0.6, 1.8);
    const result = moveWithCollisions(world, box, 0, -5, 0);
    expect(result.onGround).toBe(true);
    expect(result.box.minY).toBeCloseTo(6, 3);
  });

  it('水平方向被墙阻挡', () => {
    const world = emptyWorld(2);
    world.setBlockRaw(12, 5, 10, BlockId.STONE);
    world.setBlockRaw(12, 6, 10, BlockId.STONE);
    const box = AABB.fromFeet(10.5, 5, 10.5, 0.6, 1.8);
    const result = moveWithCollisions(world, box, 3, 0, 0);
    expect(result.collidedX).toBe(true);
    expect(result.box.maxX).toBeLessThanOrEqual(12);
  });

  it('未加载 chunk 视为实心', () => {
    const world = emptyWorld(2);
    const box = AABB.fromFeet(-31.5, 5, 10.5, 0.6, 1.8);
    const result = moveWithCollisions(world, box, -3, 0, 0);
    expect(result.collidedX).toBe(true);
    expect(result.box.minX).toBeGreaterThanOrEqual(-32);
  });
});

describe('raycast', () => {
  it('命中正前方的方块并给出法线', () => {
    const world = emptyWorld(2);
    world.setBlockRaw(10, 5, 5, BlockId.STONE);
    const hit = raycastBlocks(world, 10.5, 5.5, 10.5, 0, 0, -1, 10);
    expect(hit).not.toBeNull();
    expect(hit?.x).toBe(10);
    expect(hit?.z).toBe(5);
    expect(hit?.nz).toBe(1);
  });

  it('默认忽略水', () => {
    const world = emptyWorld(2);
    world.setBlockRaw(10, 5, 5, BlockId.WATER);
    expect(raycastBlocks(world, 10.5, 5.5, 10.5, 0, 0, -1, 10)).toBeNull();
    expect(raycastBlocks(world, 10.5, 5.5, 10.5, 0, 0, -1, 10, true)?.z).toBe(5);
  });
});

describe('water climb', () => {
  /** 只提供物理所需字段的最小上下文。 */
  function physicsContext(world: World): EntityContext {
    return { world, waterFlowAt: () => ({ x: 0, z: 0 }) } as unknown as EntityContext;
  }

  /** 两格深的水池（y=4..5），x=13 处是岸，岸顶高度由 shoreTop 决定。 */
  function buildPool(shoreTop: number): World {
    const world = emptyWorld(2);
    for (let x = 8; x <= 12; x++) {
      for (let z = 8; z <= 12; z++) {
        world.setBlockRaw(x, 3, z, BlockId.STONE);
        world.setBlockRaw(x, 4, z, BlockId.WATER);
        world.setBlockRaw(x, 5, z, BlockId.WATER);
      }
    }
    for (let z = 8; z <= 12; z++) {
      for (let y = 3; y <= shoreTop; y++) {
        world.setBlockRaw(13, y, z, BlockId.STONE);
      }
    }
    return world;
  }

  function swimmer(): ItemDropEntity {
    const entity = new ItemDropEntity(createStack('stone'));
    entity.width = 0.6;
    entity.height = 1.8;
    // 游泳时身体在水面附近上下浮动，这里取脚在水面下 0.5 的时刻
    entity.setPosition(12.5, 5.5, 10.5);
    entity.vx = 10;
    return entity;
  }

  it('游泳时贴着高出水面一格的岸边会获得攀爬速度', () => {
    const world = buildPool(5);
    const entity = swimmer();
    entity.move(physicsContext(world), 0.05);
    expect(entity.collidedHorizontally).toBe(true);
    expect(entity.vy).toBeCloseTo(WATER_CLIMB_VELOCITY, 5);
  });

  it('岸边上方仍有方块时不会攀爬', () => {
    const world = buildPool(8);
    const entity = swimmer();
    entity.move(physicsContext(world), 0.05);
    expect(entity.collidedHorizontally).toBe(true);
    expect(entity.vy).toBeLessThan(1);
  });
});
