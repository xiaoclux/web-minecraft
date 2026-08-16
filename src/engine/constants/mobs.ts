/** 生物系统常量。 */
export const MAX_HOSTILE_MOBS = 30;
export const MAX_PASSIVE_MOBS = 24;
export const HOSTILE_SPAWN_LIGHT_MAX = 7;
export const SPAWN_MIN_DISTANCE = 24;
export const SPAWN_MAX_DISTANCE = 56;
export const DESPAWN_DISTANCE = 96;
export const HOSTILE_SPAWN_ATTEMPTS_PER_TICK = 4;
export const PASSIVE_SPAWN_INTERVAL_TICKS = 400;
export const HOSTILE_SPAWN_INTERVAL_TICKS = 20;
export const MOB_WANDER_INTERVAL_TICKS = 100;
export const MOB_TARGET_RANGE = 16;
export const MOB_ATTACK_RANGE = 1.6;
export const MOB_ATTACK_COOLDOWN_TICKS = 20;
export const MOB_LOSE_TARGET_RANGE = 24;
export const CREEPER_FUSE_TICKS = 30;
export const CREEPER_EXPLOSION_RADIUS = 3;
export const CREEPER_TRIGGER_RANGE = 3;
export const CREEPER_EXPLOSION_MAX_DAMAGE = 24;
export const SKELETON_SHOOT_RANGE = 12;
export const SKELETON_SHOOT_COOLDOWN_TICKS = 40;
export const SKELETON_KEEP_DISTANCE = 6;
export const ARROW_SPEED = 24;
export const ARROW_GRAVITY = 20;
export const ARROW_DAMAGE = 3;
export const ARROW_LIFETIME_TICKS = 200;
export const MOB_BURN_LIGHT_MIN = 12;
export const MOB_BURN_DAMAGE_INTERVAL_TICKS = 20;
export const MOB_BURN_DAMAGE = 1;
export const PANIC_TICKS = 60;
export const ENTITY_STEP_HEIGHT = 0.6;
export const MOB_JUMP_VELOCITY = 8;
export const MOB_HURT_TICKS = 10;
export const MOB_DEATH_TICKS = 20;
export const MOB_MAX_FALL_SAFE = 3;
export const SHEEP_REGROW_WOOL_TICKS = 2400;

/** 繁殖：喂食后进入求爱状态的时长，以及两次繁殖之间的冷却（1.8.9 都是 30 秒）。 */
export const MOB_LOVE_TICKS = 600;
export const MOB_BREED_COOLDOWN_TICKS = 6000;
/** 幼崽长成成体所需的 tick（1.8.9 为 20 分钟）。 */
export const MOB_BABY_GROW_TICKS = 24000;
/** 幼崽的模型缩放。 */
export const MOB_BABY_SCALE = 0.5;
/** 两只动物相距多远之内可以配对。 */
export const MOB_BREED_RANGE = 3;
/** 剪羊毛掉落的羊毛数量区间，以及吃草长回羊毛所需的 tick。 */
export const SHEAR_WOOL_MIN = 1;
export const SHEAR_WOOL_MAX = 3;
export const SHEEP_WOOL_REGROW_TICKS = 2400;

/** 求爱状态下互相寻找配偶的最大距离。 */
export const MOB_MATE_SEEK_RANGE = 12;
/** 繁殖掉落的经验区间。 */
export const MOB_BREED_XP_MIN = 1;
export const MOB_BREED_XP_MAX = 7;
