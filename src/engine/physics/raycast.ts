import { getBlock } from '../blocks/BlockRegistry';
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
        return { x, y, z, nx, ny, nz, distance: t };
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
