/** 流体常量（参考 1.8 的水与岩浆）。 */
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

/** 岩浆：更新更慢、只流 3 格、没有无限源（1.8.9 主世界的行为）。 */
export const LAVA_TICK_INTERVAL = 30;
export const LAVA_MAX_LEVEL = 3;
export const LAVA_FLOW_SEARCH_RANGE = 2;
/** 泡在岩浆里每隔多少 tick 掉多少血。 */
export const LAVA_DAMAGE_INTERVAL_TICKS = 10;
export const LAVA_DAMAGE = 4;
/** 离开岩浆后还会烧多久。 */
export const LAVA_BURN_TICKS = 300;

/** 一种流体的行为参数。 */
export interface FluidSpec {
  /** 对应的方块 id。 */
  block: number;
  /** 横向最多流几格（数值即 meta 的最大水位）。 */
  maxLevel: number;
  /** 每隔多少 tick 更新一次。 */
  tickInterval: number;
  /** 是否支持"两侧是源就变成源"的无限源规则。 */
  infiniteSource: boolean;
  /** 横向找落差时的搜索距离。 */
  flowSearchRange: number;
}
