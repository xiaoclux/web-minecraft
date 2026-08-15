import { CHUNK_SIZE, WORLD_SIZE_Y } from '../../constants/world';
import type { Chunk } from '../Chunk';

/** 结构中的一个方块。 */
export interface StructureBlock {
  x: number;
  y: number;
  z: number;
  id: number;
  meta: number;
}

/** 轴对齐包围盒（闭区间）。 */
export interface Bounds {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

/** 两个包围盒在 XZ 平面是否相交。 */
export function boundsIntersectXZ(a: Bounds, b: Bounds): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
}

/** chunk 的 XZ 包围盒。 */
export function chunkBounds(chunk: Chunk): Bounds {
  return {
    minX: chunk.originX,
    minZ: chunk.originZ,
    maxX: chunk.originX + CHUNK_SIZE - 1,
    maxZ: chunk.originZ + CHUNK_SIZE - 1,
    minY: 0,
    maxY: WORLD_SIZE_Y - 1,
  };
}

/**
 * 结构方块收集器：把一座建筑的方块记录为世界坐标列表，之后可按 chunk 裁剪写入。
 * 后写入的方块覆盖先写入的（例如先整体填墙再挖门洞）。
 */
export class StructureBuilder {
  private readonly blocks = new Map<string, StructureBlock>();
  private bounds: Bounds | null = null;

  /** 放置单个方块。 */
  set(x: number, y: number, z: number, id: number, meta = 0): void {
    this.blocks.set(`${x},${y},${z}`, { x, y, z, id, meta });
    if (!this.bounds) {
      this.bounds = { minX: x, minY: y, minZ: z, maxX: x, maxY: y, maxZ: z };
      return;
    }
    const b = this.bounds;
    b.minX = Math.min(b.minX, x);
    b.minY = Math.min(b.minY, y);
    b.minZ = Math.min(b.minZ, z);
    b.maxX = Math.max(b.maxX, x);
    b.maxY = Math.max(b.maxY, y);
    b.maxZ = Math.max(b.maxZ, z);
  }

  /** 填充实心长方体（坐标闭区间，任意顺序）。 */
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number, meta = 0): void {
    const [ax, bx] = x0 <= x1 ? [x0, x1] : [x1, x0];
    const [ay, by] = y0 <= y1 ? [y0, y1] : [y1, y0];
    const [az, bz] = z0 <= z1 ? [z0, z1] : [z1, z0];
    for (let y = ay; y <= by; y++) {
      for (let z = az; z <= bz; z++) {
        for (let x = ax; x <= bx; x++) {
          this.set(x, y, z, id, meta);
        }
      }
    }
  }

  /** 全部方块。 */
  list(): StructureBlock[] {
    return [...this.blocks.values()];
  }

  /** 包围盒（空结构返回 null）。 */
  getBounds(): Bounds | null {
    return this.bounds;
  }
}

/** 把结构中落在 chunk 内的方块写入。 */
export function placeBlocksInChunk(chunk: Chunk, blocks: readonly StructureBlock[]): void {
  for (const b of blocks) {
    chunk.setWorld(b.x, b.y, b.z, b.id, b.meta);
  }
}
