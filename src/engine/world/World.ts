import { BlockId, getBlock } from '../blocks/BlockRegistry';
import { CHUNK_SIZE, CHUNKS_X, CHUNKS_Z, WORLD_SIZE_X, WORLD_SIZE_Y, WORLD_SIZE_Z } from '../constants/world';

/** chunk 键（cx,cz → number）。 */
export function chunkKey(cx: number, cz: number): number {
  return cz * CHUNKS_X + cx;
}

/** 有限世界的方块与光照存储。 */
export class World {
  readonly sizeX = WORLD_SIZE_X;
  readonly sizeY = WORLD_SIZE_Y;
  readonly sizeZ = WORLD_SIZE_Z;
  readonly blocks: Uint8Array;
  readonly skyLight: Uint8Array;
  readonly blockLight: Uint8Array;
  /** 每列最高非透光方块之上的 y（即天空光可直达的最低 y）。 */
  readonly heightMap: Uint8Array;
  /** 需要重建网格的 chunk 键集合。 */
  readonly dirtyChunks = new Set<number>();
  private listeners = new Set<(x: number, y: number, z: number, oldId: number, newId: number) => void>();
  private batchDepth = 0;
  private batchBounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null = null;
  private batchListeners = new Set<(minX: number, maxX: number, minZ: number, maxZ: number) => void>();

  constructor() {
    const volume = this.sizeX * this.sizeY * this.sizeZ;
    this.blocks = new Uint8Array(volume);
    this.skyLight = new Uint8Array(volume);
    this.blockLight = new Uint8Array(volume);
    this.heightMap = new Uint8Array(this.sizeX * this.sizeZ);
  }

  /** 坐标是否在世界内。 */
  inBounds(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sizeX && y < this.sizeY && z < this.sizeZ;
  }

  /** 平铺索引。调用方保证坐标合法。 */
  index(x: number, y: number, z: number): number {
    return (y * this.sizeZ + z) * this.sizeX + x;
  }

  /** 读取方块；越界返回空气。 */
  getBlock(x: number, y: number, z: number): number {
    if (!this.inBounds(x, y, z)) {
      return BlockId.AIR;
    }
    return this.blocks[this.index(x, y, z)];
  }

  /**
   * 直接写入方块（不触发光照与脏标记），用于世界生成。
   */
  setBlockRaw(x: number, y: number, z: number, id: number): void {
    if (this.inBounds(x, y, z)) {
      this.blocks[this.index(x, y, z)] = id;
    }
  }

  /**
   * 修改方块并标记相关 chunk 为脏；返回是否发生变化。光照由 LightEngine 监听更新。
   */
  setBlock(x: number, y: number, z: number, id: number): boolean {
    if (!this.inBounds(x, y, z)) {
      return false;
    }
    const idx = this.index(x, y, z);
    const old = this.blocks[idx];
    if (old === id) {
      return false;
    }
    this.blocks[idx] = id;
    this.markDirtyAround(x, y, z);
    if (this.batchDepth > 0) {
      this.extendBatch(x, z);
    } else {
      for (const listener of this.listeners) {
        listener(x, y, z, old, id);
      }
    }
    return true;
  }

  /**
   * 批量修改：期间不触发逐块监听，结束时把整个范围一次性交给批量监听（用于爆炸等）。
   */
  batch(fn: () => void): void {
    this.batchDepth++;
    try {
      fn();
    } finally {
      this.batchDepth--;
      if (this.batchDepth === 0 && this.batchBounds) {
        const b = this.batchBounds;
        this.batchBounds = null;
        for (const listener of this.batchListeners) {
          listener(b.minX, b.maxX, b.minZ, b.maxZ);
        }
      }
    }
  }

  /** 订阅批量变更范围。 */
  onBatchChange(listener: (minX: number, maxX: number, minZ: number, maxZ: number) => void): () => void {
    this.batchListeners.add(listener);
    return () => this.batchListeners.delete(listener);
  }

  private extendBatch(x: number, z: number): void {
    if (!this.batchBounds) {
      this.batchBounds = { minX: x, maxX: x, minZ: z, maxZ: z };
      return;
    }
    const b = this.batchBounds;
    b.minX = Math.min(b.minX, x);
    b.maxX = Math.max(b.maxX, x);
    b.minZ = Math.min(b.minZ, z);
    b.maxZ = Math.max(b.maxZ, z);
  }

  /** 订阅方块变化。 */
  onBlockChange(listener: (x: number, y: number, z: number, oldId: number, newId: number) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 标记包含该坐标的 chunk 及（若在边界）相邻 chunk 为脏。 */
  markDirtyAround(x: number, _y: number, z: number): void {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    this.markDirty(cx, cz);
    if (lx === 0) {
      this.markDirty(cx - 1, cz);
    }
    if (lx === CHUNK_SIZE - 1) {
      this.markDirty(cx + 1, cz);
    }
    if (lz === 0) {
      this.markDirty(cx, cz - 1);
    }
    if (lz === CHUNK_SIZE - 1) {
      this.markDirty(cx, cz + 1);
    }
  }

  /** 标记 chunk 为脏。 */
  markDirty(cx: number, cz: number): void {
    if (cx < 0 || cz < 0 || cx >= CHUNKS_X || cz >= CHUNKS_Z) {
      return;
    }
    this.dirtyChunks.add(chunkKey(cx, cz));
  }

  /** 标记全部 chunk 为脏。 */
  markAllDirty(): void {
    for (let cz = 0; cz < CHUNKS_Z; cz++) {
      for (let cx = 0; cx < CHUNKS_X; cx++) {
        this.dirtyChunks.add(chunkKey(cx, cz));
      }
    }
  }

  /** 读取天空光；越界返回满亮度。 */
  getSkyLight(x: number, y: number, z: number): number {
    if (!this.inBounds(x, y, z)) {
      return y >= this.sizeY ? 15 : 0;
    }
    return this.skyLight[this.index(x, y, z)];
  }

  /** 读取方块光；越界返回 0。 */
  getBlockLight(x: number, y: number, z: number): number {
    if (!this.inBounds(x, y, z)) {
      return 0;
    }
    return this.blockLight[this.index(x, y, z)];
  }

  /** 该位置是否为不透光方块。 */
  isOpaqueAt(x: number, y: number, z: number): boolean {
    return getBlock(this.getBlock(x, y, z)).opaque;
  }

  /** 该位置是否有碰撞（越界视为实心，形成地图边界）。 */
  isSolidAt(x: number, y: number, z: number): boolean {
    if (!this.inBounds(x, y, z)) {
      return y < this.sizeY;
    }
    return getBlock(this.blocks[this.index(x, y, z)]).solid;
  }

  /** 该位置是否为液体。 */
  isLiquidAt(x: number, y: number, z: number): boolean {
    return getBlock(this.getBlock(x, y, z)).isLiquid === true;
  }

  /** 重新计算指定列的高度图。 */
  recomputeHeight(x: number, z: number): void {
    let y = this.sizeY - 1;
    while (y >= 0 && !getBlock(this.blocks[this.index(x, y, z)]).opaque) {
      y--;
    }
    this.heightMap[z * this.sizeX + x] = y + 1;
  }

  /** 全量重算高度图。 */
  recomputeAllHeights(): void {
    for (let z = 0; z < this.sizeZ; z++) {
      for (let x = 0; x < this.sizeX; x++) {
        this.recomputeHeight(x, z);
      }
    }
  }

  /** 读取列高度（越界返回 0）。 */
  getHeight(x: number, z: number): number {
    if (x < 0 || z < 0 || x >= this.sizeX || z >= this.sizeZ) {
      return 0;
    }
    return this.heightMap[z * this.sizeX + x];
  }

  /** 找到该列最高的实心方块之上的 y（用于出生点/生成）。 */
  getSurfaceY(x: number, z: number): number {
    for (let y = this.sizeY - 1; y >= 0; y--) {
      if (getBlock(this.getBlock(x, y, z)).solid) {
        return y + 1;
      }
    }
    return 0;
  }
}
