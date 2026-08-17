import { describe, expect, it } from 'vitest';
import { emptyWorld } from './helpers';
import { BlockId, getBlock } from '../src/engine/blocks/BlockRegistry';
import {
  BED_HEAD_BIT,
  DOOR_OPEN_BIT,
  DOOR_THICKNESS,
  DOOR_UPPER_BIT,
  FENCE_COLLISION_HEIGHT,
  SLAB_TOP_BIT,
  TRAPDOOR_OPEN_BIT,
  TRAPDOOR_TOP_BIT,
  FACINGS,
  STAIRS_FLIP_BIT,
  canConnect,
  collisionBoxes,
  computeConnections,
  connectionBit,
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

describe('门与床的形状', () => {
  const DOOR = getBlock(BlockId.WOODEN_DOOR);
  const eastFacing = FACINGS.findIndex(([dx]) => dx === 1);

  it('关着的门板横在通道上，开着后转到侧面让出通道', () => {
    const closed = shapeBoxes(DOOR, eastFacing)[0];
    // 朝向 +X，关门时门板贴在 -X 面
    expect(closed).toMatchObject({ x0: 0, x1: DOOR_THICKNESS, y0: 0, y1: 1 });
    const open = shapeBoxes(DOOR, eastFacing | DOOR_OPEN_BIT)[0];
    expect(open.x1 - open.x0).toBe(1);
    expect(open.z1 - open.z0).toBeCloseTo(DOOR_THICKNESS, 5);
  });

  it('门的上下两半用不同贴图', () => {
    expect(DOOR.texturesForMeta?.(0).north).toBe('door_lower');
    expect(DOOR.texturesForMeta?.(DOOR_UPPER_BIT).north).toBe('door_upper');
  });

  it('床头与床尾用不同贴图', () => {
    const bed = getBlock(BlockId.BED);
    expect(bed.texturesForMeta?.(0).top).toBe('bed_foot_top');
    expect(bed.texturesForMeta?.(BED_HEAD_BIT).top).toBe('bed_head_top');
  });
});

describe('栅栏的连接形状', () => {
  const FENCE = getBlock(BlockId.FENCE);

  it('孤立的栅栏只有中心柱，连接后长出横杆', () => {
    expect(shapeBoxes(FENCE, 0, 0)).toHaveLength(1);
    // 一个方向连接 = 中心柱 + 上下两根横杆
    expect(shapeBoxes(FENCE, 0, connectionBit(0))).toHaveLength(3);
    expect(shapeBoxes(FENCE, 0, connectionBit(0) | connectionBit(2))).toHaveLength(5);
  });

  it('碰撞盒比外观高，跳不过去', () => {
    expect(collisionBoxes(FENCE, 0, 0)[0].y1).toBe(FENCE_COLLISION_HEIGHT);
    expect(shapeBoxes(FENCE, 0, 0)[0].y1).toBe(1);
  });

  it('栅栏与栅栏、与实心整方块相连，与空气不相连', () => {
    expect(canConnect(FENCE, getBlock(BlockId.FENCE))).toBe(true);
    expect(canConnect(FENCE, getBlock(BlockId.STONE))).toBe(true);
    expect(canConnect(FENCE, getBlock(BlockId.AIR))).toBe(false);
    expect(canConnect(FENCE, getBlock(BlockId.TALL_GRASS))).toBe(false);
  });

  it('computeConnections 按四邻算掩码', () => {
    const mask = computeConnections(FENCE, (dx) => getBlock(dx === 1 ? BlockId.STONE : BlockId.AIR));
    expect(mask).toBe(connectionBit(FACINGS.findIndex(([x]) => x === 1)));
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

  it('关着的门挡住去路，开着的门可以走过去', () => {
    const world = emptyWorld(1);
    const facing = FACINGS.findIndex(([dx]) => dx === 1);
    world.setBlock(1, 10, 0, BlockId.WOODEN_DOOR, facing);
    world.setBlock(1, 11, 0, BlockId.WOODEN_DOOR, facing | DOOR_UPPER_BIT);
    const box = AABB.fromFeet(0.5, 10, 0.5, 0.6, 1.8);
    expect(moveWithCollisions(world, box, 0.5, 0, 0).dx).toBeLessThan(0.5);
    world.setMeta(1, 10, 0, facing | DOOR_OPEN_BIT);
    world.setMeta(1, 11, 0, facing | DOOR_UPPER_BIT | DOOR_OPEN_BIT);
    expect(moveWithCollisions(world, box, 0.5, 0, 0).dx).toBeCloseTo(0.5, 3);
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

describe('玻璃板 / 铁栏杆 / 活板门', () => {
  const pane = getBlock(BlockId.GLASS_PANE);
  const trapdoor = getBlock(BlockId.TRAPDOOR);

  it('玻璃板孤零零时只有中间一根柱子，连上邻居后朝那边伸出去', () => {
    const alone = shapeBoxes(pane, 0, 0);
    expect(alone.length).toBe(1);
    // 连接 +x 后多一段伸到格子边的板
    const connected = shapeBoxes(pane, 0, connectionBit(0));
    expect(connected.length).toBe(2);
    expect(connected[1].x1).toBe(1);
  });

  it('玻璃板与同组方块及实心方块相连，与空气不相连', () => {
    expect(canConnect(pane, getBlock(BlockId.IRON_BARS))).toBe(true);
    expect(canConnect(pane, getBlock(BlockId.STONE))).toBe(true);
    expect(canConnect(pane, getBlock(BlockId.AIR))).toBe(false);
  });

  it('活板门关着是薄薄一层，开着立起来贴在朝向那一侧', () => {
    const closed = shapeBoxes(trapdoor, 0)[0];
    expect(closed.y0).toBe(0);
    expect(closed.y1).toBeLessThan(0.2);

    const top = shapeBoxes(trapdoor, TRAPDOOR_TOP_BIT)[0];
    expect(top.y1).toBe(1);
    expect(top.y0).toBeGreaterThan(0.8);

    const open = shapeBoxes(trapdoor, TRAPDOOR_OPEN_BIT)[0];
    expect(open.y0).toBe(0);
    expect(open.y1).toBe(1);
    // FACINGS[0] = +x，开着的门贴在 +x 那一侧
    expect(open.x1).toBe(1);
    expect(open.x0).toBeGreaterThan(0.8);
  });

  it('开着的活板门仍然挡人（1.8.9 里可以站在竖起来的门上）', () => {
    expect(collisionBoxes(trapdoor, TRAPDOOR_OPEN_BIT).length).toBe(1);
  });
});
