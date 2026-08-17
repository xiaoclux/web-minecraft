import { BlockId, getBlock } from '../blocks/BlockRegistry';
import { CHUNK_SIZE, MAX_LIGHT, SECTION_SHIFT, WORLD_SIZE_Y } from '../constants/world';
import type { ChunkSection } from './Chunk';
import { Chunk, DEFAULT_SKY_LIGHT, chunkKey, sectionIndex, toChunkCoord } from './Chunk';

/** 一次方块变更。 */
export interface BlockChange {
  x: number;
  y: number;
  z: number;
  oldId: number;
  newId: number;
}

type BlockListener = (x: number, y: number, z: number, oldId: number, newId: number) => void;
/** 批量变更结束时收到本批全部变更（按发生顺序）。 */
type BatchListener = (changes: readonly BlockChange[]) => void;
type ChunkListener = (chunk: Chunk) => void;
/** 只改附加数据（方块 id 不变）时的通知：门开关、作物长一格、水位变化都走这里。 */
type MetaListener = (x: number, y: number, z: number, id: number, meta: number) => void;
/**
 * 方块写入拦截器：返回 true 表示"已经接管、本地不要真的改"。
 * 联机客户端用它把所有改方块的意图（放置 / 破坏 / 开门 / 耕地……）统一交给服务端，
 * 等服务端广播回来再落到本地世界，这样各处业务代码不必知道自己在联机。
 */
export type BlockWriteInterceptor = (x: number, y: number, z: number, id: number, meta: number) => boolean;

/**
 * 无限世界的方块与光照存储：按 chunk 分块保存，水平方向无边界。
 * 未加载的 chunk：读方块得空气、读天空光得满亮度、碰撞视为实心（防止掉出世界）。
 */
export class World {
  readonly sizeY = WORLD_SIZE_Y;
  /**
   * 该维度有没有天空光。没有时（下界 / 末地）未加载区与新分配的段一律按全黑处理，
   * 亮度只来自方块光。
   */
  readonly hasSkyLight: boolean;
  readonly chunks = new Map<number, Chunk>();
  /** 需要重建网格的 chunk 键集合。 */
  readonly dirtyChunks = new Set<number>();
  private readonly listeners = new Set<BlockListener>();
  private readonly metaListeners = new Set<MetaListener>();
  private readonly batchListeners = new Set<BatchListener>();
  /** 写入拦截器（联机客户端用），null 表示直接写本地。 */
  writeInterceptor: BlockWriteInterceptor | null = null;
  private readonly chunkLoadListeners = new Set<ChunkListener>();
  private readonly chunkUnloadListeners = new Set<ChunkListener>();
  private batchDepth = 0;
  private batchChanges: BlockChange[] = [];
  private lastChunk: Chunk | null = null;
  /** locate() 的输出槽（避免每次访问分配对象；调用后立即消费）。 */
  private hitChunk: Chunk | null = null;
  /** 命中的段；null 表示该段未分配（全空气、天光满值）。 */
  private hitSection: ChunkSection | null = null;
  private hitIndex = 0;

  constructor(hasSkyLight = true) {
    this.hasSkyLight = hasSkyLight;
  }

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

  /** chunk 是否已加载。 */
  hasChunk(cx: number, cz: number): boolean {
    return this.chunks.has(chunkKey(cx, cz));
  }

  /** chunk 是否可以建网格：自身已点亮且四邻已加载（避免在未加载边界留缝）。 */
  isChunkRenderable(cx: number, cz: number): boolean {
    const chunk = this.getChunk(cx, cz);
    return (
      chunk !== null &&
      chunk.isLit &&
      this.hasChunk(cx - 1, cz) &&
      this.hasChunk(cx + 1, cz) &&
      this.hasChunk(cx, cz - 1) &&
      this.hasChunk(cx, cz + 1)
    );
  }

  /** 玩家改动过的 chunk（需要存档）。 */
  listModifiedChunks(): Chunk[] {
    const out: Chunk[] = [];
    for (const chunk of this.chunks.values()) {
      if (chunk.isModified) {
        out.push(chunk);
      }
    }
    return out;
  }

  /** 加入 chunk（标脏由 ChunkManager 在点亮后统一处理）。 */
  addChunk(chunk: Chunk): void {
    this.chunks.set(chunk.key, chunk);
    // 定位缓存可能还指着同坐标的旧 chunk（联机时服务端数据会替换掉本地的空占位）
    if (this.lastChunk && this.lastChunk.cx === chunk.cx && this.lastChunk.cz === chunk.cz) {
      this.lastChunk = chunk;
    }
    this.hitChunk = null;
    this.hitSection = null;
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

  /** 定位坐标所在 chunk / 段与段内索引，写入 hitChunk / hitSection / hitIndex；未加载或 y 越界返回 false。 */
  private locate(x: number, y: number, z: number): boolean {
    if (y < 0 || y >= this.sizeY) {
      return false;
    }
    const cx = toChunkCoord(x);
    const cz = toChunkCoord(z);
    let chunk = this.lastChunk;
    if (!chunk || chunk.cx !== cx || chunk.cz !== cz) {
      chunk = this.chunks.get(chunkKey(cx, cz)) ?? null;
      if (!chunk) {
        return false;
      }
      this.lastChunk = chunk;
    }
    this.hitChunk = chunk;
    this.hitSection = chunk.sectionAt(y);
    this.hitIndex = sectionIndex(x - chunk.originX, y, z - chunk.originZ);
    return true;
  }

  /** 读取方块；未加载 / 越界返回空气。 */
  getBlock(x: number, y: number, z: number): number {
    if (!this.locate(x, y, z) || !this.hitSection) {
      return BlockId.AIR;
    }
    return this.hitSection.blocks[this.hitIndex];
  }

  /** 读取方块附加数据；未加载返回 0。 */
  getMeta(x: number, y: number, z: number): number {
    if (!this.locate(x, y, z) || !this.hitSection) {
      return 0;
    }
    return this.hitSection.meta[this.hitIndex];
  }

  /** 直接写入方块（不触发光照与脏标记、不标记修改），用于世界生成 / 测试搭建。 */
  setBlockRaw(x: number, y: number, z: number, id: number, meta = 0): void {
    if (!this.locate(x, y, z)) {
      return;
    }
    const section = this.hitSection ?? (id === BlockId.AIR && meta === 0 ? null : this.hitChunk!.ensureSectionAt(y));
    if (!section) {
      return;
    }
    section.blocks[this.hitIndex] = id;
    section.meta[this.hitIndex] = meta;
  }

  /**
   * 修改方块并标记相关 chunk 为脏；返回是否发生变化。光照由 LightEngine 监听更新。
   */
  setBlock(x: number, y: number, z: number, id: number, meta = 0): boolean {
    if (!this.locate(x, y, z)) {
      return false;
    }
    const chunk = this.hitChunk!;
    const idx = this.hitIndex;
    let section = this.hitSection;
    const old = section ? section.blocks[idx] : BlockId.AIR;
    const oldMeta = section ? section.meta[idx] : 0;
    if (old === id && oldMeta === meta) {
      return false;
    }
    if (this.writeInterceptor?.(x, y, z, id, meta)) {
      return false;
    }
    section ??= chunk.ensureSectionAt(y);
    section.blocks[idx] = id;
    section.meta[idx] = meta;
    chunk.markModified();
    this.markDirtyAround(x, y, z);
    if (this.batchDepth > 0) {
      this.batchChanges.push({ x, y, z, oldId: old, newId: id });
    } else {
      for (const listener of this.listeners) {
        listener(x, y, z, old, id);
      }
    }
    return true;
  }

  /** 只修改附加数据（不触发光照重算，但标脏网格与修改标记）。 */
  setMeta(x: number, y: number, z: number, meta: number): boolean {
    if (!this.locate(x, y, z)) {
      return false;
    }
    const current = this.hitSection ? this.hitSection.meta[this.hitIndex] : 0;
    if (current === meta) {
      return false;
    }
    const id = this.hitSection ? this.hitSection.blocks[this.hitIndex] : BlockId.AIR;
    if (this.writeInterceptor?.(x, y, z, id, meta)) {
      return false;
    }
    (this.hitSection ?? this.hitChunk!.ensureSectionAt(y)).meta[this.hitIndex] = meta;
    this.hitChunk!.markModified();
    this.markDirtyAround(x, y, z);
    for (const listener of this.metaListeners) {
      listener(x, y, z, id, meta);
    }
    return true;
  }

  /** 订阅"只改附加数据"的变化（setMeta）；setBlock 引起的变化不会重复通知到这里。 */
  onMetaChange(listener: MetaListener): () => void {
    this.metaListeners.add(listener);
    return () => this.metaListeners.delete(listener);
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
      if (this.batchDepth === 0 && this.batchChanges.length > 0) {
        const changes = this.batchChanges;
        this.batchChanges = [];
        for (const listener of this.batchListeners) {
          listener(changes);
        }
      }
    }
  }

  /** 订阅批量变更范围。 */
  onBatchChange(listener: BatchListener): () => void {
    this.batchListeners.add(listener);
    return () => this.batchListeners.delete(listener);
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

  /** 标记以 (cx,cz) 为中心 radius 内的 chunk 为脏。 */
  markDirtyRadius(cx: number, cz: number, radius: number): void {
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        this.markDirty(cx + dx, cz + dz);
      }
    }
  }

  /** 把所有已加载 chunk 标脏（渲染器切换世界后要从头重建网格）。 */
  markAllDirty(): void {
    for (const key of this.chunks.keys()) {
      this.dirtyChunks.add(key);
    }
  }

  /** 按键取 chunk（脏集合里存的就是键）。 */
  getChunkByKey(key: number): Chunk | null {
    return this.chunks.get(key) ?? null;
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
    if (!this.hasSkyLight) {
      return 0;
    }
    if (y >= this.sizeY) {
      return MAX_LIGHT;
    }
    if (y < 0) {
      return 0;
    }
    if (!this.locate(x, y, z) || !this.hitSection) {
      return MAX_LIGHT;
    }
    return this.hitSection.skyLight[this.hitIndex];
  }

  /** 读取方块光；未加载 / 越界返回 0。 */
  getBlockLight(x: number, y: number, z: number): number {
    if (!this.locate(x, y, z) || !this.hitSection) {
      return 0;
    }
    return this.hitSection.blockLight[this.hitIndex];
  }

  /** 写入天空光（LightEngine 用）；未加载忽略。 */
  setSkyLight(x: number, y: number, z: number, level: number): void {
    if (!this.locate(x, y, z)) {
      return;
    }
    if (!this.hitSection && level === DEFAULT_SKY_LIGHT) {
      return;
    }
    (this.hitSection ?? this.hitChunk!.ensureSectionAt(y)).skyLight[this.hitIndex] = level;
  }

  /** 写入方块光（LightEngine 用）；未加载忽略。 */
  setBlockLight(x: number, y: number, z: number, level: number): void {
    if (!this.locate(x, y, z)) {
      return;
    }
    if (!this.hitSection && level === 0) {
      return;
    }
    (this.hitSection ?? this.hitChunk!.ensureSectionAt(y)).blockLight[this.hitIndex] = level;
  }

  /** 该位置是否为不透光方块。 */
  isOpaqueAt(x: number, y: number, z: number): boolean {
    return getBlock(this.getBlock(x, y, z)).opaque;
  }

  /** 一个双格高的生物能否站在方块 (x, y, z) 上：脚下实心、身位两格空气。生成 / 传送落点共用。 */
  canStandAt(x: number, y: number, z: number): boolean {
    return (
      this.isSolidAt(x, y - 1, z) &&
      this.getBlock(x, y, z) === BlockId.AIR &&
      this.getBlock(x, y + 1, z) === BlockId.AIR
    );
  }

  /** 该位置是否有碰撞（未加载 chunk 视为实心，形成临时边界；世界上方为空）。 */
  isSolidAt(x: number, y: number, z: number): boolean {
    if (y >= this.sizeY) {
      return false;
    }
    if (y < 0) {
      return true;
    }
    if (!this.locate(x, y, z)) {
      return true;
    }
    if (!this.hitSection) {
      return false;
    }
    return getBlock(this.hitSection.blocks[this.hitIndex]).solid;
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
    // 从最高已分配段往下找，段未分配说明整段都是空气
    let y = chunk.filledMaxY - 1;
    while (y >= 0) {
      const section = chunk.sectionAt(y);
      if (!section) {
        y = ((y >> SECTION_SHIFT) << SECTION_SHIFT) - 1;
        continue;
      }
      if (getBlock(section.blocks[sectionIndex(lx, y, lz)]).opaque) {
        break;
      }
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
    const chunk = this.getChunkAt(x, z);
    const top = chunk ? chunk.filledMaxY : this.sizeY;
    for (let y = top - 1; y >= 0; y--) {
      if (getBlock(this.getBlock(x, y, z)).solid) {
        return y + 1;
      }
    }
    return 0;
  }
}
