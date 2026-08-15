/** 存档相关常量。 */
export const SAVE_INDEX_KEY = 'mc:worlds';
export const SAVE_WORLD_KEY_PREFIX = 'mc:world:';
/** 当前存档格式：2 = 分块无限世界。 */
export const SAVE_FORMAT_VERSION = 2;
/** 旧格式：1 = 256×256 整卷 RLE，读档时自动迁移。 */
export const LEGACY_SAVE_FORMAT_VERSION = 1;
export const LEGACY_WORLD_SIZE_X = 256;
export const LEGACY_WORLD_SIZE_Z = 256;
export const AUTOSAVE_INTERVAL_TICKS = 6000;
export const MAX_WORLD_NAME_LENGTH = 32;
export const MAX_SEED_LENGTH = 32;
