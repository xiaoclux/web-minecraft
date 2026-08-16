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
/** 红石火把切换状态的延迟（1.8.9 是 2 tick）。 */
export const TORCH_DELAY_TICKS = 2;
/** 中继器的四挡延迟（tick），meta 高位存挡位。 */
export const REPEATER_DELAYS = [2, 4, 6, 8] as const;
/** 中继器 meta：低 2 位朝向，高 2 位延迟挡位。 */
export const REPEATER_FACING_MASK = 3;
export const REPEATER_DELAY_SHIFT = 2;
export const REPEATER_DELAY_MASK = 3;
/** 活塞一次最多推动多少方块（1.8.9 是 12）。 */
export const PISTON_MAX_PUSH = 12;
/** 活塞 meta 的朝向位（0~3 水平，4 上，5 下）。 */
export const PISTON_FACING_MASK = 3;
/** 活塞伸缩的延迟（tick）。 */
export const PISTON_DELAY_TICKS = 2;
/** 漏斗多久搬一次物品（1.8.9 是 8 tick 搬一个）。 */
export const HOPPER_TRANSFER_INTERVAL_TICKS = 8;
/** 漏斗的槽位数。 */
export const HOPPER_SLOT_COUNT = 5;
/** 漏斗吸取掉落物的水平半径。 */
export const HOPPER_PICKUP_RANGE = 0.8;
/** 发射器 / 投掷器的槽位数。 */
export const DISPENSER_SLOT_COUNT = 9;
/** 发射器扔东西的速度（格/秒）。 */
export const DISPENSER_LAUNCH_SPEED = 12;
/** 铁轨形状：meta 低位存走向。 */
export const RailShape = {
  /** 沿 X 轴（东西向）。 */
  EAST_WEST: 0,
  /** 沿 Z 轴（南北向）。 */
  NORTH_SOUTH: 1,
} as const;
export type RailShape = (typeof RailShape)[keyof typeof RailShape];
export const RAIL_SHAPE_MASK = 1;
/** 动力铁轨最多能沿轨连锁传导多少格（1.8.9 是 8）。 */
export const POWERED_RAIL_CHAIN = 8;
/** 矿车：最高速度、阻力、动力轨加速度与断电动力轨的刹车系数。 */
export const MINECART_MAX_SPEED = 8;
export const MINECART_DRAG = 0.4;
export const MINECART_POWERED_ACCEL = 6;
export const MINECART_BRAKE_FACTOR = 0.5;
/** 压力板的触发范围（以方块中心为准的水平半径）。 */
export const PRESSURE_PLATE_RANGE = 0.7;

/** 音符盒的音高数（1.8.9 为两个八度共 25 个音）。 */
export const NOTE_COUNT = 25;
/** 音符盒 meta 里存音高的低位掩码。 */
export const NOTE_MASK = 31;
/** 音符盒 meta 里"上一次是否通电"的位，用来只在上升沿发声。 */
export const NOTE_POWERED_BIT = 32;
/** 音符盒的中间音（第 12 号）对应音效的原始音高，两侧按十二平均律换算。 */
export const NOTE_CENTER = 12;
/** 十二平均律的一个八度有几个半音。 */
export const SEMITONES_PER_OCTAVE = 12;
