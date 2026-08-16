/**
 * 方块实体：附着在某个方块坐标上的额外状态（熔炉的烧炼进度、箱子里的物品等）。
 * 统一存放并随存档序列化，方块被破坏时由 Game 负责取走内容并删除。
 */

import type { FurnaceState } from '../items/Furnace';
import type { ItemStack } from '../items/ItemStack';
import type { MobType } from '../entities/MobDefs';

/** 方块实体类型。 */
export const BlockEntityType = {
  FURNACE: 'furnace',
  CHEST: 'chest',
  SPAWNER: 'spawner',
} as const;
export type BlockEntityType = (typeof BlockEntityType)[keyof typeof BlockEntityType];

/** 熔炉。 */
export interface FurnaceBlockEntity {
  type: typeof BlockEntityType.FURNACE;
  state: FurnaceState;
}

/** 箱子。 */
export interface ChestBlockEntity {
  type: typeof BlockEntityType.CHEST;
  items: (ItemStack | null)[];
}

/** 刷怪笼。 */
export interface SpawnerBlockEntity {
  type: typeof BlockEntityType.SPAWNER;
  /** 自身坐标：每 tick 都要算与玩家的距离，不从字符串键反解析。 */
  x: number;
  y: number;
  z: number;
  /** 生成的生物类型。 */
  mob: MobType;
  /** 距离下次生成还有多少 tick。 */
  delay: number;
}

export type BlockEntity = FurnaceBlockEntity | ChestBlockEntity | SpawnerBlockEntity;

/** 存档中的一条方块实体记录。 */
export interface BlockEntitySaveData {
  x: number;
  y: number;
  z: number;
  data: BlockEntity;
}

/** 坐标 → 键（与旧版熔炉存档的键格式一致）。 */
export function blockEntityKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

/** 按坐标存放方块实体。 */
export class BlockEntityStore {
  private readonly byKey = new Map<string, BlockEntity>();

  get(x: number, y: number, z: number): BlockEntity | null {
    return this.byKey.get(blockEntityKey(x, y, z)) ?? null;
  }

  set(x: number, y: number, z: number, entity: BlockEntity): void {
    this.byKey.set(blockEntityKey(x, y, z), entity);
  }

  /** 取出已有实体，没有则用 create 新建并放入。 */
  getOrCreate(x: number, y: number, z: number, create: () => BlockEntity): BlockEntity {
    const key = blockEntityKey(x, y, z);
    const existing = this.byKey.get(key);
    if (existing) {
      return existing;
    }
    const created = create();
    this.byKey.set(key, created);
    return created;
  }

  /** 删除并返回被删除的实体。 */
  remove(x: number, y: number, z: number): BlockEntity | null {
    const key = blockEntityKey(x, y, z);
    const existing = this.byKey.get(key) ?? null;
    this.byKey.delete(key);
    return existing;
  }

  /** 遍历全部实体。 */
  values(): IterableIterator<BlockEntity> {
    return this.byKey.values();
  }

  serialize(): BlockEntitySaveData[] {
    const out: BlockEntitySaveData[] = [];
    for (const [key, data] of this.byKey) {
      const [x, y, z] = key.split(',').map(Number);
      out.push({ x, y, z, data });
    }
    return out;
  }

  load(entries: readonly BlockEntitySaveData[]): void {
    for (const entry of entries) {
      this.byKey.set(blockEntityKey(entry.x, entry.y, entry.z), entry.data);
    }
  }

  clear(): void {
    this.byKey.clear();
  }
}
