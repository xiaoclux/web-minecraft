import { BlockId } from '../blocks/BlockRegistry';
import type { MobType } from '../entities/MobDefs';
import type { LootTable } from './structures/LootTables';
import {
  CHUNK_AREA,
  CHUNK_KEY_LIMIT,
  CHUNK_SIZE,
  MAX_LIGHT,
  SECTION_COUNT,
  SECTION_HEIGHT,
  SECTION_MASK,
  SECTION_SHIFT,
  SECTION_VOLUME,
  WORLD_SIZE_Y,
} from '../constants/world';

/** 未分配段的默认天空光：段内全是空气且在地表之上，天光满值。 */
export const DEFAULT_SKY_LIGHT = MAX_LIGHT;

/** chunk 坐标 → Map 键（支持负坐标）。 */
export function chunkKey(cx: number, cz: number): number {
  return (cx + CHUNK_KEY_LIMIT) * (CHUNK_KEY_LIMIT * 2) + (cz + CHUNK_KEY_LIMIT);
}

/** 方块坐标 → chunk 坐标。 */
export function toChunkCoord(v: number): number {
  return Math.floor(v / CHUNK_SIZE);
}

/** chunk 内跨全高的线性索引（y 主序，用于存档等整列遍历）。 */
export function localIndex(lx: number, y: number, lz: number): number {
  return (y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
}

/** 段内索引。调用方保证 0≤lx,lz<16。 */
export function sectionIndex(lx: number, y: number, lz: number): number {
  return (((y & SECTION_MASK) * CHUNK_SIZE) + lz) * CHUNK_SIZE + lx;
}

/**
 * chunk 的一段（16×16×16）：方块 id、附加数据与两个光照通道。
 * 只有真正写入过非默认值的段才会被分配，空气段不占内存。
 */
export class ChunkSection {
  readonly blocks = new Uint8Array(SECTION_VOLUME);
  /** 方块附加数据（如水位、朝向）。 */
  readonly meta = new Uint8Array(SECTION_VOLUME);
  readonly skyLight = new Uint8Array(SECTION_VOLUME);
  readonly blockLight = new Uint8Array(SECTION_VOLUME);

  /**
   * @param hasSkyLight 该维度有没有天空光。有则初值取满（与"未分配段"一致，
   *   段被分配的瞬间不改变任何可见状态）；没有则保持全 0。
   */
  constructor(
    readonly sy: number,
    hasSkyLight = true,
  ) {
    if (hasSkyLight) {
      this.skyLight.fill(DEFAULT_SKY_LIGHT);
    }
  }

  /** 段底部的世界 y。 */
  get baseY(): number {
    return this.sy * SECTION_HEIGHT;
  }
}

/** 世界生成留下的方块实体标记。 */
export interface PendingBlockEntity {
  x: number;
  y: number;
  z: number;
  /** 战利品箱用：战利品表 id。 */
  loot?: LootTable;
  /** 刷怪笼用：生物类型。 */
  spawns?: MobType;
}

/** 一个 16×WORLD_SIZE_Y×16 的世界分块：按段存方块与光照，另有整块共用的高度图。 */
export class Chunk {
  readonly key: number;
  /** 按段号索引；null 表示该段全是空气、天光满值。 */
  readonly sections: (ChunkSection | null)[] = new Array(SECTION_COUNT).fill(null);
  /** 每列最高不透光方块之上的 y（0~WORLD_SIZE_Y，需要 16 位）。 */
  readonly heightMap = new Uint16Array(CHUNK_AREA);
  /**
   * 世界生成时留下的方块实体标记（战利品箱、刷怪笼）：
   * chunk 加入世界时由 Game 补上对应的方块实体，已经有实体的位置不会被覆盖。
   */
  readonly pendingBlockEntities: PendingBlockEntity[] = [];
  /** 玩家 / 实体改动过 → 必须存档、不可卸载。 */
  isModified = false;
  /** 上次序列化之后又有改动（存档时据此决定能不能复用缓存的序列化结果）。 */
  isDirtySinceSave = false;
  /** 上一次序列化的结果缓存（由 chunkSerializer 维护，泛型化以免 Chunk 依赖存档模块）。 */
  saveCache: unknown = null;
  /** 光照是否已计算。 */
  isLit = false;

  /** 记录一次玩家 / 实体改动。 */
  markModified(): void {
    this.isModified = true;
    this.isDirtySinceSave = true;
  }
  /** 已分配段的段号范围；无任何分配时 lowestSection > highestSection。 */
  private lowestSection = SECTION_COUNT;
  private highestSection = -1;

  constructor(
    readonly cx: number,
    readonly cz: number,
    /** 所属维度有没有天空光（决定新分配段的天空光初值）。 */
    readonly hasSkyLight = true,
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

  /** 已分配段中最低的方块 y（没有已分配段时返回 WORLD_SIZE_Y）。 */
  get filledMinY(): number {
    return this.highestSection < 0 ? WORLD_SIZE_Y : this.lowestSection * SECTION_HEIGHT;
  }

  /** 已分配段中最高的方块 y + 1（没有已分配段时返回 0）。 */
  get filledMaxY(): number {
    return this.highestSection < 0 ? 0 : (this.highestSection + 1) * SECTION_HEIGHT;
  }

  /** 取 y 所在的段；未分配返回 null。调用方保证 0≤y<WORLD_SIZE_Y。 */
  sectionAt(y: number): ChunkSection | null {
    return this.sections[y >> SECTION_SHIFT];
  }

  /** 取 y 所在的段，未分配则分配。调用方保证 0≤y<WORLD_SIZE_Y。 */
  ensureSectionAt(y: number): ChunkSection {
    const sy = y >> SECTION_SHIFT;
    const existing = this.sections[sy];
    if (existing) {
      return existing;
    }
    const section = new ChunkSection(sy, this.hasSkyLight);
    this.sections[sy] = section;
    if (sy < this.lowestSection) {
      this.lowestSection = sy;
    }
    if (sy > this.highestSection) {
      this.highestSection = sy;
    }
    return section;
  }

  /** 读取局部方块。 */
  getLocal(lx: number, y: number, lz: number): number {
    const section = this.sections[y >> SECTION_SHIFT];
    return section ? section.blocks[sectionIndex(lx, y, lz)] : BlockId.AIR;
  }

  /** 读取局部附加数据。 */
  getLocalMeta(lx: number, y: number, lz: number): number {
    const section = this.sections[y >> SECTION_SHIFT];
    return section ? section.meta[sectionIndex(lx, y, lz)] : 0;
  }

  /** 写入局部方块（不做任何标记）。写空气到未分配段是空操作。 */
  setLocal(lx: number, y: number, lz: number, id: number, meta = 0): void {
    let section = this.sections[y >> SECTION_SHIFT];
    if (!section) {
      if (id === BlockId.AIR && meta === 0) {
        return;
      }
      section = this.ensureSectionAt(y);
    }
    const idx = sectionIndex(lx, y, lz);
    section.blocks[idx] = id;
    section.meta[idx] = meta;
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

  /** 把全部方块 id 展开成跨全高的线性数组（存档 / 测试用，长度按已分配段截断）。 */
  toFlatBlocks(): Uint8Array {
    const height = this.filledMaxY;
    const out = new Uint8Array(CHUNK_AREA * height);
    for (let y = 0; y < height; y++) {
      const section = this.sections[y >> SECTION_SHIFT];
      if (!section) {
        continue;
      }
      const base = sectionIndex(0, y, 0);
      out.set(section.blocks.subarray(base, base + CHUNK_AREA), localIndex(0, y, 0));
    }
    return out;
  }

  /** 同 toFlatBlocks，但取附加数据。 */
  toFlatMeta(): Uint8Array {
    const height = this.filledMaxY;
    const out = new Uint8Array(CHUNK_AREA * height);
    for (let y = 0; y < height; y++) {
      const section = this.sections[y >> SECTION_SHIFT];
      if (!section) {
        continue;
      }
      const base = sectionIndex(0, y, 0);
      out.set(section.meta.subarray(base, base + CHUNK_AREA), localIndex(0, y, 0));
    }
    return out;
  }

  /** 从跨全高的线性数组还原方块与附加数据（长度可短于世界高度，其余保持空气）。 */
  loadFlat(blocks: Uint8Array, meta: Uint8Array): void {
    const height = Math.min(WORLD_SIZE_Y, Math.floor(blocks.length / CHUNK_AREA));
    for (let y = 0; y < height; y++) {
      const src = localIndex(0, y, 0);
      let empty = true;
      for (let i = 0; i < CHUNK_AREA; i++) {
        if (blocks[src + i] !== BlockId.AIR || meta[src + i] !== 0) {
          empty = false;
          break;
        }
      }
      if (empty) {
        continue;
      }
      const section = this.ensureSectionAt(y);
      const dst = sectionIndex(0, y, 0);
      section.blocks.set(blocks.subarray(src, src + CHUNK_AREA), dst);
      section.meta.set(meta.subarray(src, src + CHUNK_AREA), dst);
    }
  }
}
