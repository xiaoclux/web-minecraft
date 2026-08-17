import { BlockId, getBlock } from '../blocks/BlockRegistry';
import { collisionBoxes, computeConnections, isFullCube, needsConnections } from '../blocks/blockShapes';
import type { World } from '../world/World';
import { AABB } from './AABB';

const EPSILON = 1e-4;
/** 碰撞扫描范围在位移之外再多留的一点余量，避免贴着方块面时因浮点误差漏掉那一格。 */
const SWEEP_MARGIN = 0.05;

/**
 * 实心方块盒的复用池：碰撞每帧对每个实体跑一次，逐块 new AABB 是热路径里最大的 GC 来源。
 * 池里的盒只在下一次 collect 之前有效，调用方不得保留引用。
 */
const BOX_POOL: AABB[] = [];
let boxCount = 0;

function pushBox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
  let box = BOX_POOL[boxCount];
  if (!box) {
    box = new AABB(0, 0, 0, 0, 0, 0);
    BOX_POOL[boxCount] = box;
  }
  box.minX = x0;
  box.minY = y0;
  box.minZ = z0;
  box.maxX = x1;
  box.maxY = y1;
  box.maxZ = z1;
  boxCount++;
}

/**
 * 把与给定范围相交的实心方块盒收进池里。
 * @returns 收集到的盒数（池里前 n 个有效）
 */
function collectBoxes(
  world: World,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): number {
  boxCount = 0;
  const x0 = Math.floor(minX);
  const x1 = Math.floor(maxX);
  const y0 = Math.floor(minY);
  const y1 = Math.floor(maxY);
  const z0 = Math.floor(minZ);
  const z1 = Math.floor(maxZ);
  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const id = world.getBlock(x, y, z);
        if (id === BlockId.AIR) {
          // 未加载的 chunk 视为实心边界
          if (!world.isSolidAt(x, y, z)) {
            continue;
          }
          pushBox(x, y, z, x + 1, y + 1, z + 1);
        } else {
          const def = getBlock(id);
          if (!def.solid) {
            continue;
          }
          if (isFullCube(def)) {
            pushBox(x, y, z, x + 1, y + 1, z + 1);
          } else {
            const connections = needsConnections(def)
              ? computeConnections(def, (dx, dz) => getBlock(world.getBlock(x + dx, y, z + dz)))
              : 0;
            for (const b of collisionBoxes(def, world.getMeta(x, y, z), connections)) {
              pushBox(x + b.x0, y + b.y0, z + b.z0, x + b.x1, y + b.y1, z + b.z1);
            }
          }
        }
      }
    }
  }
  return boxCount;
}

/** 收集与包围盒相交区域内的实心方块盒（返回新数组，供不在乎分配的调用方 / 测试用）。 */
export function collectBlockBoxes(world: World, box: AABB): AABB[] {
  const n = collectBoxes(world, box.minX, box.minY, box.minZ, box.maxX, box.maxY, box.maxZ);
  const out: AABB[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const b = BOX_POOL[i];
    out[i] = new AABB(b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ);
  }
  return out;
}

/** 移动结果。box 与整个对象都是复用的，只在下一次 moveWithCollisions 之前有效。 */
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

const MOVE_RESULT: MoveResult = {
  box: new AABB(0, 0, 0, 0, 0, 0),
  dx: 0,
  dy: 0,
  dz: 0,
  collidedX: false,
  collidedY: false,
  collidedZ: false,
  onGround: false,
};

/**
 * 沿位移移动包围盒并与世界方块做分轴碰撞（先 Y 后 X/Z）。
 * 返回的结果对象是复用的，调用方应立即读取。
 */
export function moveWithCollisions(world: World, box: AABB, dx: number, dy: number, dz: number): MoveResult {
  const ex = Math.abs(dx) + SWEEP_MARGIN;
  const ey = Math.abs(dy) + SWEEP_MARGIN;
  const ez = Math.abs(dz) + SWEEP_MARGIN;
  const count = collectBoxes(
    world,
    box.minX - ex,
    box.minY - ey,
    box.minZ - ez,
    box.maxX + ex,
    box.maxY + ey,
    box.maxZ + ez,
  );
  const current = MOVE_RESULT.box;
  current.minX = box.minX;
  current.minY = box.minY;
  current.minZ = box.minZ;
  current.maxX = box.maxX;
  current.maxY = box.maxY;
  current.maxZ = box.maxZ;
  let moveY = dy;
  for (let i = 0; i < count; i++) {
    moveY = clipY(current, BOX_POOL[i], moveY);
  }
  current.minY += moveY;
  current.maxY += moveY;
  let moveX = dx;
  for (let i = 0; i < count; i++) {
    moveX = clipX(current, BOX_POOL[i], moveX);
  }
  current.minX += moveX;
  current.maxX += moveX;
  let moveZ = dz;
  for (let i = 0; i < count; i++) {
    moveZ = clipZ(current, BOX_POOL[i], moveZ);
  }
  current.minZ += moveZ;
  current.maxZ += moveZ;
  MOVE_RESULT.dx = moveX;
  MOVE_RESULT.dy = moveY;
  MOVE_RESULT.dz = moveZ;
  MOVE_RESULT.collidedX = Math.abs(moveX - dx) > EPSILON;
  MOVE_RESULT.collidedY = Math.abs(moveY - dy) > EPSILON;
  MOVE_RESULT.collidedZ = Math.abs(moveZ - dz) > EPSILON;
  MOVE_RESULT.onGround = dy < 0 && MOVE_RESULT.collidedY;
  return MOVE_RESULT;
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

/** 包围盒是否与任何实心方块重叠（扫到第一个相交的就停）。 */
export function isBoxBlocked(world: World, box: AABB): boolean {
  // 只扫盒子实际覆盖的格；maxX 恰好落在整数边界时不算下一格
  const count = collectBoxes(
    world,
    box.minX,
    box.minY,
    box.minZ,
    box.maxX - EPSILON,
    box.maxY - EPSILON,
    box.maxZ - EPSILON,
  );
  for (let i = 0; i < count; i++) {
    if (BOX_POOL[i].intersects(box)) {
      return true;
    }
  }
  return false;
}

/** 采样点向包围盒内收缩的距离，避免恰好落在相邻方块列上。 */
const LIQUID_SAMPLE_INSET = 0.05;

/**
 * 包围盒是否浸在液体中：在指定高度比例的水平面上采样中心与四角，任一处为液体即视为在水中。
 */
export function isBoxInLiquid(world: World, box: AABB, fraction = 0.5): boolean {
  const y = Math.floor(box.minY + (box.maxY - box.minY) * fraction);
  const cx = (box.minX + box.maxX) / 2;
  const cz = (box.minZ + box.maxZ) / 2;
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

/**
 * 一次扫描包围盒，返回命中了 ids 中哪些方块的位掩码（第 i 位对应 ids[i]）。
 * 供每 tick 要同时查多种方块的调用方使用，避免同一包围盒扫多遍。
 */
export function boxTouchMask(world: World, box: AABB, ids: readonly number[]): number {
  const x0 = Math.floor(box.minX);
  const x1 = Math.floor(box.maxX - EPSILON);
  const y0 = Math.floor(box.minY);
  const y1 = Math.floor(box.maxY - EPSILON);
  const z0 = Math.floor(box.minZ);
  const z1 = Math.floor(box.maxZ - EPSILON);
  let mask = 0;
  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const id = world.getBlock(x, y, z);
        for (let i = 0; i < ids.length; i++) {
          if (ids[i] === id) {
            mask |= 1 << i;
            break;
          }
        }
      }
    }
  }
  return mask;
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
