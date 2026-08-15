/** 流体常量（参考 1.8 水的行为）。 */
/** 水每隔多少 tick 更新一次。 */
export const WATER_TICK_INTERVAL = 5;
/** 源方块的 meta。 */
export const WATER_SOURCE_META = 0;
/** 流动水的最大水位（1..7，数值越大越浅）。 */
export const WATER_MAX_LEVEL = 7;
/** 下落水的 meta。 */
export const WATER_FALLING_META = 8;
/** 横向扩散时寻找“落差”的搜索距离。 */
export const WATER_FLOW_SEARCH_RANGE = 4;
/** 无限水：流动水两侧至少这么多源方块时升级为源。 */
export const WATER_INFINITE_SOURCE_COUNT = 2;
/** 水流对实体的推力（格/秒²）。 */
export const WATER_PUSH_ACCEL = 5;
/** 无法到达落差时的代价。 */
export const WATER_FLOW_BLOCKED_COST = 1000;
