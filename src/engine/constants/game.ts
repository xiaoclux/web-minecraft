/** 游戏模式（参考 1.8.9：生存/创造/冒险 + 极限）。 */
export const GameMode = {
  SURVIVAL: 'survival',
  CREATIVE: 'creative',
  ADVENTURE: 'adventure',
  HARDCORE: 'hardcore',
} as const;
export type GameMode = (typeof GameMode)[keyof typeof GameMode];

export const GAME_MODE_LABELS: Record<GameMode, string> = {
  survival: '生存模式',
  creative: '创造模式',
  adventure: '冒险模式',
  hardcore: '极限模式',
};

/** 难度。 */
export const Difficulty = {
  PEACEFUL: 0,
  EASY: 1,
  NORMAL: 2,
  HARD: 3,
} as const;
export type Difficulty = (typeof Difficulty)[keyof typeof Difficulty];

/** 逻辑 tick 频率。 */
export const TICKS_PER_SECOND = 20;
export const TICK_MS = 1000 / TICKS_PER_SECOND;
/** 单帧最多补偿的 tick 数，避免切后台后雪崩。 */
export const MAX_TICKS_PER_FRAME = 5;

/** 玩家属性。 */
export const PLAYER_MAX_HEALTH = 20;
export const PLAYER_MAX_FOOD = 20;
export const PLAYER_WIDTH = 0.6;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_EYE_HEIGHT = 1.62;
export const PLAYER_SNEAK_EYE_HEIGHT = 1.54;
export const PLAYER_REACH = 5;
export const CREATIVE_REACH = 6;
export const PLAYER_WALK_SPEED = 4.317;
export const PLAYER_SPRINT_MULTIPLIER = 1.3;
export const PLAYER_SNEAK_MULTIPLIER = 0.3;
export const PLAYER_FLY_SPEED = 10.9;
export const PLAYER_JUMP_VELOCITY = 8.4;
export const PLAYER_SWIM_SPEED = 2.2;
export const GRAVITY = 32;
export const WATER_GRAVITY = 4;
export const TERMINAL_VELOCITY = 78;
export const WATER_TERMINAL_VELOCITY = 3;
/** 水中按住跳跃的上浮加速度与上浮速度上限（格/秒）。 */
export const WATER_SWIM_UP_ACCEL = 24;
export const WATER_SWIM_UP_MAX = 3.5;
/** 水中贴墙攀上岸时的向上速度（格/秒，对应 1.8 的 motionY = 0.3/tick）。 */
export const WATER_CLIMB_VELOCITY = 6;
export const FALL_DAMAGE_THRESHOLD = 3;
export const AIR_TICKS_MAX = 300;
export const DROWN_DAMAGE_INTERVAL_TICKS = 20;
export const DROWN_DAMAGE = 2;
export const HUNGER_TICK_INTERVAL = 80;
export const REGEN_TICK_INTERVAL = 80;
export const STARVE_TICK_INTERVAL = 80;
export const REGEN_FOOD_THRESHOLD = 18;
export const SPRINT_FOOD_THRESHOLD = 6;
export const INVULNERABLE_TICKS = 10;
export const HOTBAR_SIZE = 9;
export const INVENTORY_SIZE = 36;
export const MAX_STACK = 64;
export const ITEM_PICKUP_RANGE = 1.5;
export const ITEM_PICKUP_DELAY_TICKS = 20;
export const ITEM_DESPAWN_TICKS = 6000;
export const RESPAWN_INVULNERABLE_TICKS = 40;
export const DOUBLE_TAP_MS = 300;
export const ATTACK_COOLDOWN_TICKS = 5;
export const KNOCKBACK_STRENGTH = 6;
export const BLOCK_BREAK_TICK_INTERVAL = 1;
export const XP_PER_LEVEL_BASE = 7;
export const CREATIVE_BLOCK_BREAK_DELAY_TICKS = 5;

/** 掉落物物理。 */
export const ITEM_DROP_SIZE = 0.25;
export const ITEM_DROP_SPAWN_SPEED = 3;

/** 各难度下敌对生物伤害倍率。 */
export const DIFFICULTY_DAMAGE_MULTIPLIER: Record<Difficulty, number> = {
  0: 0,
  1: 0.5,
  2: 1,
  3: 1.5,
};

/** 睡觉：附近有敌对生物则无法入睡的检查半径（格）。 */
export const SLEEP_MONSTER_RADIUS = 8;

/** 攀爬（梯子）：上爬速度与下滑速度上限（格/秒，取自 1.8.9 的 0.12 / 0.15 每 tick）。 */
export const LADDER_CLIMB_SPEED = 2.4;
export const LADDER_SLIDE_SPEED = 3;

/** 每点护甲的减伤比例（1.8.9：每点 4%，20 点封顶 80%）。 */
export const ARMOR_DAMAGE_REDUCTION_PER_POINT = 0.04;
export const ARMOR_MAX_POINTS = 20;
/** 受伤时盔甲的耐久消耗：伤害的 1/4，至少 1 点。 */
export const ARMOR_DURABILITY_DAMAGE_DIVISOR = 4;

/** 着火时每隔多少 tick 掉多少血。 */
export const FIRE_DAMAGE_INTERVAL_TICKS = 20;
export const FIRE_DAMAGE = 1;

/** 站进火里会被点燃多久。 */
export const FIRE_TOUCH_BURN_TICKS = 160;
/** 火每隔多少 tick 更新一次（1.8.9 是 30，随机 tick 命中太稀疏）。 */
export const FIRE_TICK_INTERVAL = 30;
/** 火：最大年龄、蔓延概率、烧掉脚下方块的概率。 */
export const FIRE_MAX_AGE = 15;
export const FIRE_SPREAD_CHANCE = 0.2;
export const FIRE_CONSUME_CHANCE = 0.1;
/** 火烧到这个年龄之后才会开始吃掉脚下的方块。 */
export const FIRE_CONSUME_MIN_AGE = 5;
/** 打火石耐久（1.8.9 为 65）。 */
export const FLINT_AND_STEEL_DURABILITY = 65;

/** 经验球：大小、消失时间、吸引与拾取半径、吸引加速度（格/秒²）。 */
export const XP_ORB_SIZE = 0.25;
export const XP_ORB_DESPAWN_TICKS = 6000;
export const XP_ORB_ATTRACT_RANGE = 7;
export const XP_ORB_PICKUP_RANGE = 1;
export const XP_ORB_ATTRACT_ACCEL = 24;
/** 一颗经验球最多装多少经验（超出就拆成多颗）。 */
export const XP_ORB_MAX_AMOUNT = 7;

/** 碰到仙人掌每隔多少 tick 掉多少血。 */
export const CACTUS_DAMAGE_INTERVAL_TICKS = 10;
export const CACTUS_DAMAGE = 1;

/** 告示牌的行数与每行最多几个字符（1.8.9 是 4 行 × 15 字符）。 */
export const SIGN_LINE_COUNT = 4;
export const SIGN_LINE_MAX_CHARS = 15;

/** 钓鱼：抛竿后咬钩的等待时间区间（1.8.9 为 5~30 秒）。 */
export const FISHING_MIN_WAIT_TICKS = 100;
export const FISHING_MAX_WAIT_TICKS = 600;
