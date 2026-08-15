import { CHUNK_AREA, CHUNK_KEY_LIMIT, CHUNK_SIZE, CHUNK_VOLUME, WORLD_SIZE_Y } from '../constants/world';

/** chunk 坐标 → Map 键（支持负坐标）。 */
export function chunkKey(cx: number, cz: number): number {
  return (cx + CHUNK_KEY_LIMIT) * (CHUNK_KEY_LIMIT * 2) + (cz + CHUNK_KEY_LIMIT);
}

/** 方块坐标 → chunk 坐标。 */
export function toChunkCoord(v: number): number {
  return Math.floor(v / CHUNK_SIZE);
}

/** chunk 内局部索引。调用方保证 0≤lx,lz<16、0≤y<64。 */
export function localIndex(lx: number, y: number, lz: number): number {
  return (y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
}

/** 一个 16×64×16 的世界分块：方块 id、附加数据、光照与高度图。 */
export class Chunk {
  readonly key: number;
  readonly blocks = new Uint8Array(CHUNK_VOLUME);
  /** 方块附加数据（如水位）。 */
  readonly meta = new Uint8Array(CHUNK_VOLUME);
  readonly skyLight = new Uint8Array(CHUNK_VOLUME);
  readonly blockLight = new Uint8Array(CHUNK_VOLUME);
  /** 每列最高不透光方块之上的 y。 */
  readonly heightMap = new Uint8Array(CHUNK_AREA);
  /** 玩家 / 实体改动过 → 必须存档、不可卸载。 */
  isModified = false;
  /** 光照是否已计算。 */
  isLit = false;

  constructor(
    readonly cx: number,
    readonly cz: number,
  ) {
    this.key = chunkKey(cx, cz);
  }

  /** chunk 原点（方块坐标）。 */
  get originX(): number {
    return this.cx * CHUNK_SIZE;
  }

  get originZ(): number {
    return this.cz * CHUNK_SIZE;
  }

  /** 读取局部方块。 */
  getLocal(lx: number, y: number, lz: number): number {
    return this.blocks[localIndex(lx, y, lz)];
  }

  /** 写入局部方块（不做任何标记）。 */
  setLocal(lx: number, y: number, lz: number, id: number, meta = 0): void {
    const idx = localIndex(lx, y, lz);
    this.blocks[idx] = id;
    this.meta[idx] = meta;
  }

  /** 用世界坐标写入；落在本 chunk 外或 y 越界则忽略。生成器裁剪用。 */
  setWorld(x: number, y: number, z: number, id: number, meta = 0): void {
    if (this.containsColumn(x, z) && y >= 0 && y < WORLD_SIZE_Y) {
      this.setLocal(x - this.originX, y, z - this.originZ, id, meta);
    }
  }

  /** 用世界坐标读取；落在本 chunk 外或 y 越界返回 null。 */
  getWorld(x: number, y: number, z: number): number | null {
    if (this.containsColumn(x, z) && y >= 0 && y < WORLD_SIZE_Y) {
      return this.getLocal(x - this.originX, y, z - this.originZ);
    }
    return null;
  }

  /** 世界坐标是否落在本 chunk 内（忽略 y）。 */
  containsColumn(x: number, z: number): boolean {
    const lx = x - this.originX;
    const lz = z - this.originZ;
    return lx >= 0 && lz >= 0 && lx < CHUNK_SIZE && lz < CHUNK_SIZE;
  }
}
