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
/** 喷溅药水：出手速度（格/秒）、重力、最长飞行时间、炸开的作用半径。 */
/** 火球：存活时间、大火球爆炸半径、小火球伤害与点燃时长。 */
export const FIREBALL_LIFETIME_TICKS = 200;
export const FIREBALL_EXPLOSION_RADIUS = 3;
export const SMALL_FIREBALL_DAMAGE = 5;
export const SMALL_FIREBALL_IGNITE_TICKS = 100;
/** 火球出手速度（格/秒）。 */
export const FIREBALL_SPEED = 14;
/** 远程生物的射程与冷却。 */
export const GHAST_SHOOT_RANGE = 40;
export const GHAST_SHOOT_COOLDOWN_TICKS = 60;
export const BLAZE_SHOOT_RANGE = 16;
export const BLAZE_SHOOT_COOLDOWN_TICKS = 40;
/** 恶魂保持的高度（相对玩家）与游走速度。 */
export const GHAST_HOVER_HEIGHT = 6;
/** 僵尸猪人被激怒后波及的半径与持续时间。 */
export const PIGMAN_ANGER_RADIUS = 16;
export const PIGMAN_ANGER_TICKS = 400;

/** 末影水晶：治疗范围与被打碎时的爆炸半径。 */
export const ENDER_CRYSTAL_HEAL_RANGE = 64;
export const ENDER_CRYSTAL_EXPLOSION_RADIUS = 4;
/** 末影龙：血量、盘旋、俯冲与回血参数。 */
export const DRAGON_MAX_HEALTH = 200;
export const DRAGON_CIRCLE_RADIUS = 40;
/** 盘旋角速度（弧度/秒）。 */
export const DRAGON_CIRCLE_SPEED = 0.35;
/** 巡航时相对玩家的高度。 */
export const DRAGON_CRUISE_HEIGHT = 14;
/** 俯冲速度（格/秒）、伤害、命中判定距离与冷却。 */
export const DRAGON_CHARGE_SPEED = 18;
export const DRAGON_CHARGE_DAMAGE = 10;
export const DRAGON_HIT_RANGE = 4;
export const DRAGON_CHARGE_COOLDOWN_TICKS = 120;
/** 俯冲时撞碎方块的半径。 */
export const DRAGON_WRECK_RADIUS = 2;
/** 每颗水晶每次回多少血、多久回一次。 */
export const DRAGON_HEAL_PER_CRYSTAL = 1;
export const DRAGON_HEAL_INTERVAL_TICKS = 20;
/** 击杀末影龙给的经验。 */
export const DRAGON_KILL_XP = 12000;

export const SPLASH_POTION_SPEED = 12;
export const SPLASH_POTION_GRAVITY = 20;
export const SPLASH_POTION_LIFETIME_TICKS = 200;
export const SPLASH_POTION_RADIUS = 4;
/** 离炸点越远效果越弱，但持续时间至少保留这个比例。 */
export const SPLASH_POTION_MIN_FACTOR = 0.2;
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

/** 刷怪笼：玩家在这个距离内才工作，每轮生成 1~4 只，间隔 10~40 秒。 */
export const SPAWNER_ACTIVATE_RANGE = 16;
export const SPAWNER_MIN_DELAY_TICKS = 200;
export const SPAWNER_MAX_DELAY_TICKS = 800;
export const SPAWNER_MIN_COUNT = 1;
export const SPAWNER_MAX_COUNT = 4;
/** 生成点相对刷怪笼的最大偏移。 */
export const SPAWNER_SPAWN_RANGE = 4;
/** 附近同类生物超过这个数就不再生成。 */
export const SPAWNER_NEARBY_LIMIT = 6;
