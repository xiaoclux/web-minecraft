/** 红石相关常量。 */

/** 信号最大强度（红石粉从电源出发每格衰减 1）。 */
export const REDSTONE_MAX_POWER = 15;
/** 方块变更后重算红石的邻域半径。 */
export const REDSTONE_UPDATE_RADIUS = 1;
/** 拉杆 / 按钮 / 压力板 meta 里"通电"的位。 */
export const REDSTONE_POWERED_BIT = 8;
/** 按钮按下后保持通电的 tick 数（1.8.9 石按钮 20 tick）。 */
export const BUTTON_PRESS_TICKS = 20;
/** 压力板在没人踩之后还保持通电的 tick 数。 */
export const PRESSURE_PLATE_HOLD_TICKS = 20;
/** 压力板的触发范围（以方块中心为准的水平半径）。 */
export const PRESSURE_PLATE_RANGE = 0.7;
