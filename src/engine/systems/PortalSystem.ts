/**
 * 下界传送门：黑曜石框架检测、点燃、站进去后传送。
 * 与 1.8.9 一致：框架内部最小 2×3、最大 21×21，打火石点内部任一格即可激活；
 * 传送时坐标按 1:8 换算，先在目标维度找现成的传送门，找不到就现造一个。
 */

import { BlockId } from '../blocks/BlockRegistry';
import { WORLD_SIZE_Y } from '../constants/world';
import { DimensionId, type DimensionDef } from '../world/Dimension';
import type { World } from '../world/World';

/** 框架内部的尺寸限制（1.8.9 同）。 */
const MIN_INNER_WIDTH = 2;
const MIN_INNER_HEIGHT = 3;
const MAX_INNER_WIDTH = 21;
const MAX_INNER_HEIGHT = 21;
/** 传送门 meta：0 = 沿 X 轴排布，1 = 沿 Z 轴。 */
export const PORTAL_AXIS_X = 0;
export const PORTAL_AXIS_Z = 1;
/** 在目标维度搜索现成传送门的水平半径（1.8.9 是 128）。 */
export const PORTAL_SEARCH_RADIUS = 128;
/** 站在传送门里多少 tick 后触发传送。 */
export const PORTAL_TRIGGER_TICKS = 40;
/** 传送后多少 tick 内不会被再次传送（免得来回弹）。 */
export const PORTAL_COOLDOWN_TICKS = 100;
/** 现造传送门时的框架内部尺寸。 */
const BUILT_INNER_WIDTH = 2;
const BUILT_INNER_HEIGHT = 3;
/** 造门时给玩家清出的落脚平台半径。 */
const PLATFORM_RADIUS = 2;

/** 一个传送门的位置与朝向。 */
export interface PortalLocation {
  x: number;
  y: number;
  z: number;
  axis: number;
}

/**
 * 从点燃处开始找一个合法的黑曜石框架，并把内部填成传送门方块。
 * @returns 是否点燃成功
 */
export function tryLightPortal(world: World, x: number, y: number, z: number): boolean {
  for (const axis of [PORTAL_AXIS_X, PORTAL_AXIS_Z]) {
    const inner = findFrameInterior(world, x, y, z, axis);
    if (inner) {
      for (const [ix, iy, iz] of inner) {
        world.setBlock(ix, iy, iz, BlockId.NETHER_PORTAL, axis);
      }
      return true;
    }
  }
  return false;
}

/** 沿某个轴向找框架内部的全部格子；不是合法框架返回 null。 */
function findFrameInterior(
  world: World,
  x: number,
  y: number,
  z: number,
  axis: number,
): [number, number, number][] | null {
  const [dx, dz] = axis === PORTAL_AXIS_X ? [1, 0] : [0, 1];
  // 先在水平方向找到内部的左右边界
  let minOffset = 0;
  while (isReplaceable(world, x - dx * (minOffset + 1), y, z - dz * (minOffset + 1)) && minOffset < MAX_INNER_WIDTH) {
    minOffset++;
  }
  let maxOffset = 0;
  while (isReplaceable(world, x + dx * (maxOffset + 1), y, z + dz * (maxOffset + 1)) && maxOffset < MAX_INNER_WIDTH) {
    maxOffset++;
  }
  const width = minOffset + maxOffset + 1;
  if (width < MIN_INNER_WIDTH || width > MAX_INNER_WIDTH) {
    return null;
  }
  const startX = x - dx * minOffset;
  const startZ = z - dz * minOffset;
  // 往下找到底，再往上量高度
  let bottom = y;
  while (bottom > 0 && isReplaceable(world, startX, bottom - 1, startZ)) {
    bottom--;
  }
  let height = 0;
  while (
    bottom + height < WORLD_SIZE_Y &&
    height < MAX_INNER_HEIGHT &&
    isRowReplaceable(world, startX, bottom + height, startZ, dx, dz, width)
  ) {
    height++;
  }
  if (height < MIN_INNER_HEIGHT) {
    return null;
  }
  // 四周必须全是黑曜石
  for (let i = 0; i < width; i++) {
    if (
      world.getBlock(startX + dx * i, bottom - 1, startZ + dz * i) !== BlockId.OBSIDIAN ||
      world.getBlock(startX + dx * i, bottom + height, startZ + dz * i) !== BlockId.OBSIDIAN
    ) {
      return null;
    }
  }
  for (let j = 0; j < height; j++) {
    if (
      world.getBlock(startX - dx, bottom + j, startZ - dz) !== BlockId.OBSIDIAN ||
      world.getBlock(startX + dx * width, bottom + j, startZ + dz * width) !== BlockId.OBSIDIAN
    ) {
      return null;
    }
  }
  const inner: [number, number, number][] = [];
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      inner.push([startX + dx * i, bottom + j, startZ + dz * i]);
    }
  }
  return inner;
}

/** 框架内部允许是空气或已有的传送门方块。 */
function isReplaceable(world: World, x: number, y: number, z: number): boolean {
  const id = world.getBlock(x, y, z);
  return id === BlockId.AIR || id === BlockId.NETHER_PORTAL;
}

function isRowReplaceable(
  world: World,
  x: number,
  y: number,
  z: number,
  dx: number,
  dz: number,
  width: number,
): boolean {
  for (let i = 0; i < width; i++) {
    if (!isReplaceable(world, x + dx * i, y, z + dz * i)) {
      return false;
    }
  }
  return true;
}

/** 主世界 ↔ 下界的坐标换算（下界 1 格 = 主世界 8 格）。 */
export function mapCoordinate(value: number, from: DimensionDef, to: DimensionDef): number {
  return Math.floor((value * from.coordinateScale) / to.coordinateScale);
}

/** 在目标世界里找最近的传送门方块。 */
export function findExistingPortal(
  world: World,
  x: number,
  y: number,
  z: number,
  radius: number,
): PortalLocation | null {
  let best: PortalLocation | null = null;
  let bestDistanceSq = Infinity;
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const px = x + dx;
      const pz = z + dz;
      if (!world.hasChunkAt(px, pz)) {
        continue;
      }
      for (let py = 1; py < WORLD_SIZE_Y - 1; py++) {
        if (world.getBlock(px, py, pz) !== BlockId.NETHER_PORTAL) {
          continue;
        }
        const distanceSq = dx * dx + dz * dz + (py - y) * (py - y);
        if (distanceSq < bestDistanceSq) {
          bestDistanceSq = distanceSq;
          best = { x: px, y: py, z: pz, axis: world.getMeta(px, py, pz) };
        }
        break;
      }
    }
  }
  return best;
}

/**
 * 在目标世界里现造一座传送门：先找一个能站人的高度，挖空一块地方，
 * 立黑曜石框架、填传送门方块，并在门前铺一小块地板。
 */
export function buildPortal(world: World, x: number, y: number, z: number, dimensionId: DimensionId): PortalLocation {
  const baseY = findBuildY(world, x, y, z, dimensionId);
  const axis = PORTAL_AXIS_X;
  const width = BUILT_INNER_WIDTH;
  const height = BUILT_INNER_HEIGHT;
  // 先清出一块空间并铺地板
  for (let dz = -PLATFORM_RADIUS; dz <= PLATFORM_RADIUS; dz++) {
    for (let dx = -1; dx <= width; dx++) {
      world.setBlock(x + dx, baseY - 1, z + dz, BlockId.OBSIDIAN);
      for (let dy = 0; dy <= height; dy++) {
        world.setBlock(x + dx, baseY + dy, z + dz, BlockId.AIR);
      }
    }
  }
  // 框架
  for (let i = -1; i <= width; i++) {
    world.setBlock(x + i, baseY - 1, z, BlockId.OBSIDIAN);
    world.setBlock(x + i, baseY + height, z, BlockId.OBSIDIAN);
  }
  for (let j = 0; j < height; j++) {
    world.setBlock(x - 1, baseY + j, z, BlockId.OBSIDIAN);
    world.setBlock(x + width, baseY + j, z, BlockId.OBSIDIAN);
  }
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      world.setBlock(x + i, baseY + j, z, BlockId.NETHER_PORTAL, axis);
    }
  }
  return { x, y: baseY, z, axis };
}

/** 造门的高度：下界避开岩浆海与天花板，主世界从地表往上。 */
function findBuildY(world: World, x: number, y: number, z: number, dimensionId: DimensionId): number {
  if (dimensionId === DimensionId.NETHER) {
    const preferred = Math.max(NETHER_MIN_BUILD_Y, Math.min(NETHER_MAX_BUILD_Y, y));
    return preferred;
  }
  const surface = world.getHeight(x, z);
  return Math.max(1, Math.min(WORLD_SIZE_Y - PORTAL_HEADROOM, surface));
}

/** 下界造门的高度范围（岩浆海之上、天花板之下）。 */
const NETHER_MIN_BUILD_Y = 34;
const NETHER_MAX_BUILD_Y = 100;
/** 造门时给顶部留的空间。 */
const PORTAL_HEADROOM = 6;
