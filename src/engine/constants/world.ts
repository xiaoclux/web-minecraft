/** 世界尺寸与分块常量（方块单位）。 */
export const WORLD_SIZE_X = 256;
export const WORLD_SIZE_Y = 64;
export const WORLD_SIZE_Z = 256;
export const CHUNK_SIZE = 16;
export const CHUNKS_X = WORLD_SIZE_X / CHUNK_SIZE;
export const CHUNKS_Z = WORLD_SIZE_Z / CHUNK_SIZE;
export const SEA_LEVEL = 32;
export const BEDROCK_LEVEL = 0;
/** 默认渲染距离（chunk 数）。 */
export const DEFAULT_RENDER_DISTANCE = 8;
/** 光照最大等级（0~15）。 */
export const MAX_LIGHT = 15;
/** 一昼夜的 tick 数（1.8.9 为 24000 tick = 20 分钟）。 */
export const DAY_LENGTH_TICKS = 24000;
/** 夜晚开始 / 结束 tick。 */
export const NIGHT_START_TICK = 13000;
export const NIGHT_END_TICK = 23000;
