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
