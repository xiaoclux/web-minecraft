import { getBlock } from '../blocks/BlockRegistry';
import { CHUNK_SIZE, MAX_LIGHT, WORLD_SIZE_Y } from '../constants/world';
import type { Chunk } from './Chunk';
import { toChunkCoord } from './Chunk';
import type { World } from './World';

/** 局部重算的水平半径（≥ MAX_LIGHT+1 才能保证正确）。 */
const LOCAL_RADIUS = MAX_LIGHT + 1;
/** 水对光照的额外衰减。 */
const WATER_ATTENUATION = 2;
/** 初始队列容量（一个 chunk 的体积）。 */
const INITIAL_QUEUE_CAPACITY = CHUNK_SIZE * CHUNK_SIZE * WORLD_SIZE_Y;

const DIRS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/** 一次计算的范围：重算区域 + 允许传播的更大范围（均为方块坐标闭区间）。 */
interface LightRegion {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** 传播边界。 */
  px0: number;
  px1: number;
  pz0: number;
  pz1: number;
  /** 传播边界内各 chunk 是否可写（已加载且已点亮）。 */
  loaded: Uint8Array;
  loadedCx0: number;
  loadedCz0: number;
  loadedWidth: number;
}

type LightChannel = 'sky' | 'block';

/**
 * 天空光 + 方块光（火把等）计算。按 chunk 点亮新加载的分块；按区域局部重算方块变更。
 * 所有读写都通过 World 的按坐标接口完成，因此可跨 chunk 传播。
 */
export class LightEngine {
  private queue = new Int32Array(INITIAL_QUEUE_CAPACITY);
  private queueHead = 0;
  private queueTail = 0;

  constructor(private readonly world: World) {}

  /**
   * 点亮一个新加载的 chunk：算它自己的直射天光与光源，并允许光传播到 3×3 邻域内已点亮的 chunk
   * （光只增不减，因此不需要重算邻居）。
   */
  lightChunk(chunk: Chunk): void {
    const w = this.world;
    chunk.skyLight.fill(0);
    chunk.blockLight.fill(0);
    const x0 = chunk.originX;
    const z0 = chunk.originZ;
    const x1 = x0 + CHUNK_SIZE - 1;
    const z1 = z0 + CHUNK_SIZE - 1;
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        w.recomputeHeight(x, z);
      }
    }
    chunk.isLit = true;
    const region = this.buildRegion(x0, x1, z0, z1, x0 - CHUNK_SIZE, x1 + CHUNK_SIZE, z0 - CHUNK_SIZE, z1 + CHUNK_SIZE);
    this.computeRegion(region);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        w.markDirty(chunk.cx + dx, chunk.cz + dz);
      }
    }
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
    const x0 = minX - LOCAL_RADIUS;
    const x1 = maxX + LOCAL_RADIUS;
    const z0 = minZ - LOCAL_RADIUS;
    const z1 = maxZ + LOCAL_RADIUS;
    const region = this.buildRegion(x0, x1, z0, z1, x0, x1, z0, z1);
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
        for (let xx = x0; xx <= x1; xx++) {
          if (this.isWritable(region, xx, zz)) {
            snapshotSky[cursor] = w.getSkyLight(xx, y, zz);
            snapshotBlock[cursor] = w.getBlockLight(xx, y, zz);
            w.setSkyLight(xx, y, zz, 0);
            w.setBlockLight(xx, y, zz, 0);
          }
          cursor++;
        }
      }
    }
    this.computeRegion(region);
    // 找出光照实际变化的范围
    let cx0 = Infinity;
    let cx1 = -Infinity;
    let cz0 = Infinity;
    let cz1 = -Infinity;
    cursor = 0;
    for (let y = 0; y < w.sizeY; y++) {
      for (let zz = z0; zz <= z1; zz++) {
        for (let xx = x0; xx <= x1; xx++) {
          if (
            this.isWritable(region, xx, zz) &&
            (w.getSkyLight(xx, y, zz) !== snapshotSky[cursor] || w.getBlockLight(xx, y, zz) !== snapshotBlock[cursor])
          ) {
            cx0 = Math.min(cx0, xx);
            cx1 = Math.max(cx1, xx);
            cz0 = Math.min(cz0, zz);
            cz1 = Math.max(cz1, zz);
          }
          cursor++;
        }
      }
    }
    if (cx0 === Infinity) {
      return;
    }
    // 光照变化会影响相邻方块面的平滑光照，因此向外扩 1
    const dcx0 = toChunkCoord(cx0 - 1);
    const dcx1 = toChunkCoord(cx1 + 1);
    const dcz0 = toChunkCoord(cz0 - 1);
    const dcz1 = toChunkCoord(cz1 + 1);
    for (let cz = dcz0; cz <= dcz1; cz++) {
      for (let cx = dcx0; cx <= dcx1; cx++) {
        w.markDirty(cx, cz);
      }
    }
  }

  private buildRegion(
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    px0: number,
    px1: number,
    pz0: number,
    pz1: number,
  ): LightRegion {
    const loadedCx0 = toChunkCoord(px0);
    const loadedCz0 = toChunkCoord(pz0);
    const loadedWidth = toChunkCoord(px1) - loadedCx0 + 1;
    const loadedDepth = toChunkCoord(pz1) - loadedCz0 + 1;
    const loaded = new Uint8Array(loadedWidth * loadedDepth);
    for (let cz = 0; cz < loadedDepth; cz++) {
      for (let cx = 0; cx < loadedWidth; cx++) {
        const chunk = this.world.getChunk(loadedCx0 + cx, loadedCz0 + cz);
        loaded[cz * loadedWidth + cx] = chunk?.isLit ? 1 : 0;
      }
    }
    return { x0, x1, z0, z1, px0, px1, pz0, pz1, loaded, loadedCx0, loadedCz0, loadedWidth };
  }

  private isWritable(region: LightRegion, x: number, z: number): boolean {
    if (x < region.px0 || x > region.px1 || z < region.pz0 || z > region.pz1) {
      return false;
    }
    const cx = toChunkCoord(x) - region.loadedCx0;
    const cz = toChunkCoord(z) - region.loadedCz0;
    return region.loaded[cz * region.loadedWidth + cx] === 1;
  }

  private computeRegion(region: LightRegion): void {
    this.computeSky(region);
    this.computeBlockLight(region);
  }

  private computeSky(region: LightRegion): void {
    const w = this.world;
    this.resetQueue();
    // 1) 直射天空光：列高度以上全部 15
    for (let z = region.z0; z <= region.z1; z++) {
      for (let x = region.x0; x <= region.x1; x++) {
        if (!this.isWritable(region, x, z)) {
          continue;
        }
        const h = w.getHeight(x, z);
        for (let y = h; y < w.sizeY; y++) {
          w.setSkyLight(x, y, z, MAX_LIGHT);
        }
      }
    }
    // 2) 种子：直射区里可能向侧面扩散的格子（相邻列更高）+ 区域外壳的现有光
    for (let z = region.z0; z <= region.z1; z++) {
      for (let x = region.x0; x <= region.x1; x++) {
        if (!this.isWritable(region, x, z)) {
          continue;
        }
        const h = w.getHeight(x, z);
        const neighborMax = Math.max(
          this.heightOrZero(x + 1, z),
          this.heightOrZero(x - 1, z),
          this.heightOrZero(x, z + 1),
          this.heightOrZero(x, z - 1),
        );
        for (let y = h; y < neighborMax && y < w.sizeY; y++) {
          this.push(region, x, y, z);
        }
      }
    }
    this.seedShell(region, 'sky');
    this.propagate(region, 'sky');
  }

  /** 邻列高度；未加载列视为 0（不会产生侧向种子）。 */
  private heightOrZero(x: number, z: number): number {
    return this.world.hasChunkAt(x, z) ? this.world.getHeight(x, z) : 0;
  }

  private computeBlockLight(region: LightRegion): void {
    const w = this.world;
    this.resetQueue();
    for (let y = 0; y < w.sizeY; y++) {
      for (let z = region.z0; z <= region.z1; z++) {
        for (let x = region.x0; x <= region.x1; x++) {
          if (!this.isWritable(region, x, z)) {
            continue;
          }
          const light = getBlock(w.getBlock(x, y, z)).light;
          if (light > 0) {
            w.setBlockLight(x, y, z, light);
            this.push(region, x, y, z);
          }
        }
      }
    }
    this.seedShell(region, 'block');
    this.propagate(region, 'block');
  }

  /** 把重算区域外壳（x0-1、x1+1、z0-1、z1+1）上有光且可写的格子入队作为源。 */
  private seedShell(region: LightRegion, channel: LightChannel): void {
    const w = this.world;
    const shellColumns: [number, number][] = [];
    for (let z = region.z0 - 1; z <= region.z1 + 1; z++) {
      shellColumns.push([region.x0 - 1, z], [region.x1 + 1, z]);
    }
    for (let x = region.x0; x <= region.x1; x++) {
      shellColumns.push([x, region.z0 - 1], [x, region.z1 + 1]);
    }
    for (const [x, z] of shellColumns) {
      if (!this.isWritable(region, x, z)) {
        continue;
      }
      for (let y = 0; y < w.sizeY; y++) {
        const level = channel === 'sky' ? w.getSkyLight(x, y, z) : w.getBlockLight(x, y, z);
        if (level > 1) {
          this.push(region, x, y, z);
        }
      }
    }
  }

  private resetQueue(): void {
    this.queueHead = 0;
    this.queueTail = 0;
  }

  /** 队列元素为传播边界内的局部索引。 */
  private push(region: LightRegion, x: number, y: number, z: number): void {
    const width = region.px1 - region.px0 + 1;
    const depth = region.pz1 - region.pz0 + 1;
    const idx = (y * depth + (z - region.pz0)) * width + (x - region.px0);
    if (this.queueTail >= this.queue.length) {
      this.compactOrGrow();
    }
    this.queue[this.queueTail++] = idx;
  }

  private compactOrGrow(): void {
    const pending = this.queueTail - this.queueHead;
    if (this.queueHead > 0) {
      this.queue.copyWithin(0, this.queueHead, this.queueTail);
    } else {
      const grown = new Int32Array(this.queue.length * 2);
      grown.set(this.queue);
      this.queue = grown;
    }
    this.queueHead = 0;
    this.queueTail = pending;
  }

  private propagate(region: LightRegion, channel: LightChannel): void {
    const w = this.world;
    const width = region.px1 - region.px0 + 1;
    const depth = region.pz1 - region.pz0 + 1;
    const isSky = channel === 'sky';
    while (this.queueHead < this.queueTail) {
      const idx = this.queue[this.queueHead++];
      const x = (idx % width) + region.px0;
      const z = (Math.floor(idx / width) % depth) + region.pz0;
      const y = Math.floor(idx / (width * depth));
      const level = isSky ? w.getSkyLight(x, y, z) : w.getBlockLight(x, y, z);
      if (level <= 1) {
        continue;
      }
      for (const [dx, dy, dz] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        const nz = z + dz;
        if (ny < 0 || ny >= w.sizeY || !this.isWritable(region, nx, nz)) {
          continue;
        }
        const def = getBlock(w.getBlock(nx, ny, nz));
        if (def.opaque) {
          continue;
        }
        const next = level - 1 - (def.isLiquid ? WATER_ATTENUATION : 0);
        const current = isSky ? w.getSkyLight(nx, ny, nz) : w.getBlockLight(nx, ny, nz);
        if (next > current) {
          if (isSky) {
            w.setSkyLight(nx, ny, nz, next);
          } else {
            w.setBlockLight(nx, ny, nz, next);
          }
          this.push(region, nx, ny, nz);
        }
      }
    }
  }
}
