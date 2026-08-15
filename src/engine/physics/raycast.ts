import { getBlock } from '../blocks/BlockRegistry';
import { computeConnections, isFullCube, needsConnections, shapeBoxes, type BlockBox } from '../blocks/blockShapes';
import type { World } from '../world/World';

/** 射线命中结果。 */
export interface RayHit {
  x: number;
  y: number;
  z: number;
  /** 命中面的法线（用于放置方块）。 */
  nx: number;
  ny: number;
  nz: number;
  distance: number;
  /** 命中点的精确坐标（用于判断点在方块的哪半边）。 */
  hx: number;
  hy: number;
  hz: number;
}

/** 射线与子盒求交的结果（法线朝射线来的方向）。 */
interface BoxHit {
  t: number;
  nx: number;
  ny: number;
  nz: number;
}

/**
 * 射线与轴对齐盒求交（slab 法）；射线起点在盒内或不相交时返回 null。
 */
function rayBox(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  b: BlockBox,
  bx: number,
  by: number,
  bz: number,
): BoxHit | null {
  let tMin = 0;
  let tMax = Infinity;
  let axis = -1;
  let sign = 0;
  const origin = [ox, oy, oz];
  const dir = [dx, dy, dz];
  const lo = [bx + b.x0, by + b.y0, bz + b.z0];
  const hi = [bx + b.x1, by + b.y1, bz + b.z1];
  for (let a = 0; a < 3; a++) {
    if (dir[a] === 0) {
      if (origin[a] < lo[a] || origin[a] > hi[a]) {
        return null;
      }
      continue;
    }
    const inv = 1 / dir[a];
    let t1 = (lo[a] - origin[a]) * inv;
    let t2 = (hi[a] - origin[a]) * inv;
    let enterSign = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      enterSign = 1;
    }
    if (t1 > tMin) {
      tMin = t1;
      axis = a;
      sign = enterSign;
    }
    if (t2 < tMax) {
      tMax = t2;
    }
    if (tMin > tMax) {
      return null;
    }
  }
  if (axis < 0) {
    return null;
  }
  return { t: tMin, nx: axis === 0 ? sign : 0, ny: axis === 1 ? sign : 0, nz: axis === 2 ? sign : 0 };
}

/**
 * DDA 体素射线投射，命中第一个非空气、非液体的方块。
 */
export function raycastBlocks(
  world: World,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDistance: number,
  includeLiquid = false,
): RayHit | null {
  let x = Math.floor(ox);
  let y = Math.floor(oy);
  let z = Math.floor(oz);
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  const stepZ = Math.sign(dz);
  const tDeltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
  const tDeltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
  const tDeltaZ = dz === 0 ? Infinity : Math.abs(1 / dz);
  let tMaxX = dx === 0 ? Infinity : (stepX > 0 ? x + 1 - ox : ox - x) * tDeltaX;
  let tMaxY = dy === 0 ? Infinity : (stepY > 0 ? y + 1 - oy : oy - y) * tDeltaY;
  let tMaxZ = dz === 0 ? Infinity : (stepZ > 0 ? z + 1 - oz : oz - z) * tDeltaZ;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  let t = 0;
  while (t <= maxDistance) {
    const id = world.getBlock(x, y, z);
    if (id !== 0) {
      const def = getBlock(id);
      if (!def.isLiquid || includeLiquid) {
        if (isFullCube(def)) {
          return { x, y, z, nx, ny, nz, distance: t, hx: ox + dx * t, hy: oy + dy * t, hz: oz + dz * t };
        }
        // 非完整立方体：逐子盒求交，都打不中就继续沿射线前进
        let best: BoxHit | null = null;
        const connections = needsConnections(def)
          ? computeConnections(def, (ddx, ddz) => getBlock(world.getBlock(x + ddx, y, z + ddz)))
          : 0;
        for (const b of shapeBoxes(def, world.getMeta(x, y, z), connections)) {
          const hit = rayBox(ox, oy, oz, dx, dy, dz, b, x, y, z);
          if (hit && hit.t <= maxDistance && (!best || hit.t < best.t)) {
            best = hit;
          }
        }
        if (best) {
          return {
            x,
            y,
            z,
            nx: best.nx,
            ny: best.ny,
            nz: best.nz,
            distance: best.t,
            hx: ox + dx * best.t,
            hy: oy + dy * best.t,
            hz: oz + dz * best.t,
          };
        }
      }
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
      nx = -stepX;
      ny = 0;
      nz = 0;
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
      nx = 0;
      ny = -stepY;
      nz = 0;
    } else {
      z += stepZ;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      nx = 0;
      ny = 0;
      nz = -stepZ;
    }
    if (y < 0 || y >= world.sizeY) {
      return null;
    }
  }
  return null;
}
