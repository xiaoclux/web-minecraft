import { getBlock } from '../blocks/BlockRegistry';
import { CHUNK_SIZE, MAX_LIGHT } from '../constants/world';
import type { World } from './World';

/** 局部重算的水平半径（≥ MAX_LIGHT+1 才能保证正确）。 */
const LOCAL_RADIUS = MAX_LIGHT + 1;
/** 水对光照的额外衰减。 */
const WATER_ATTENUATION = 2;

const DIRS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/**
 * 天空光 + 方块光（火把等）计算。全量用于世界生成/读档；局部用于单个方块变更。
 */
export class LightEngine {
  /** 环形队列：容量为世界体积，头尾用计数器取模。 */
  private queue: Int32Array;
  private queueCapacity: number;
  private queueHead = 0;
  private queueTail = 0;

  constructor(private readonly world: World) {
    this.queueCapacity = world.sizeX * world.sizeY * world.sizeZ;
    this.queue = new Int32Array(this.queueCapacity);
  }

  /** 全量重算。 */
  computeAll(): void {
    const w = this.world;
    w.skyLight.fill(0);
    w.blockLight.fill(0);
    w.recomputeAllHeights();
    this.computeRegion(0, w.sizeX - 1, 0, w.sizeZ - 1);
  }

  /** 单个方块变化后局部重算。 */
  updateAround(x: number, z: number): void {
    this.updateArea(x, x, z, z);
  }

  /**
   * 对 [x0..x1]×[z0..z1] 范围内的方块变更做局部重算：
   * 区域向外扩 LOCAL_RADIUS，重算后只把光照真正变化的 chunk 标脏。
   */
  updateArea(minX: number, maxX: number, minZ: number, maxZ: number): void {
    const w = this.world;
    const x0 = Math.max(0, minX - LOCAL_RADIUS);
    const x1 = Math.min(w.sizeX - 1, maxX + LOCAL_RADIUS);
    const z0 = Math.max(0, minZ - LOCAL_RADIUS);
    const z1 = Math.min(w.sizeZ - 1, maxZ + LOCAL_RADIUS);
    for (let zz = z0; zz <= z1; zz++) {
      for (let xx = x0; xx <= x1; xx++) {
        w.recomputeHeight(xx, zz);
      }
    }
    const width = x1 - x0 + 1;
    const depth = z1 - z0 + 1;
    const snapshotSky = new Uint8Array(width * depth * w.sizeY);
    const snapshotBlock = new Uint8Array(width * depth * w.sizeY);
    let cursor = 0;
    for (let y = 0; y < w.sizeY; y++) {
      for (let zz = z0; zz <= z1; zz++) {
        const rowStart = w.index(x0, y, zz);
        snapshotSky.set(w.skyLight.subarray(rowStart, rowStart + width), cursor);
        snapshotBlock.set(w.blockLight.subarray(rowStart, rowStart + width), cursor);
        w.skyLight.fill(0, rowStart, rowStart + width);
        w.blockLight.fill(0, rowStart, rowStart + width);
        cursor += width;
      }
    }
    this.computeRegion(x0, x1, z0, z1);
    // 找出光照实际变化的范围
    let cx0 = Infinity;
    let cx1 = -Infinity;
    let cz0 = Infinity;
    let cz1 = -Infinity;
    cursor = 0;
    for (let y = 0; y < w.sizeY; y++) {
      for (let zz = z0; zz <= z1; zz++) {
        const rowStart = w.index(x0, y, zz);
        for (let i = 0; i < width; i++) {
          if (
            w.skyLight[rowStart + i] !== snapshotSky[cursor + i] ||
            w.blockLight[rowStart + i] !== snapshotBlock[cursor + i]
          ) {
            const xx = x0 + i;
            cx0 = Math.min(cx0, xx);
            cx1 = Math.max(cx1, xx);
            cz0 = Math.min(cz0, zz);
            cz1 = Math.max(cz1, zz);
          }
        }
        cursor += width;
      }
    }
    if (cx0 === Infinity) {
      return;
    }
    // 光照变化会影响相邻方块面的平滑光照，因此向外扩 1
    const dcx0 = Math.floor(Math.max(0, cx0 - 1) / CHUNK_SIZE);
    const dcx1 = Math.floor(Math.min(w.sizeX - 1, cx1 + 1) / CHUNK_SIZE);
    const dcz0 = Math.floor(Math.max(0, cz0 - 1) / CHUNK_SIZE);
    const dcz1 = Math.floor(Math.min(w.sizeZ - 1, cz1 + 1) / CHUNK_SIZE);
    for (let cz = dcz0; cz <= dcz1; cz++) {
      for (let cx = dcx0; cx <= dcx1; cx++) {
        w.markDirty(cx, cz);
      }
    }
  }

  private computeRegion(x0: number, x1: number, z0: number, z1: number): void {
    this.computeSky(x0, x1, z0, z1);
    this.computeBlockLight(x0, x1, z0, z1);
  }

  private computeSky(x0: number, x1: number, z0: number, z1: number): void {
    const w = this.world;
    this.queueHead = 0;
    this.queueTail = 0;
    // 1) 直射天空光：列高度以上全部 15
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const h = w.getHeight(x, z);
        for (let y = h; y < w.sizeY; y++) {
          w.skyLight[w.index(x, y, z)] = MAX_LIGHT;
        }
      }
    }
    // 2) 种子：直射区里可能向侧面扩散的格子（相邻列更高）+ 区域外壳的现有光
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const h = w.getHeight(x, z);
        const neighborMax = Math.max(
          w.getHeight(x + 1, z),
          w.getHeight(x - 1, z),
          w.getHeight(x, z + 1),
          w.getHeight(x, z - 1),
        );
        for (let y = h; y < neighborMax && y < w.sizeY; y++) {
          this.push(x, y, z);
        }
      }
    }
    this.seedShell(x0, x1, z0, z1, w.skyLight);
    this.propagate(x0, x1, z0, z1, w.skyLight);
  }

  private computeBlockLight(x0: number, x1: number, z0: number, z1: number): void {
    const w = this.world;
    this.queueHead = 0;
    this.queueTail = 0;
    for (let y = 0; y < w.sizeY; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          const idx = w.index(x, y, z);
          const light = getBlock(w.blocks[idx]).light;
          if (light > 0) {
            w.blockLight[idx] = light;
            this.push(x, y, z);
          }
        }
      }
    }
    this.seedShell(x0, x1, z0, z1, w.blockLight);
    this.propagate(x0, x1, z0, z1, w.blockLight);
  }

  /** 把区域外壳（x0-1、x1+1、z0-1、z1+1）上有光的格子入队作为源。 */
  private seedShell(x0: number, x1: number, z0: number, z1: number, arr: Uint8Array): void {
    const w = this.world;
    const shellColumns: [number, number][] = [];
    for (let z = z0 - 1; z <= z1 + 1; z++) {
      shellColumns.push([x0 - 1, z], [x1 + 1, z]);
    }
    for (let x = x0; x <= x1; x++) {
      shellColumns.push([x, z0 - 1], [x, z1 + 1]);
    }
    for (const [x, z] of shellColumns) {
      if (x < 0 || z < 0 || x >= w.sizeX || z >= w.sizeZ) {
        continue;
      }
      for (let y = 0; y < w.sizeY; y++) {
        if (arr[w.index(x, y, z)] > 1) {
          this.push(x, y, z);
        }
      }
    }
  }

  private push(x: number, y: number, z: number): void {
    this.pushIndex(this.world.index(x, y, z));
  }

  private pushIndex(idx: number): void {
    if (this.queueTail - this.queueHead >= this.queueCapacity) {
      throw new Error('LightEngine: propagation queue overflow');
    }
    this.queue[this.queueTail % this.queueCapacity] = idx;
    this.queueTail++;
  }

  private propagate(x0: number, x1: number, z0: number, z1: number, arr: Uint8Array): void {
    const w = this.world;
    const sizeX = w.sizeX;
    const sizeZ = w.sizeZ;
    while (this.queueHead < this.queueTail) {
      const idx = this.queue[this.queueHead % this.queueCapacity];
      this.queueHead++;
      const level = arr[idx];
      if (level <= 1) {
        continue;
      }
      const x = idx % sizeX;
      const z = Math.floor(idx / sizeX) % sizeZ;
      const y = Math.floor(idx / (sizeX * sizeZ));
      for (const [dx, dy, dz] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        const nz = z + dz;
        if (nx < x0 || nx > x1 || nz < z0 || nz > z1 || ny < 0 || ny >= w.sizeY) {
          continue;
        }
        const nIdx = w.index(nx, ny, nz);
        const def = getBlock(w.blocks[nIdx]);
        if (def.opaque) {
          continue;
        }
        const next = level - 1 - (def.isLiquid ? WATER_ATTENUATION : 0);
        if (next > arr[nIdx]) {
          arr[nIdx] = next;
          this.pushIndex(nIdx);
        }
      }
    }
  }
}
