import { BlockId, getBlock } from '../blocks/BlockRegistry';
import { CHUNK_SIZE, MAX_LIGHT, WORLD_SIZE_Y } from '../constants/world';
import { Chunk, chunkKey, localIndex, toChunkCoord } from './Chunk';

export { chunkKey } from './Chunk';

type BlockListener = (x: number, y: number, z: number, oldId: number, newId: number) => void;
type BatchListener = (minX: number, maxX: number, minZ: number, maxZ: number) => void;
type ChunkListener = (chunk: Chunk) => void;

/**
 * 无限世界的方块与光照存储：按 chunk 分块保存，水平方向无边界。
 * 未加载的 chunk：读方块得空气、读天空光得满亮度、碰撞视为实心（防止掉出世界）。
 */
export class World {
  readonly sizeY = WORLD_SIZE_Y;
  readonly chunks = new Map<number, Chunk>();
  /** 需要重建网格的 chunk 键集合。 */
  readonly dirtyChunks = new Set<number>();
  private readonly listeners = new Set<BlockListener>();
  private readonly batchListeners = new Set<BatchListener>();
  private readonly chunkLoadListeners = new Set<ChunkListener>();
  private readonly chunkUnloadListeners = new Set<ChunkListener>();
  private batchDepth = 0;
  private batchBounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null = null;
  private lastChunk: Chunk | null = null;

  // ---------------------------------------------------------------- chunk 管理

  /** 获取 chunk（未加载返回 null）。 */
  getChunk(cx: number, cz: number): Chunk | null {
    const last = this.lastChunk;
    if (last && last.cx === cx && last.cz === cz) {
      return last;
    }
    const chunk = this.chunks.get(chunkKey(cx, cz)) ?? null;
    if (chunk) {
      this.lastChunk = chunk;
    }
    return chunk;
  }

  /** 按方块坐标获取 chunk。 */
  getChunkAt(x: number, z: number): Chunk | null {
    return this.getChunk(toChunkCoord(x), toChunkCoord(z));
  }

  /** 该列所在 chunk 是否已加载。 */
  hasChunkAt(x: number, z: number): boolean {
    return this.getChunkAt(x, z) !== null;
  }

  /** 已加载 chunk 数。 */
  get chunkCount(): number {
    return this.chunks.size;
  }

  /** 加入 chunk 并标脏它与四邻（邻居朝向它的面需要重建）。 */
  addChunk(chunk: Chunk): void {
    this.chunks.set(chunk.key, chunk);
    this.markDirty(chunk.cx, chunk.cz);
    this.markDirty(chunk.cx - 1, chunk.cz);
    this.markDirty(chunk.cx + 1, chunk.cz);
    this.markDirty(chunk.cx, chunk.cz - 1);
    this.markDirty(chunk.cx, chunk.cz + 1);
    for (const listener of this.chunkLoadListeners) {
      listener(chunk);
    }
  }

  /** 卸载 chunk。 */
  removeChunk(cx: number, cz: number): void {
    const chunk = this.getChunk(cx, cz);
    if (!chunk) {
      return;
    }
    this.chunks.delete(chunk.key);
    this.dirtyChunks.delete(chunk.key);
    if (this.lastChunk === chunk) {
      this.lastChunk = null;
    }
    for (const listener of this.chunkUnloadListeners) {
      listener(chunk);
    }
  }

  /** 订阅 chunk 加载。 */
  onChunkLoad(listener: ChunkListener): () => void {
    this.chunkLoadListeners.add(listener);
    return () => this.chunkLoadListeners.delete(listener);
  }

  /** 订阅 chunk 卸载。 */
  onChunkUnload(listener: ChunkListener): () => void {
    this.chunkUnloadListeners.add(listener);
    return () => this.chunkUnloadListeners.delete(listener);
  }

  // ---------------------------------------------------------------- 方块读写

  /** 坐标是否在已加载区域内（y 合法且 chunk 已加载）。 */
  inBounds(x: number, y: number, z: number): boolean {
    return y >= 0 && y < this.sizeY && this.hasChunkAt(x, z);
  }

  private locate(x: number, y: number, z: number): { chunk: Chunk; idx: number } | null {
    if (y < 0 || y >= this.sizeY) {
      return null;
    }
    const chunk = this.getChunkAt(x, z);
    if (!chunk) {
      return null;
    }
    return { chunk, idx: localIndex(x - chunk.originX, y, z - chunk.originZ) };
  }

  /** 读取方块；未加载 / 越界返回空气。 */
  getBlock(x: number, y: number, z: number): number {
    const loc = this.locate(x, y, z);
    return loc ? loc.chunk.blocks[loc.idx] : BlockId.AIR;
  }

  /** 读取方块附加数据；未加载返回 0。 */
  getMeta(x: number, y: number, z: number): number {
    const loc = this.locate(x, y, z);
    return loc ? loc.chunk.meta[loc.idx] : 0;
  }

  /** 直接写入方块（不触发光照与脏标记、不标记修改），用于世界生成 / 测试搭建。 */
  setBlockRaw(x: number, y: number, z: number, id: number, meta = 0): void {
    const loc = this.locate(x, y, z);
    if (loc) {
      loc.chunk.blocks[loc.idx] = id;
      loc.chunk.meta[loc.idx] = meta;
    }
  }

  /**
   * 修改方块并标记相关 chunk 为脏；返回是否发生变化。光照由 LightEngine 监听更新。
   */
  setBlock(x: number, y: number, z: number, id: number, meta = 0): boolean {
    const loc = this.locate(x, y, z);
    if (!loc) {
      return false;
    }
    const old = loc.chunk.blocks[loc.idx];
    const oldMeta = loc.chunk.meta[loc.idx];
    if (old === id && oldMeta === meta) {
      return false;
    }
    loc.chunk.blocks[loc.idx] = id;
    loc.chunk.meta[loc.idx] = meta;
    loc.chunk.isModified = true;
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

  /** 只修改附加数据（不触发光照重算，但标脏网格与修改标记）。 */
  setMeta(x: number, y: number, z: number, meta: number): boolean {
    const loc = this.locate(x, y, z);
    if (!loc || loc.chunk.meta[loc.idx] === meta) {
      return false;
    }
    loc.chunk.meta[loc.idx] = meta;
    loc.chunk.isModified = true;
    this.markDirtyAround(x, y, z);
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
  onBatchChange(listener: BatchListener): () => void {
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
  onBlockChange(listener: BlockListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ---------------------------------------------------------------- 脏标记

  /** 标记包含该坐标的 chunk 及（若在边界）相邻 chunk 为脏。 */
  markDirtyAround(x: number, _y: number, z: number): void {
    const cx = toChunkCoord(x);
    const cz = toChunkCoord(z);
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

  /** 标记 chunk 为脏（未加载则忽略）。 */
  markDirty(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    if (this.chunks.has(key)) {
      this.dirtyChunks.add(key);
    }
  }

  // ---------------------------------------------------------------- 光照与高度

  /** 读取天空光；未加载或高于世界返回满亮度，低于世界返回 0。 */
  getSkyLight(x: number, y: number, z: number): number {
    if (y >= this.sizeY) {
      return MAX_LIGHT;
    }
    if (y < 0) {
      return 0;
    }
    const chunk = this.getChunkAt(x, z);
    if (!chunk) {
      return MAX_LIGHT;
    }
    return chunk.skyLight[localIndex(x - chunk.originX, y, z - chunk.originZ)];
  }

  /** 读取方块光；未加载 / 越界返回 0。 */
  getBlockLight(x: number, y: number, z: number): number {
    const loc = this.locate(x, y, z);
    return loc ? loc.chunk.blockLight[loc.idx] : 0;
  }

  /** 写入天空光（LightEngine 用）；未加载忽略。 */
  setSkyLight(x: number, y: number, z: number, level: number): void {
    const loc = this.locate(x, y, z);
    if (loc) {
      loc.chunk.skyLight[loc.idx] = level;
    }
  }

  /** 写入方块光（LightEngine 用）；未加载忽略。 */
  setBlockLight(x: number, y: number, z: number, level: number): void {
    const loc = this.locate(x, y, z);
    if (loc) {
      loc.chunk.blockLight[loc.idx] = level;
    }
  }

  /** 该位置是否为不透光方块。 */
  isOpaqueAt(x: number, y: number, z: number): boolean {
    return getBlock(this.getBlock(x, y, z)).opaque;
  }

  /** 该位置是否有碰撞（未加载 chunk 视为实心，形成临时边界；世界上方为空）。 */
  isSolidAt(x: number, y: number, z: number): boolean {
    if (y >= this.sizeY) {
      return false;
    }
    if (y < 0) {
      return true;
    }
    const chunk = this.getChunkAt(x, z);
    if (!chunk) {
      return true;
    }
    return getBlock(chunk.blocks[localIndex(x - chunk.originX, y, z - chunk.originZ)]).solid;
  }

  /** 该位置是否为液体。 */
  isLiquidAt(x: number, y: number, z: number): boolean {
    return getBlock(this.getBlock(x, y, z)).isLiquid === true;
  }

  /** 重新计算指定列的高度图（未加载忽略）。 */
  recomputeHeight(x: number, z: number): void {
    const chunk = this.getChunkAt(x, z);
    if (!chunk) {
      return;
    }
    const lx = x - chunk.originX;
    const lz = z - chunk.originZ;
    let y = this.sizeY - 1;
    while (y >= 0 && !getBlock(chunk.blocks[localIndex(lx, y, lz)]).opaque) {
      y--;
    }
    chunk.heightMap[lz * CHUNK_SIZE + lx] = y + 1;
  }

  /** 读取列高度（未加载返回 0）。 */
  getHeight(x: number, z: number): number {
    const chunk = this.getChunkAt(x, z);
    if (!chunk) {
      return 0;
    }
    return chunk.heightMap[(z - chunk.originZ) * CHUNK_SIZE + (x - chunk.originX)];
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
