import { del, get, set } from 'idb-keyval';
import type { Difficulty, GameMode } from '../constants/game';
import { SAVE_FORMAT_VERSION, SAVE_INDEX_KEY, SAVE_WORLD_KEY_PREFIX } from '../constants/save';
import type { EntitySaveData } from '../entities/Entity';
import type { FurnaceState } from '../items/Furnace';
import type { PlayerSaveData } from '../player/Player';

/** 存档索引条目。 */
export interface WorldMeta {
  id: string;
  name: string;
  seed: string;
  mode: GameMode;
  difficulty: Difficulty;
  createdAt: number;
  lastPlayed: number;
}

/** 完整存档。 */
export interface WorldSave {
  version: number;
  meta: WorldMeta;
  tick: number;
  /** RLE 压缩的方块数组。 */
  blocks: Uint32Array;
  blockCount: number;
  player: PlayerSaveData;
  entities: EntitySaveData[];
  nextEntityId: number;
  /** 昼夜时间 tick。 */
  timeTick?: number;
  /** 熔炉状态，键为 "x,y,z"。 */
  furnaces?: Record<string, FurnaceState>;
}

/** 基于 IndexedDB 的存档管理。 */
export class SaveManager {
  /** 列出全部存档（按最近游玩排序）。 */
  async list(): Promise<WorldMeta[]> {
    const index = (await get<WorldMeta[]>(SAVE_INDEX_KEY)) ?? [];
    return [...index].sort((a, b) => b.lastPlayed - a.lastPlayed);
  }

  /** 保存世界并更新索引。 */
  async save(data: WorldSave): Promise<void> {
    await set(SAVE_WORLD_KEY_PREFIX + data.meta.id, data);
    const index = (await get<WorldMeta[]>(SAVE_INDEX_KEY)) ?? [];
    const others = index.filter((m) => m.id !== data.meta.id);
    await set(SAVE_INDEX_KEY, [...others, data.meta]);
  }

  /** 读取世界。 */
  async load(id: string): Promise<WorldSave | null> {
    const data = await get<WorldSave>(SAVE_WORLD_KEY_PREFIX + id);
    if (!data) {
      return null;
    }
    if (data.version !== SAVE_FORMAT_VERSION) {
      throw new Error(`存档版本不兼容：${data.version}（当前 ${SAVE_FORMAT_VERSION}）`);
    }
    return data;
  }

  /** 删除世界。 */
  async remove(id: string): Promise<void> {
    await del(SAVE_WORLD_KEY_PREFIX + id);
    const index = (await get<WorldMeta[]>(SAVE_INDEX_KEY)) ?? [];
    await set(
      SAVE_INDEX_KEY,
      index.filter((m) => m.id !== id),
    );
  }
}

/** 生成存档 id。 */
export function createWorldId(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}
