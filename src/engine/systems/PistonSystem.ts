/**
 * 活塞：通电时把前方最多 12 个方块整体推开一格，断电时普通活塞只缩回、粘性活塞会把前面那格拉回来。
 * 与 1.8.9 一致：遇到基岩 / 黑曜石这类不可推动的方块，或推到 13 个就推不动；
 * 方块实体（箱子、熔炉等）也不能被推。
 */

import { BlockId, getBlock } from '../blocks/BlockRegistry';
import { FACINGS } from '../blocks/blockShapes';
import { PISTON_FACING_MASK, PISTON_MAX_PUSH } from '../constants/redstone';
import { WORLD_SIZE_Y } from '../constants/world';
import type { World } from '../world/World';

/** 活塞朝向（含上下）：0~3 是水平四向，4 = 朝上，5 = 朝下。 */
export const PISTON_UP = 4;
export const PISTON_DOWN = 5;

/** 朝向序号 → 方向向量。 */
export function pistonDirection(facing: number): [number, number, number] {
  if (facing === PISTON_UP) {
    return [0, 1, 0];
  }
  if (facing === PISTON_DOWN) {
    return [0, -1, 0];
  }
  const [dx, dz] = FACINGS[facing & PISTON_FACING_MASK];
  return [dx, 0, dz];
}

/** 该方块能不能被活塞推动。 */
export function isPushable(world: World, x: number, y: number, z: number): boolean {
  const id = world.getBlock(x, y, z);
  if (id === BlockId.AIR) {
    return true;
  }
  const def = getBlock(id);
  // 不可破坏（基岩）与爆炸免疫的黑曜石一律推不动；液体直接被冲掉
  if (def.hardness < 0 || id === BlockId.OBSIDIAN) {
    return false;
  }
  // 有方块实体的方块推不动（1.8.9 同）
  return !HAS_BLOCK_ENTITY.has(id);
}

/** 带方块实体、因此推不动的方块。 */
const HAS_BLOCK_ENTITY: ReadonlySet<number> = new Set<number>([
  BlockId.CHEST,
  BlockId.FURNACE,
  BlockId.MOB_SPAWNER,
  BlockId.BREWING_STAND,
  BlockId.BEACON,
  BlockId.ENCHANTING_TABLE,
]);

/** 能被活塞冲掉（不占位）的方块：空气与液体。 */
function isReplaceable(world: World, x: number, y: number, z: number): boolean {
  const id = world.getBlock(x, y, z);
  return id === BlockId.AIR || getBlock(id).isLiquid === true;
}

/**
 * 算出推动时需要移动的方块序列（从活塞前第一格开始，沿推动方向）。
 * @returns 要移动的坐标列表；推不动返回 null
 */
export function collectPushed(
  world: World,
  x: number,
  y: number,
  z: number,
  dir: readonly [number, number, number],
): [number, number, number][] | null {
  const blocks: [number, number, number][] = [];
  let cx = x + dir[0];
  let cy = y + dir[1];
  let cz = z + dir[2];
  while (blocks.length <= PISTON_MAX_PUSH) {
    if (cy < 0 || cy >= WORLD_SIZE_Y) {
      return null;
    }
    if (isReplaceable(world, cx, cy, cz)) {
      return blocks;
    }
    if (!isPushable(world, cx, cy, cz)) {
      return null;
    }
    blocks.push([cx, cy, cz]);
    cx += dir[0];
    cy += dir[1];
    cz += dir[2];
  }
  // 超过上限推不动
  return null;
}

/**
 * 伸出活塞：把前方的方块整体挪一格，并在活塞前放一节活塞臂。
 * @returns 是否推动成功
 */
export function extendPiston(world: World, x: number, y: number, z: number, facing: number): boolean {
  const dir = pistonDirection(facing);
  const pushed = collectPushed(world, x, y, z, dir);
  if (pushed === null) {
    return false;
  }
  world.batch(() => {
    // 从最远的开始搬，避免互相覆盖
    for (let i = pushed.length - 1; i >= 0; i--) {
      const [bx, by, bz] = pushed[i];
      const id = world.getBlock(bx, by, bz);
      const meta = world.getMeta(bx, by, bz);
      world.setBlock(bx + dir[0], by + dir[1], bz + dir[2], id, meta);
      world.setBlock(bx, by, bz, BlockId.AIR);
    }
    world.setBlock(x + dir[0], y + dir[1], z + dir[2], BlockId.PISTON_HEAD, facing);
  });
  return true;
}

/**
 * 缩回活塞：拿掉活塞臂；粘性活塞把臂前面那格方块拉回来。
 */
export function retractPiston(world: World, x: number, y: number, z: number, facing: number, sticky: boolean): void {
  const dir = pistonDirection(facing);
  const headX = x + dir[0];
  const headY = y + dir[1];
  const headZ = z + dir[2];
  if (world.getBlock(headX, headY, headZ) !== BlockId.PISTON_HEAD) {
    return;
  }
  world.batch(() => {
    world.setBlock(headX, headY, headZ, BlockId.AIR);
    if (!sticky) {
      return;
    }
    const pullX = headX + dir[0];
    const pullY = headY + dir[1];
    const pullZ = headZ + dir[2];
    if (isReplaceable(world, pullX, pullY, pullZ) || !isPushable(world, pullX, pullY, pullZ)) {
      return;
    }
    const id = world.getBlock(pullX, pullY, pullZ);
    const meta = world.getMeta(pullX, pullY, pullZ);
    world.setBlock(headX, headY, headZ, id, meta);
    world.setBlock(pullX, pullY, pullZ, BlockId.AIR);
  });
}
