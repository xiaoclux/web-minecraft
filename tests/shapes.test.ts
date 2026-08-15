import { describe, expect, it } from 'vitest';
import { emptyWorld } from './helpers';
import { BlockId, getBlock } from '../src/engine/blocks/BlockRegistry';
import {
  SLAB_TOP_BIT,
  FACINGS,
  STAIRS_FLIP_BIT,
  collisionBoxes,
  outlineBox,
  shapeBoxes,
} from '../src/engine/blocks/blockShapes';
import { AABB } from '../src/engine/physics/AABB';
import { moveWithCollisions } from '../src/engine/physics/collision';
import { raycastBlocks } from '../src/engine/physics/raycast';
import { RECIPES } from '../src/engine/items/Recipes';

const SLAB = getBlock(BlockId.STONE_SLAB);
const STAIRS = getBlock(BlockId.OAK_STAIRS);

describe('方块形状', () => {
  it('半砖按 meta 占下半或上半', () => {
    expect(shapeBoxes(SLAB, 0)[0]).toMatchObject({ y0: 0, y1: 0.5 });
    expect(shapeBoxes(SLAB, SLAB_TOP_BIT)[0]).toMatchObject({ y0: 0.5, y1: 1 });
  });

  it('楼梯由底层半砖与半格台阶组成，朝向决定台阶在哪一侧', () => {
    const eastFacing = FACINGS.findIndex(([dx]) => dx === 1);
    const boxes = shapeBoxes(STAIRS, eastFacing);
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toMatchObject({ y0: 0, y1: 0.5 });
    expect(boxes[1]).toMatchObject({ x0: 0.5, x1: 1, y0: 0.5, y1: 1 });
  });

  it('楼梯上下颠倒后子盒沿 y 镜像', () => {
    const boxes = shapeBoxes(STAIRS, STAIRS_FLIP_BIT);
    expect(boxes[0]).toMatchObject({ y0: 0.5, y1: 1 });
    expect(boxes[1]).toMatchObject({ y0: 0, y1: 0.5 });
  });

  it('楼梯的选中框是整格，半砖的只有半格', () => {
    expect(outlineBox(STAIRS, 0)).toMatchObject({ y0: 0, y1: 1 });
    expect(outlineBox(SLAB, 0)).toMatchObject({ y0: 0, y1: 0.5 });
  });

  it('不阻挡实体的方块没有碰撞盒', () => {
    expect(collisionBoxes(getBlock(BlockId.TALL_GRASS), 0)).toHaveLength(0);
  });
});

describe('形状参与物理', () => {
  it('下落的实体停在半砖顶面（y=0.5）', () => {
    const world = emptyWorld(1);
    world.setBlock(0, 10, 0, BlockId.STONE_SLAB);
    const box = AABB.fromFeet(0.5, 12, 0.5, 0.6, 1.8);
    const result = moveWithCollisions(world, box, 0, -2, 0);
    expect(result.onGround).toBe(true);
    expect(result.box.minY).toBeCloseTo(10.5, 2);
  });

  it('射线从上方命中半砖的顶面而不是格子顶部', () => {
    const world = emptyWorld(1);
    world.setBlock(0, 10, 0, BlockId.STONE_SLAB);
    const hit = raycastBlocks(world, 0.5, 14, 0.5, 0, -1, 0, 8);
    expect(hit).not.toBeNull();
    expect(hit!.y).toBe(10);
    expect(hit!.hy).toBeCloseTo(10.5, 3);
    expect(hit!.ny).toBe(1);
  });

  it('射线穿过半砖上方的空半格不会误命中', () => {
    const world = emptyWorld(1);
    world.setBlock(0, 10, 0, BlockId.STONE_SLAB);
    // 从侧面沿 y=10.8 平射，应当穿过而不命中
    expect(raycastBlocks(world, -4, 10.8, 0.5, 1, 0, 0, 8)).toBeNull();
  });
});

describe('半砖与楼梯配方', () => {
  it('每种半砖与楼梯都有配方', () => {
    const results = new Set(RECIPES.map((r) => r.result.id));
    for (const id of ['stone_slab', 'oak_slab', 'oak_stairs', 'cobblestone_stairs', 'sandstone_stairs']) {
      expect(results.has(id)).toBe(true);
    }
  });
});
