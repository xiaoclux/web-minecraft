import { BlockId, getBlock } from '../blocks/BlockRegistry';
import { collisionBoxes, isFullCube } from '../blocks/blockShapes';
import type { World } from '../world/World';
import { AABB } from './AABB';

const EPSILON = 1e-4;

/** 收集与包围盒相交区域内的实心方块盒。 */
export function collectBlockBoxes(world: World, box: AABB): AABB[] {
  const out: AABB[] = [];
  const x0 = Math.floor(box.minX);
  const x1 = Math.floor(box.maxX);
  const y0 = Math.floor(box.minY);
  const y1 = Math.floor(box.maxY);
  const z0 = Math.floor(box.minZ);
  const z1 = Math.floor(box.maxZ);
  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const id = world.getBlock(x, y, z);
        if (id === BlockId.AIR) {
          // 未加载的 chunk 视为实心边界
          if (!world.isSolidAt(x, y, z)) {
            continue;
          }
          out.push(new AABB(x, y, z, x + 1, y + 1, z + 1));
          continue;
        }
        const def = getBlock(id);
        if (!def.solid) {
          continue;
        }
        if (isFullCube(def)) {
          out.push(new AABB(x, y, z, x + 1, y + 1, z + 1));
          continue;
        }
        for (const b of collisionBoxes(def, world.getMeta(x, y, z))) {
          out.push(new AABB(x + b.x0, y + b.y0, z + b.z0, x + b.x1, y + b.y1, z + b.z1));
        }
      }
    }
  }
  return out;
}

/** 移动结果。 */
export interface MoveResult {
  box: AABB;
  dx: number;
  dy: number;
  dz: number;
  collidedX: boolean;
  collidedY: boolean;
  collidedZ: boolean;
  onGround: boolean;
}

/**
 * 沿位移移动包围盒并与世界方块做分轴碰撞（先 Y 后 X/Z）。
 */
export function moveWithCollisions(world: World, box: AABB, dx: number, dy: number, dz: number): MoveResult {
  const sweep = box.expand(Math.abs(dx) + 1, Math.abs(dy) + 1, Math.abs(dz) + 1);
  const blocks = collectBlockBoxes(world, sweep);
  let current = box;
  let moveY = dy;
  for (const b of blocks) {
    moveY = clipY(current, b, moveY);
  }
  current = current.offset(0, moveY, 0);
  let moveX = dx;
  for (const b of blocks) {
    moveX = clipX(current, b, moveX);
  }
  current = current.offset(moveX, 0, 0);
  let moveZ = dz;
  for (const b of blocks) {
    moveZ = clipZ(current, b, moveZ);
  }
  current = current.offset(0, 0, moveZ);
  return {
    box: current,
    dx: moveX,
    dy: moveY,
    dz: moveZ,
    collidedX: Math.abs(moveX - dx) > EPSILON,
    collidedY: Math.abs(moveY - dy) > EPSILON,
    collidedZ: Math.abs(moveZ - dz) > EPSILON,
    onGround: dy < 0 && Math.abs(moveY - dy) > EPSILON,
  };
}

function clipY(a: AABB, b: AABB, dy: number): number {
  if (a.maxX <= b.minX || a.minX >= b.maxX || a.maxZ <= b.minZ || a.minZ >= b.maxZ) {
    return dy;
  }
  if (dy > 0 && a.maxY <= b.minY) {
    return Math.min(dy, b.minY - a.maxY - EPSILON);
  }
  if (dy < 0 && a.minY >= b.maxY) {
    return Math.max(dy, b.maxY - a.minY + EPSILON);
  }
  return dy;
}

function clipX(a: AABB, b: AABB, dx: number): number {
  if (a.maxY <= b.minY || a.minY >= b.maxY || a.maxZ <= b.minZ || a.minZ >= b.maxZ) {
    return dx;
  }
  if (dx > 0 && a.maxX <= b.minX) {
    return Math.min(dx, b.minX - a.maxX - EPSILON);
  }
  if (dx < 0 && a.minX >= b.maxX) {
    return Math.max(dx, b.maxX - a.minX + EPSILON);
  }
  return dx;
}

function clipZ(a: AABB, b: AABB, dz: number): number {
  if (a.maxY <= b.minY || a.minY >= b.maxY || a.maxX <= b.minX || a.minX >= b.maxX) {
    return dz;
  }
  if (dz > 0 && a.maxZ <= b.minZ) {
    return Math.min(dz, b.minZ - a.maxZ - EPSILON);
  }
  if (dz < 0 && a.minZ >= b.maxZ) {
    return Math.max(dz, b.maxZ - a.minZ + EPSILON);
  }
  return dz;
}

/** 包围盒是否与任何实心方块重叠。 */
export function isBoxBlocked(world: World, box: AABB): boolean {
  return collectBlockBoxes(world, box).some((b) => b.intersects(box));
}

/** 采样点向包围盒内收缩的距离，避免恰好落在相邻方块列上。 */
const LIQUID_SAMPLE_INSET = 0.05;

/**
 * 包围盒是否浸在液体中：在指定高度比例的水平面上采样中心与四角，任一处为液体即视为在水中。
 */
export function isBoxInLiquid(world: World, box: AABB, fraction = 0.5): boolean {
  const y = Math.floor(box.minY + (box.maxY - box.minY) * fraction);
  const [cx, , cz] = box.center();
  const x0 = box.minX + LIQUID_SAMPLE_INSET;
  const x1 = box.maxX - LIQUID_SAMPLE_INSET;
  const z0 = box.minZ + LIQUID_SAMPLE_INSET;
  const z1 = box.maxZ - LIQUID_SAMPLE_INSET;
  return (
    world.isLiquidAt(Math.floor(cx), y, Math.floor(cz)) ||
    world.isLiquidAt(Math.floor(x0), y, Math.floor(z0)) ||
    world.isLiquidAt(Math.floor(x1), y, Math.floor(z0)) ||
    world.isLiquidAt(Math.floor(x0), y, Math.floor(z1)) ||
    world.isLiquidAt(Math.floor(x1), y, Math.floor(z1))
  );
}

/** 包围盒是否与任何液体方块相交。 */
export function isBoxTouchingLiquid(world: World, box: AABB): boolean {
  const x0 = Math.floor(box.minX);
  const x1 = Math.floor(box.maxX - EPSILON);
  const y0 = Math.floor(box.minY);
  const y1 = Math.floor(box.maxY - EPSILON);
  const z0 = Math.floor(box.minZ);
  const z1 = Math.floor(box.maxZ - EPSILON);
  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (world.isLiquidAt(x, y, z)) {
          return true;
        }
      }
    }
  }
  return false;
}
