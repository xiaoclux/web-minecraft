/** 世界高度与分块常量（方块单位）。水平方向无限，按 16×64×16 的 chunk 流式生成。 */
export const WORLD_SIZE_Y = 64;
export const CHUNK_SIZE = 16;
export const CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;
export const CHUNK_VOLUME = CHUNK_AREA * WORLD_SIZE_Y;
/** chunk 坐标的绝对值上限（键空间 (2·LIMIT)² 必须落在安全整数内）。 */
export const CHUNK_KEY_LIMIT = 32768;
export const SEA_LEVEL = 32;
/** 默认渲染距离（chunk 数）。 */
export const DEFAULT_RENDER_DISTANCE = 8;
/** 加载半径 = 渲染距离 + 该值；卸载半径 = 渲染距离 + 该值。 */
export const LOAD_DISTANCE_EXTRA = 1;
export const UNLOAD_DISTANCE_EXTRA = 3;
/** 每帧最多生成的 chunk 数。 */
export const CHUNK_GENERATE_BUDGET_PER_FRAME = 2;
/** 新建 / 读档时同步预载出生点周围的 chunk 半径。 */
export const SPAWN_PRELOAD_RADIUS = 2;
/** 光照最大等级（0~15）。 */
export const MAX_LIGHT = 15;
/** 一昼夜的 tick 数（1.8.9 为 24000 tick = 20 分钟）。 */
export const DAY_LENGTH_TICKS = 24000;
/** 夜晚开始 / 结束 tick。 */
export const NIGHT_START_TICK = 13000;
export const NIGHT_END_TICK = 23000;

/** 世界类型。 */
export const WorldType = {
  DEFAULT: 'default',
  FLAT: 'flat',
} as const;
export type WorldType = (typeof WorldType)[keyof typeof WorldType];
export const WORLD_TYPE_LABELS: Record<WorldType, string> = {
  default: '默认（无限噪声地形）',
  flat: '超平坦',
};
