import { BlockId, getBlock } from '../blocks/BlockRegistry';
import {
  CHUNK_SIZE,
  MAX_LIGHT,
  SECTION_COUNT,
  SECTION_HEIGHT,
  SECTION_SHIFT,
  SECTION_VOLUME,
  WORLD_SIZE_Y,
} from '../constants/world';
import type { Chunk, ChunkSection } from './Chunk';
import { DEFAULT_SKY_LIGHT, sectionIndex, toChunkCoord } from './Chunk';
import type { World } from './World';

/** 水对光照的额外衰减。 */
const WATER_ATTENUATION = 2;
/** 队列条目宽度：x, y, z, level。 */
const QUEUE_STRIDE = 4;
const INITIAL_QUEUE_ENTRIES = SECTION_VOLUME * 4;

const DIRS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/** 光照通道。 */
const enum Channel {
  SKY = 0,
  BLOCK = 1,
}

/** 取段内某通道的数组。 */
function channelArray(section: ChunkSection, channel: Channel): Uint8Array {
  return channel === Channel.SKY ? section.skyLight : section.blockLight;
}

/** 未分配段在该通道的默认值。 */
function channelDefault(channel: Channel): number {
  return channel === Channel.SKY ? DEFAULT_SKY_LIGHT : 0;
}

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
  /** 定位缓存（避免每格都查 Map）。cacheSection 为 null 表示该段未分配。 */
  private cacheChunk: Chunk | null = null;
  private cacheSection: ChunkSection | null = null;
  private cacheY = 0;
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
    chunk.isLit = true;
    const x0 = chunk.originX;
    const z0 = chunk.originZ;
    let maxHeight = 0;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        w.recomputeHeight(x0 + lx, z0 + lz);
        const h = chunk.heightMap[lz * CHUNK_SIZE + lx];
        if (h > maxHeight) {
          maxHeight = h;
        }
      }
    }
    // 清零区域按段对齐，向上取整到段边界；再往上的段整体是满天光
    const zeroTop = maxHeight === 0 ? 0 : ((((maxHeight - 1) >> SECTION_SHIFT) + 1) << SECTION_SHIFT);
    this.resetChunkLight(chunk, maxHeight);
    // 直射天光（地表以上）+ 侧向种子（相邻列更高的部分）
    this.skyAdds.clear();
    this.blockAdds.clear();
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const x = x0 + lx;
        const z = z0 + lz;
        const h = chunk.heightMap[lz * CHUNK_SIZE + lx];
        // 只需处理到清零区域的顶部：更高的段整体是满天光，已由 resetChunkLight 保证
        for (let y = h; y < zeroTop; y++) {
          const section = chunk.sectionAt(y);
          if (section) {
            section.skyLight[sectionIndex(lx, y, lz)] = MAX_LIGHT;
          }
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
    this.seedShell(chunk, Channel.SKY);
    this.propagate(Channel.SKY, this.skyAdds);
    // 方块光源（只扫已分配的段）
    for (let sy = 0; sy < SECTION_COUNT; sy++) {
      const section = chunk.sections[sy];
      if (!section) {
        continue;
      }
      const baseY = sy * SECTION_HEIGHT;
      for (let idx = 0; idx < SECTION_VOLUME; idx++) {
        const light = getBlock(section.blocks[idx]).light;
        if (light > 0) {
          section.blockLight[idx] = light;
          const lx = idx % CHUNK_SIZE;
          const lz = ((idx / CHUNK_SIZE) | 0) % CHUNK_SIZE;
          const y = baseY + ((idx / (CHUNK_SIZE * CHUNK_SIZE)) | 0);
          this.blockAdds.push(x0 + lx, y, z0 + lz, light);
        }
      }
    }
    this.seedShell(chunk, Channel.BLOCK);
    this.propagate(Channel.BLOCK, this.blockAdds);
    this.resetTouched();
  }

  /**
   * 把 chunk 的光照恢复到"未点亮"初值：地表以下（maxHeight 以下）的段全部清零并确保已分配，
   * 更高的段保持"未分配 = 满天光"或直接填满天光，从而完全跳过高空的空段。
   */
  private resetChunkLight(chunk: Chunk, maxHeight: number): void {
    for (let sy = 0; sy < SECTION_COUNT; sy++) {
      const belowSurface = sy * SECTION_HEIGHT < maxHeight;
      let section = chunk.sections[sy];
      if (!section) {
        if (!belowSurface) {
          continue;
        }
        section = chunk.ensureSectionAt(sy * SECTION_HEIGHT);
      }
      section.blockLight.fill(0);
      section.skyLight.fill(belowSurface ? 0 : DEFAULT_SKY_LIGHT);
    }
  }

  /** 把 chunk 四周已点亮邻居的边界列中有光的格子入队作为源。 */
  private seedShell(chunk: Chunk, channel: Channel): void {
    const x0 = chunk.originX;
    const z0 = chunk.originZ;
    const x1 = x0 + CHUNK_SIZE - 1;
    const z1 = z0 + CHUNK_SIZE - 1;
    for (let i = 0; i < CHUNK_SIZE; i++) {
      this.seedColumn(x0 - 1, z0 + i, x0, z0 + i, channel);
      this.seedColumn(x1 + 1, z0 + i, x1, z0 + i, channel);
      this.seedColumn(x0 + i, z0 - 1, x0 + i, z0, channel);
      this.seedColumn(x0 + i, z1 + 1, x0 + i, z1, channel);
    }
  }

  /**
   * 把邻居列 (x,z) 中有光的格子作为源入队。
   * 天光在两列的地表之上都是满值、不会产生梯度，因此只需扫到两列地表中较高者。
   */
  private seedColumn(x: number, z: number, innerX: number, innerZ: number, channel: Channel): void {
    const chunk = this.world.getChunkAt(x, z);
    if (!chunk || !chunk.isLit) {
      return;
    }
    const lx = x - chunk.originX;
    const lz = z - chunk.originZ;
    const queue = channel === Channel.SKY ? this.skyAdds : this.blockAdds;
    const top =
      channel === Channel.SKY
        ? Math.min(WORLD_SIZE_Y, Math.max(this.world.getHeight(x, z), this.world.getHeight(innerX, innerZ)) + 1)
        : chunk.filledMaxY;
    for (let y = 0; y < top; y++) {
      const section = chunk.sectionAt(y);
      const level = section ? channelArray(section, channel)[sectionIndex(lx, y, lz)] : channelDefault(channel);
      if (level > 1) {
        queue.push(x, y, z, level);
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
      this.seedRemoval(Channel.SKY, x, yy, z);
    }
    this.seedRemoval(Channel.SKY, x, y, z);
    this.propagateRemoval(Channel.SKY);
    this.seedRemoval(Channel.BLOCK, x, y, z);
    this.propagateRemoval(Channel.BLOCK);
    // 补光：新直射的列段
    for (let yy = newHeight; yy < oldHeight; yy++) {
      this.setLevel(Channel.SKY, x, yy, z, MAX_LIGHT);
      this.skyAdds.push(x, yy, z, MAX_LIGHT);
    }
    const def = getBlock(w.getBlock(x, y, z));
    if (def.light > 0) {
      this.setLevel(Channel.BLOCK, x, y, z, def.light);
      this.blockAdds.push(x, y, z, def.light);
    }
    // 该格若可透光，让邻居的光重新流入（含衰减规则变化，如水）
    if (!def.opaque) {
      for (const [dx, dy, dz] of DIRS) {
        this.pushIfLit(Channel.SKY, x + dx, y + dy, z + dz);
        this.pushIfLit(Channel.BLOCK, x + dx, y + dy, z + dz);
      }
    }
    this.propagate(Channel.SKY, this.skyAdds);
    this.propagate(Channel.BLOCK, this.blockAdds);
    this.markTouched();
  }

  /** 读取定位缓存处的光照（段未分配时取默认值）。 */
  private readLevel(channel: Channel): number {
    return this.cacheSection
      ? channelArray(this.cacheSection, channel)[this.cacheIndex]
      : channelDefault(channel);
  }

  /** 写入定位缓存处的光照；写默认值到未分配段是空操作。 */
  private writeLevel(channel: Channel, level: number): void {
    let section = this.cacheSection;
    if (!section) {
      if (level === channelDefault(channel)) {
        return;
      }
      section = this.cacheChunk!.ensureSectionAt(this.cacheY);
      this.cacheSection = section;
    }
    channelArray(section, channel)[this.cacheIndex] = level;
  }

  /** 邻居格若有光则作为该通道的补光源入队。 */
  private pushIfLit(channel: Channel, x: number, y: number, z: number): void {
    if (!this.locate(x, y, z)) {
      return;
    }
    const level = this.readLevel(channel);
    if (level > 1) {
      (channel === Channel.SKY ? this.skyAdds : this.blockAdds).push(x, y, z, level);
    }
  }

  /** 撤光种子：记录旧值、清零并入撤光队列。 */
  private seedRemoval(channel: Channel, x: number, y: number, z: number): void {
    if (!this.locate(x, y, z)) {
      return;
    }
    const level = this.readLevel(channel);
    if (level === 0) {
      return;
    }
    this.writeLevel(channel, 0);
    this.touch(x, z);
    this.removeQueue.push(x, y, z, level);
  }

  /** 撤光 BFS：比源弱的邻居一并撤掉，不弱于源的邻居作为补光源。 */
  private propagateRemoval(channel: Channel): void {
    const adds = channel === Channel.SKY ? this.skyAdds : this.blockAdds;
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
        const nl = this.readLevel(channel);
        if (nl === 0) {
          continue;
        }
        if (nl < level) {
          this.writeLevel(channel, 0);
          this.touch(nx, nz);
          this.removeQueue.push(nx, ny, nz, nl);
        } else {
          adds.push(nx, ny, nz, nl);
        }
      }
    }
  }

  /** 补光 BFS。 */
  private propagate(channel: Channel, queue: LightQueue): void {
    while (!queue.isEmpty) {
      queue.pop(this.popped);
      const [x, y, z] = this.popped;
      if (!this.locate(x, y, z)) {
        continue;
      }
      const level = this.readLevel(channel);
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
        const section = this.cacheSection;
        const def = getBlock(section ? section.blocks[this.cacheIndex] : BlockId.AIR);
        if (def.opaque) {
          continue;
        }
        const next = level - 1 - (def.isLiquid ? WATER_ATTENUATION : 0);
        if (next > this.readLevel(channel)) {
          this.writeLevel(channel, next);
          this.touch(nx, nz);
          queue.push(nx, ny, nz, next);
        }
      }
    }
  }

  private setLevel(channel: Channel, x: number, y: number, z: number, level: number): void {
    if (this.locate(x, y, z)) {
      this.writeLevel(channel, level);
      this.touch(x, z);
    }
  }

  /** 定位到已点亮 chunk 的格子；结果放在 cacheChunk / cacheSection / cacheIndex。 */
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
    this.cacheY = y;
    this.cacheSection = chunk.sectionAt(y);
    this.cacheIndex = sectionIndex(x - chunk.originX, y, z - chunk.originZ);
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
