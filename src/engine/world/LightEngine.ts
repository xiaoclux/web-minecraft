import { getBlock } from '../blocks/BlockRegistry';
import { CHUNK_SIZE, CHUNK_VOLUME, MAX_LIGHT, WORLD_SIZE_Y } from '../constants/world';
import type { Chunk } from './Chunk';
import { localIndex, toChunkCoord } from './Chunk';
import type { World } from './World';

/** 水对光照的额外衰减。 */
const WATER_ATTENUATION = 2;
/** 队列条目宽度：x, y, z, level。 */
const QUEUE_STRIDE = 4;
const INITIAL_QUEUE_ENTRIES = CHUNK_VOLUME;

const DIRS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/** 光照通道：按 chunk 取对应的数组。 */
type ChannelArray = (chunk: Chunk) => Uint8Array;
const SKY: ChannelArray = (chunk) => chunk.skyLight;
const BLOCK: ChannelArray = (chunk) => chunk.blockLight;

/** 可增长的 (x,y,z,level) 队列。 */
class LightQueue {
  private data = new Int32Array(INITIAL_QUEUE_ENTRIES * QUEUE_STRIDE);
  private head = 0;
  private tail = 0;

  get isEmpty(): boolean {
    return this.head >= this.tail;
  }

  clear(): void {
    this.head = 0;
    this.tail = 0;
  }

  push(x: number, y: number, z: number, level: number): void {
    if (this.tail + QUEUE_STRIDE > this.data.length) {
      this.compactOrGrow();
    }
    const d = this.data;
    d[this.tail] = x;
    d[this.tail + 1] = y;
    d[this.tail + 2] = z;
    d[this.tail + 3] = level;
    this.tail += QUEUE_STRIDE;
  }

  /** 弹出到 out（长度 ≥4）。 */
  pop(out: Int32Array): void {
    const d = this.data;
    out[0] = d[this.head];
    out[1] = d[this.head + 1];
    out[2] = d[this.head + 2];
    out[3] = d[this.head + 3];
    this.head += QUEUE_STRIDE;
  }

  private compactOrGrow(): void {
    const pending = this.tail - this.head;
    if (this.head > 0) {
      this.data.copyWithin(0, this.head, this.tail);
    } else {
      const grown = new Int32Array(this.data.length * 2);
      grown.set(this.data);
      this.data = grown;
    }
    this.head = 0;
    this.tail = pending;
  }
}

/**
 * 天空光 + 方块光（火把等）：
 * - 新 chunk 加载时整体点亮并向已点亮的邻居传播；
 * - 单个方块变化时做增量更新（先撤光再补光），代价只与受影响的格子数成正比。
 * 通过 World 的方块变化事件自动驱动。
 */
export class LightEngine {
  private readonly skyAdds = new LightQueue();
  private readonly blockAdds = new LightQueue();
  private readonly removeQueue = new LightQueue();
  private readonly popped = new Int32Array(QUEUE_STRIDE);
  /** 定位缓存（避免每格都查 Map）。 */
  private cacheChunk: Chunk | null = null;
  private cacheIndex = 0;
  /** 本次更新写过的范围，用于标脏。 */
  private touchedMinX = Infinity;
  private touchedMaxX = -Infinity;
  private touchedMinZ = Infinity;
  private touchedMaxZ = -Infinity;

  constructor(private readonly world: World) {
    world.onBlockChange((x, y, z) => this.onBlockChanged(x, y, z));
    world.onBatchChange((changes) => {
      for (const c of changes) {
        this.onBlockChanged(c.x, c.y, c.z);
      }
    });
  }

  /**
   * 点亮一个新加载的 chunk：算它自己的直射天光与光源，并向已点亮的邻居传播（光只增不减，无需重算邻居）。
   */
  lightChunk(chunk: Chunk): void {
    const w = this.world;
    chunk.skyLight.fill(0);
    chunk.blockLight.fill(0);
    chunk.isLit = true;
    const x0 = chunk.originX;
    const z0 = chunk.originZ;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        w.recomputeHeight(x0 + lx, z0 + lz);
      }
    }
    // 直射天光 + 侧向种子（相邻列更高的部分）
    this.skyAdds.clear();
    this.blockAdds.clear();
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const x = x0 + lx;
        const z = z0 + lz;
        const h = chunk.heightMap[lz * CHUNK_SIZE + lx];
        for (let y = h; y < WORLD_SIZE_Y; y++) {
          chunk.skyLight[localIndex(lx, y, lz)] = MAX_LIGHT;
        }
        const neighborMax = Math.max(
          w.getHeight(x + 1, z),
          w.getHeight(x - 1, z),
          w.getHeight(x, z + 1),
          w.getHeight(x, z - 1),
        );
        for (let y = h; y < neighborMax && y < WORLD_SIZE_Y; y++) {
          this.skyAdds.push(x, y, z, MAX_LIGHT);
        }
      }
    }
    this.seedShell(chunk, SKY);
    this.propagate(SKY, this.skyAdds);
    // 方块光源
    for (let idx = 0; idx < CHUNK_VOLUME; idx++) {
      const light = getBlock(chunk.blocks[idx]).light;
      if (light > 0) {
        chunk.blockLight[idx] = light;
        const lx = idx % CHUNK_SIZE;
        const lz = Math.floor(idx / CHUNK_SIZE) % CHUNK_SIZE;
        const y = Math.floor(idx / (CHUNK_SIZE * CHUNK_SIZE));
        this.blockAdds.push(x0 + lx, y, z0 + lz, light);
      }
    }
    this.seedShell(chunk, BLOCK);
    this.propagate(BLOCK, this.blockAdds);
    this.resetTouched();
  }

  /** 把 chunk 四周已点亮邻居的边界列中有光的格子入队作为源。 */
  private seedShell(chunk: Chunk, channel: ChannelArray): void {
    const x0 = chunk.originX;
    const z0 = chunk.originZ;
    const x1 = x0 + CHUNK_SIZE - 1;
    const z1 = z0 + CHUNK_SIZE - 1;
    for (let i = 0; i < CHUNK_SIZE; i++) {
      this.seedColumn(x0 - 1, z0 + i, channel);
      this.seedColumn(x1 + 1, z0 + i, channel);
      this.seedColumn(x0 + i, z0 - 1, channel);
      this.seedColumn(x0 + i, z1 + 1, channel);
    }
  }

  private seedColumn(x: number, z: number, channel: ChannelArray): void {
    const chunk = this.world.getChunkAt(x, z);
    if (!chunk || !chunk.isLit) {
      return;
    }
    const arr = channel(chunk);
    const lx = x - chunk.originX;
    const lz = z - chunk.originZ;
    for (let y = 0; y < WORLD_SIZE_Y; y++) {
      const level = arr[localIndex(lx, y, lz)];
      if (level > 1) {
        (channel === SKY ? this.skyAdds : this.blockAdds).push(x, y, z, level);
      }
    }
  }

  /**
   * 单个方块变化后的增量更新：
   * 1) 列高度变化 → 直射天光的增减；2) 撤掉该格原有的光并沿传播路径回收；3) 从周围与新光源重新补光。
   */
  onBlockChanged(x: number, y: number, z: number): void {
    const w = this.world;
    const chunk = w.getChunkAt(x, z);
    if (!chunk || !chunk.isLit || y < 0 || y >= WORLD_SIZE_Y) {
      return;
    }
    const oldHeight = w.getHeight(x, z);
    w.recomputeHeight(x, z);
    const newHeight = w.getHeight(x, z);
    this.resetTouched();
    this.skyAdds.clear();
    this.blockAdds.clear();
    this.removeQueue.clear();
    // 撤光：不再直射的列段 + 该格自身（两个通道）
    for (let yy = oldHeight; yy < newHeight; yy++) {
      this.seedRemoval(SKY, x, yy, z);
    }
    this.seedRemoval(SKY, x, y, z);
    this.propagateRemoval(SKY);
    this.seedRemoval(BLOCK, x, y, z);
    this.propagateRemoval(BLOCK);
    // 补光：新直射的列段
    for (let yy = newHeight; yy < oldHeight; yy++) {
      this.setLevel(SKY, x, yy, z, MAX_LIGHT);
      this.skyAdds.push(x, yy, z, MAX_LIGHT);
    }
    const def = getBlock(w.getBlock(x, y, z));
    if (def.light > 0) {
      this.setLevel(BLOCK, x, y, z, def.light);
      this.blockAdds.push(x, y, z, def.light);
    }
    // 该格若可透光，让邻居的光重新流入（含衰减规则变化，如水）
    if (!def.opaque) {
      for (const [dx, dy, dz] of DIRS) {
        this.pushIfLit(SKY, x + dx, y + dy, z + dz);
        this.pushIfLit(BLOCK, x + dx, y + dy, z + dz);
      }
    }
    this.propagate(SKY, this.skyAdds);
    this.propagate(BLOCK, this.blockAdds);
    this.markTouched();
  }

  /** 邻居格若有光则作为该通道的补光源入队。 */
  private pushIfLit(channel: ChannelArray, x: number, y: number, z: number): void {
    if (!this.locate(x, y, z)) {
      return;
    }
    const level = channel(this.cacheChunk!)[this.cacheIndex];
    if (level > 1) {
      (channel === SKY ? this.skyAdds : this.blockAdds).push(x, y, z, level);
    }
  }

  /** 撤光种子：记录旧值、清零并入撤光队列。 */
  private seedRemoval(channel: ChannelArray, x: number, y: number, z: number): void {
    if (!this.locate(x, y, z)) {
      return;
    }
    const arr = channel(this.cacheChunk!);
    const level = arr[this.cacheIndex];
    if (level === 0) {
      return;
    }
    arr[this.cacheIndex] = 0;
    this.touch(x, z);
    this.removeQueue.push(x, y, z, level);
  }

  /** 撤光 BFS：比源弱的邻居一并撤掉，不弱于源的邻居作为补光源。 */
  private propagateRemoval(channel: ChannelArray): void {
    const adds = channel === SKY ? this.skyAdds : this.blockAdds;
    while (!this.removeQueue.isEmpty) {
      this.removeQueue.pop(this.popped);
      const [x, y, z, level] = this.popped;
      for (const [dx, dy, dz] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        const nz = z + dz;
        if (!this.locate(nx, ny, nz)) {
          continue;
        }
        const arr = channel(this.cacheChunk!);
        const nl = arr[this.cacheIndex];
        if (nl === 0) {
          continue;
        }
        if (nl < level) {
          arr[this.cacheIndex] = 0;
          this.touch(nx, nz);
          this.removeQueue.push(nx, ny, nz, nl);
        } else {
          adds.push(nx, ny, nz, nl);
        }
      }
    }
  }

  /** 补光 BFS。 */
  private propagate(channel: ChannelArray, queue: LightQueue): void {
    while (!queue.isEmpty) {
      queue.pop(this.popped);
      const [x, y, z] = this.popped;
      if (!this.locate(x, y, z)) {
        continue;
      }
      const level = channel(this.cacheChunk!)[this.cacheIndex];
      if (level <= 1) {
        continue;
      }
      for (const [dx, dy, dz] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        const nz = z + dz;
        if (!this.locate(nx, ny, nz)) {
          continue;
        }
        const chunk = this.cacheChunk!;
        const idx = this.cacheIndex;
        const def = getBlock(chunk.blocks[idx]);
        if (def.opaque) {
          continue;
        }
        const next = level - 1 - (def.isLiquid ? WATER_ATTENUATION : 0);
        const arr = channel(chunk);
        if (next > arr[idx]) {
          arr[idx] = next;
          this.touch(nx, nz);
          queue.push(nx, ny, nz, next);
        }
      }
    }
  }

  private setLevel(channel: ChannelArray, x: number, y: number, z: number, level: number): void {
    if (this.locate(x, y, z)) {
      channel(this.cacheChunk!)[this.cacheIndex] = level;
      this.touch(x, z);
    }
  }

  /** 定位到已点亮 chunk 的格子；结果放在 cacheChunk / cacheIndex。 */
  private locate(x: number, y: number, z: number): boolean {
    if (y < 0 || y >= WORLD_SIZE_Y) {
      return false;
    }
    const cx = toChunkCoord(x);
    const cz = toChunkCoord(z);
    let chunk = this.cacheChunk;
    if (!chunk || chunk.cx !== cx || chunk.cz !== cz) {
      chunk = this.world.getChunk(cx, cz);
      if (!chunk || !chunk.isLit) {
        return false;
      }
      this.cacheChunk = chunk;
    }
    this.cacheIndex = localIndex(x - chunk.originX, y, z - chunk.originZ);
    return true;
  }

  private touch(x: number, z: number): void {
    this.touchedMinX = Math.min(this.touchedMinX, x);
    this.touchedMaxX = Math.max(this.touchedMaxX, x);
    this.touchedMinZ = Math.min(this.touchedMinZ, z);
    this.touchedMaxZ = Math.max(this.touchedMaxZ, z);
  }

  private resetTouched(): void {
    this.touchedMinX = Infinity;
    this.touchedMaxX = -Infinity;
    this.touchedMinZ = Infinity;
    this.touchedMaxZ = -Infinity;
  }

  /** 光照变化会影响相邻方块面的平滑光照，因此范围向外扩 1 再标脏。 */
  private markTouched(): void {
    if (this.touchedMinX === Infinity) {
      return;
    }
    const cx0 = toChunkCoord(this.touchedMinX - 1);
    const cx1 = toChunkCoord(this.touchedMaxX + 1);
    const cz0 = toChunkCoord(this.touchedMinZ - 1);
    const cz1 = toChunkCoord(this.touchedMaxZ + 1);
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        this.world.markDirty(cx, cz);
      }
    }
  }
}
