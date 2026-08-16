import type { AchievementSaveData } from '../systems/Achievements';
import { del, get, set } from 'idb-keyval';
import type { Difficulty, GameMode } from '../constants/game';
import {
  LEGACY_SAVE_FORMAT_VERSION,
  SAVE_FORMAT_VERSION,
  SAVE_INDEX_KEY,
  SAVE_WORLD_KEY_PREFIX,
} from '../constants/save';
import type { WorldType } from '../constants/world';
import type { EntitySaveData } from '../entities/Entity';
import type { FurnaceState } from '../items/Furnace';
import type { PlayerSaveData } from '../player/Player';
import type { WeatherSaveData } from '../systems/WeatherSystem';
import type { BlockEntitySaveData } from '../world/BlockEntityStore';
import { migrateLegacySave, type LegacyWorldSave } from './migrate';

/** 存档索引条目。 */
export interface WorldMeta {
  id: string;
  name: string;
  seed: string;
  mode: GameMode;
  difficulty: Difficulty;
  createdAt: number;
  lastPlayed: number;
  /** 世界类型；旧存档缺省为 default。 */
  worldType?: WorldType;
  /** 是否生成村庄等结构；缺省为 true。 */
  generateStructures?: boolean;
}

/** 单个 chunk 的存档数据（只保存玩家改动过的 chunk）。 */
export interface ChunkSaveData {
  cx: number;
  cz: number;
  /** RLE 压缩的方块 id。 */
  blocks: Uint32Array;
  /** RLE 压缩的方块附加数据。 */
  meta: Uint32Array;
}

/** 完整存档（版本 2：分块）。 */
export interface WorldSave {
  version: number;
  meta: WorldMeta;
  tick: number;
  chunks: ChunkSaveData[];
  player: PlayerSaveData;
  entities: EntitySaveData[];
  nextEntityId: number;
  /** 昼夜时间 tick。 */
  timeTick?: number;
  /** 熔炉状态，键为 "x,y,z"。 */
  /** 旧存档字段：只有熔炉状态，读档时迁移到 blockEntities。 */
  furnaces?: Record<string, FurnaceState>;
  blockEntities?: BlockEntitySaveData[];
  weather?: WeatherSaveData;
  achievements?: AchievementSaveData;
  /** 主世界以外的维度数据（旧存档没有这一项）。 */
  dimensions?: DimensionSaveData[];
  /** 玩家所在维度（旧存档没有，按主世界处理）。 */
  playerDimension?: string;
}

/** 一个非主世界维度的存档数据。 */
export interface DimensionSaveData {
  id: string;
  chunks: ChunkSaveData[];
  entities: EntitySaveData[];
  blockEntities: BlockEntitySaveData[];
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
    if (data.version === LEGACY_SAVE_FORMAT_VERSION) {
      return migrateLegacySave(data as unknown as LegacyWorldSave);
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
