import { DIFFICULTY_DAMAGE_MULTIPLIER } from '../constants/game';
import {
  ARROW_SPEED,
  CREEPER_EXPLOSION_RADIUS,
  CREEPER_FUSE_TICKS,
  CREEPER_TRIGGER_RANGE,
  ENTITY_STEP_HEIGHT,
  MOB_ATTACK_COOLDOWN_TICKS,
  MOB_BABY_GROW_TICKS,
  MOB_BABY_SCALE,
  MOB_LOVE_TICKS,
  SHEAR_WOOL_MAX,
  SHEAR_WOOL_MIN,
  SHEEP_WOOL_REGROW_TICKS,
  MOB_ATTACK_RANGE,
  MOB_BURN_DAMAGE,
  MOB_BURN_DAMAGE_INTERVAL_TICKS,
  MOB_BURN_LIGHT_MIN,
  MOB_JUMP_VELOCITY,
  MOB_LOSE_TARGET_RANGE,
  MOB_TARGET_RANGE,
  MOB_WANDER_INTERVAL_TICKS,
  PANIC_TICKS,
  SKELETON_KEEP_DISTANCE,
  SKELETON_SHOOT_COOLDOWN_TICKS,
  SKELETON_SHOOT_RANGE,
} from '../constants/mobs';
import {
  BLAZE_SHOOT_COOLDOWN_TICKS,
  BLAZE_SHOOT_RANGE,
  FIREBALL_SPEED,
  GHAST_HOVER_HEIGHT,
  GHAST_SHOOT_COOLDOWN_TICKS,
  GHAST_SHOOT_RANGE,
  HOSTILE_SPAWN_LIGHT_MAX,
  PIGMAN_ANGER_RADIUS,
  PIGMAN_ANGER_TICKS,
} from '../constants/mobs';
import { MobSoundKind } from './mobSounds';
import { FireballEntity, FireballKind } from './FireballEntity';
import { EffectId } from './effects';

import { EnchantmentId, enchantLevel } from '../items/enchantments';
import { AABB } from '../physics/AABB';
import { isBoxBlocked } from '../physics/collision';
import { findPath, type PathNode } from './ai/Pathfinder';
import { ArrowEntity } from './ArrowEntity';
import type { Entity, EntitySaveData } from './Entity';
import type { EntityContext } from './EntityContext';
import { LivingEntity } from './LivingEntity';
import { MOB_DEFS, MobType, type MobDef } from './MobDefs';

const MOB_GROUND_ACCEL = 10;
const MOB_AIR_ACCEL = 2;
const STUCK_SPEED_THRESHOLD = 0.3;
/** 末影人受伤传送：概率、尝试次数与范围。 */
const TELEPORT_ON_HURT_CHANCE = 0.5;
const TELEPORT_ATTEMPTS = 16;
const TELEPORT_RANGE = 16;
const TELEPORT_VERTICAL_RANGE = 4;
/** 史莱姆死亡分裂出的数量与体型比例。 */
const SLIME_SPLIT_COUNT = 2;
const SLIME_SPLIT_SCALE = 0.6;
/** 多久重新算一次路（20 tick = 1 秒；玩家跑远了会提前重算）。 */
const PATH_REFRESH_TICKS = 20;
/** 目标离上次算路时的位置差超过这么多格就立刻重算。 */
const PATH_TARGET_MOVE_THRESHOLD = 2;
/** 走到离路点这么近就算到达，切下一个路点。 */
const WAYPOINT_REACHED_DISTANCE = 0.6;
/** 超过这个距离就别费劲算路了，直线追（A\* 的节点上限也撑不住）。 */
const PATH_MAX_DISTANCE = 24;
/** 鸡下蛋的间隔（1.8.9 为 6000~12000 tick，即 5~10 分钟）。 */
const CHICKEN_EGG_MIN_TICKS = 6000;
const CHICKEN_EGG_MAX_TICKS = 12000;
/** 蛋掉在脚下时的散开幅度。 */
const EGG_DROP_SPREAD = 0.1;
const STUCK_TICKS_BEFORE_DETOUR = 15;
const DETOUR_TICKS = 25;

/** AI 状态。 */
export const MobState = {
  IDLE: 'idle',
  WANDER: 'wander',
  CHASE: 'chase',
  FLEE: 'flee',
} as const;
export type MobState = (typeof MobState)[keyof typeof MobState];

/** 生物（含友善与敌对），行为由 MobDef 参数化。 */
/** 闲置叫声的平均间隔（tick）：约 15 秒一次。 */
const IDLE_SOUND_INTERVAL_TICKS = 300;

export class Mob extends LivingEntity {
  readonly type: MobType;
  readonly def: MobDef;
  state: MobState = MobState.IDLE;
  private wanderTicks = 0;
  private targetYaw = 0;
  private moveForward = 0;
  private attackCooldown = 0;
  private panicTicks = 0;
  private burnTicks = 0;
  /** 追击时被卡住的 tick 数与绕行剩余 tick。 */
  /** 距离下一次下蛋还有多少 tick（只有鸡用）；-1 表示还没随机过。 */
  private eggTicks = -1;
  private stuckTicks = 0;
  private detourTicks = 0;
  /** 当前寻路路径（方块坐标的落脚点序列）与进度。 */
  private path: PathNode[] = [];
  private pathIndex = 0;
  private pathCooldown = 0;
  private pathTargetX = 0;
  private pathTargetZ = 0;
  private detourYaw = 0;
  /** 苦力怕引信。 */
  fuse = 0;
  isCharging = false;
  /** 羊毛（羊）。 */
  hasWool = true;
  /** 被剪之后长回羊毛的剩余 tick。 */
  woolRegrowTicks = 0;
  /** 幼崽：体型减半、无法繁殖，长大需要 MOB_BABY_GROW_TICKS。 */
  isBaby = false;
  /** 幼崽长大的剩余 tick。 */
  growTicks = 0;
  /** 求爱状态剩余 tick（>0 时会与同类配对）。 */
  loveTicks = 0;
  /** 繁殖冷却剩余 tick。 */
  breedCooldown = 0;
  /** 求爱时要走向的配偶（由 Game 每 tick 指派）。 */
  mateTarget: Mob | null = null;
  /** 行走动画相位。 */
  limbSwing = 0;
  limbSpeed = 0;

  constructor(type: MobType, id?: number) {
    const def = MOB_DEFS[type];
    super(def.maxHealth, id);
    this.type = type;
    this.def = def;
    this.width = def.width;
    this.height = def.height;
    // 会飞与水生生物不受重力：前者在空中乱飞、后者靠水的浮力
    this.hasGravity = !def.flying;
  }

  /** 设为幼崽（体型减半）或成体。 */
  setBaby(isBaby: boolean, growTicks = MOB_BABY_GROW_TICKS): void {
    this.isBaby = isBaby;
    this.growTicks = isBaby ? growTicks : 0;
    const scale = isBaby ? MOB_BABY_SCALE : 1;
    this.width = this.def.width * scale;
    this.height = this.def.height * scale;
  }

  /** 是否可以被喂食进入求爱状态。 */
  canBreedWith(itemId: string): boolean {
    return (
      !this.isBaby &&
      this.loveTicks === 0 &&
      this.breedCooldown === 0 &&
      this.def.breedingItems?.includes(itemId) === true
    );
  }

  /** 喂食后进入求爱状态。 */
  enterLove(): void {
    this.loveTicks = MOB_LOVE_TICKS;
  }

  override tick(ctx: EntityContext): void {
    this.tickIdleSound(ctx);
    if (this.angerTicks > 0) {
      this.angerTicks--;
    }
    if (this.health > 0) {
      this.tickBreeding();
      this.tickEggLaying(ctx);
      this.think(ctx);
      this.handleSunlight(ctx);
    }
    super.tick(ctx);
  }

  /** 成年鸡每隔 5~10 分钟下一个蛋（1.8.9 同）。 */
  private tickEggLaying(ctx: EntityContext): void {
    if (this.type !== MobType.CHICKEN || this.isBaby) {
      return;
    }
    if (this.eggTicks < 0) {
      // 第一次先随机一个倒计时，免得同一批孵出来的鸡整齐划一地下蛋
      this.eggTicks = this.rollEggDelay(ctx);
      return;
    }
    if (this.eggTicks > 0) {
      this.eggTicks--;
      return;
    }
    this.eggTicks = this.rollEggDelay(ctx);
    ctx.dropItem(this.x, this.y + this.height * 0.5, this.z, { id: 'egg', count: 1 }, EGG_DROP_SPREAD);
  }

  private rollEggDelay(ctx: EntityContext): number {
    return CHICKEN_EGG_MIN_TICKS + Math.floor(ctx.random() * (CHICKEN_EGG_MAX_TICKS - CHICKEN_EGG_MIN_TICKS));
  }

  /** 被剪羊毛：返回掉落的羊毛数量，本来就没毛时返回 0。 */
  shear(random: () => number): number {
    if (this.type !== MobType.SHEEP || !this.hasWool || this.isBaby) {
      return 0;
    }
    this.hasWool = false;
    this.woolRegrowTicks = SHEEP_WOOL_REGROW_TICKS;
    return SHEAR_WOOL_MIN + Math.floor(random() * (SHEAR_WOOL_MAX - SHEAR_WOOL_MIN + 1));
  }

  /** 幼崽长大与求爱 / 冷却计时。 */
  private tickBreeding(): void {
    if (this.woolRegrowTicks > 0) {
      this.woolRegrowTicks--;
      if (this.woolRegrowTicks === 0) {
        this.hasWool = true;
      }
    }
    if (this.isBaby) {
      this.growTicks--;
      if (this.growTicks <= 0) {
        this.setBaby(false);
      }
    }
    if (this.loveTicks > 0) {
      this.loveTicks--;
    }
    if (this.breedCooldown > 0) {
      this.breedCooldown--;
    }
  }

  override move(ctx: EntityContext, dt: number): void {
    if (this.health > 0) {
      this.applyMovement(ctx, dt);
    }
    super.move(ctx, dt);
    const speed = Math.hypot(this.vx, this.vz);
    this.limbSpeed = speed;
    this.limbSwing += speed * dt * 4;
  }

  private think(ctx: EntityContext): void {
    if (this.attackCooldown > 0) {
      this.attackCooldown--;
    }
    if (this.panicTicks > 0) {
      this.panicTicks--;
      this.state = MobState.FLEE;
      this.moveForward = 1.4;
      if (this.panicTicks % 20 === 0) {
        this.targetYaw += (ctx.random() - 0.5) * 1.5;
      }
      return;
    }
    if (this.seekMate()) {
      return;
    }
    const player = ctx.player;
    const distSq = this.distanceSqTo(player);
    const wantsToAttack = this.def.hostile && this.isAggressive(ctx) && ctx.canMobsTargetPlayer && !player.isDead;
    if (wantsToAttack && distSq < MOB_TARGET_RANGE * MOB_TARGET_RANGE && this.state !== MobState.CHASE) {
      this.state = MobState.CHASE;
    }
    if (this.state === MobState.CHASE) {
      if (!wantsToAttack || distSq > MOB_LOSE_TARGET_RANGE * MOB_LOSE_TARGET_RANGE) {
        this.state = MobState.IDLE;
        this.isCharging = false;
        this.fuse = 0;
        return;
      }
      this.chase(ctx, distSq);
      // 已经贴到目标身上时不算"卡住"：那是在打人，不是被墙挡住，绕行只会把自己推开
      const reach = MOB_ATTACK_RANGE + this.width;
      if (distSq > reach * reach) {
        this.handleStuck(ctx);
      } else {
        this.stuckTicks = 0;
        this.detourTicks = 0;
      }
      return;
    }
    this.wander(ctx);
  }

  /** 追击中若长时间无法前进，则随机绕行一小段时间。 */
  private handleStuck(ctx: EntityContext): void {
    if (this.detourTicks > 0) {
      this.detourTicks--;
      this.targetYaw = this.detourYaw;
      this.moveForward = 1;
      return;
    }
    if (this.moveForward > 0 && this.limbSpeed < STUCK_SPEED_THRESHOLD) {
      this.stuckTicks++;
      if (this.stuckTicks >= STUCK_TICKS_BEFORE_DETOUR) {
        this.stuckTicks = 0;
        this.detourTicks = DETOUR_TICKS;
        this.detourYaw = this.targetYaw + (ctx.random() < 0.5 ? 1 : -1) * (Math.PI / 2 + ctx.random() * 0.8);
      }
    } else {
      this.stuckTicks = 0;
    }
  }

  /** 被激怒的剩余 tick（中立生物用）。 */
  angerTicks = 0;

  protected override get isFireImmune(): boolean {
    return this.def.fireImmune === true;
  }

  private isAggressive(ctx: EntityContext): boolean {
    // 中立生物（僵尸猪人）只在被激怒时攻击
    if (this.def.neutral) {
      return this.angerTicks > 0;
    }
    if (!this.def.neutralInDaylight) {
      return true;
    }
    return ctx.lightLevelAt(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z)) <= HOSTILE_SPAWN_LIGHT_MAX;
  }

  private wander(ctx: EntityContext): void {
    if (this.wanderTicks > 0) {
      this.wanderTicks--;
      return;
    }
    this.wanderTicks = Math.floor(MOB_WANDER_INTERVAL_TICKS * (0.5 + ctx.random()));
    if (ctx.random() < 0.55) {
      this.state = MobState.IDLE;
      this.moveForward = 0;
    } else {
      this.state = MobState.WANDER;
      this.targetYaw = ctx.random() * Math.PI * 2;
      this.moveForward = 0.6;
    }
  }

  /** 求爱状态下走向配偶；正在求偶时返回 true（这一 tick 不做别的 AI）。 */
  private seekMate(): boolean {
    const mate = this.mateTarget;
    if (this.loveTicks === 0 || !mate || mate.loveTicks === 0 || mate.health <= 0) {
      this.mateTarget = null;
      return false;
    }
    this.state = MobState.WANDER;
    this.targetYaw = Math.atan2(-(mate.x - this.x), -(mate.z - this.z));
    this.moveForward = 1;
    return true;
  }

  private chase(ctx: EntityContext, distSq: number): void {
    const player = ctx.player;
    const dist = Math.sqrt(distSq);
    // 陆行近战生物走 A* 找的路绕开障碍；远程 / 飞行的仍然直接朝玩家转向
    const usesPath = !this.def.flying && this.type !== MobType.SKELETON;
    const waypointYaw = usesPath ? this.followPath(ctx, dist) : null;
    this.targetYaw = waypointYaw ?? Math.atan2(-(player.x - this.x), -(player.z - this.z));
    switch (this.type) {
      case MobType.CREEPER:
        this.chaseCreeper(ctx, dist);
        break;
      case MobType.SKELETON:
        this.chaseSkeleton(ctx, dist);
        break;
      case MobType.GHAST:
        this.chaseGhast(ctx, dist);
        break;
      case MobType.BLAZE:
        this.chaseBlaze(ctx, dist);
        break;
      default:
        this.moveForward = 1;
        if (dist < MOB_ATTACK_RANGE + this.width / 2 && this.attackCooldown === 0) {
          this.meleeAttack(ctx);
        }
        break;
    }
  }

  /**
   * 沿 A\* 路径走：必要时重新算路，然后朝当前路点转向。
   * @returns 朝下一个路点的 yaw；没有可用路径（太远 / 找不到）时返回 null，由调用方退回直线追
   */
  private followPath(ctx: EntityContext, dist: number): number | null {
    if (this.pathCooldown > 0) {
      this.pathCooldown--;
    }
    const player = ctx.player;
    const targetMoved =
      Math.abs(player.x - this.pathTargetX) > PATH_TARGET_MOVE_THRESHOLD ||
      Math.abs(player.z - this.pathTargetZ) > PATH_TARGET_MOVE_THRESHOLD;
    if (dist > PATH_MAX_DISTANCE) {
      this.path = [];
      return null;
    }
    if (this.pathCooldown === 0 || targetMoved) {
      this.recomputePath(ctx);
    }
    // 走到跟前的路点就换下一个
    while (this.pathIndex < this.path.length) {
      const node = this.path[this.pathIndex];
      const dx = node.x + 0.5 - this.x;
      const dz = node.z + 0.5 - this.z;
      if (Math.hypot(dx, dz) > WAYPOINT_REACHED_DISTANCE) {
        return Math.atan2(-dx, -dz);
      }
      this.pathIndex++;
    }
    return null;
  }

  private recomputePath(ctx: EntityContext): void {
    const player = ctx.player;
    this.pathCooldown = PATH_REFRESH_TICKS;
    this.pathTargetX = player.x;
    this.pathTargetZ = player.z;
    this.pathIndex = 0;
    this.path = findPath(
      ctx.world,
      { x: Math.floor(this.x), y: Math.floor(this.y + 0.01), z: Math.floor(this.z) },
      { x: Math.floor(player.x), y: Math.floor(player.y + 0.01), z: Math.floor(player.z) },
    );
  }

  private chaseCreeper(ctx: EntityContext, dist: number): void {
    if (dist < CREEPER_TRIGGER_RANGE) {
      this.isCharging = true;
      this.moveForward = 0;
      this.fuse++;
      if (this.fuse >= CREEPER_FUSE_TICKS) {
        this.explodeNow(ctx);
      }
      return;
    }
    if (this.isCharging) {
      this.fuse = Math.max(0, this.fuse - 1);
      if (this.fuse === 0) {
        this.isCharging = false;
      }
    }
    this.moveForward = 1;
  }

  private explodeNow(ctx: EntityContext): void {
    this.isDead = true;
    this.health = 0;
    ctx.explode(this.x, this.y + this.height / 2, this.z, CREEPER_EXPLOSION_RADIUS, this.id);
  }

  private chaseSkeleton(ctx: EntityContext, dist: number): void {
    if (dist > SKELETON_SHOOT_RANGE) {
      this.moveForward = 1;
      return;
    }
    this.moveForward = dist < SKELETON_KEEP_DISTANCE ? -0.6 : 0.3;
    if (this.attackCooldown === 0) {
      this.attackCooldown = SKELETON_SHOOT_COOLDOWN_TICKS;
      this.shootArrow(ctx);
    }
  }

  /** 恶魂：悬停在玩家上方，隔一会儿丢一颗大火球。 */
  private chaseGhast(ctx: EntityContext, dist: number): void {
    const player = ctx.player;
    // 保持距离并浮在玩家上方
    this.moveForward = dist > GHAST_SHOOT_RANGE / 2 ? 0.6 : -0.3;
    const targetY = player.y + GHAST_HOVER_HEIGHT;
    this.vy = Math.sign(targetY - this.y) * this.def.speed * 0.4;
    if (dist < GHAST_SHOOT_RANGE && this.attackCooldown === 0) {
      this.attackCooldown = GHAST_SHOOT_COOLDOWN_TICKS;
      this.shootFireball(ctx, FireballKind.LARGE);
    }
  }

  /** 烈焰人：贴近后连发小火球。 */
  private chaseBlaze(ctx: EntityContext, dist: number): void {
    this.moveForward = dist > BLAZE_SHOOT_RANGE / 2 ? 0.8 : 0;
    // 会飞：跟着玩家的高度飘
    this.vy = Math.sign(ctx.player.y + 1 - this.y) * this.def.speed * 0.3;
    if (dist < BLAZE_SHOOT_RANGE && this.attackCooldown === 0) {
      this.attackCooldown = BLAZE_SHOOT_COOLDOWN_TICKS;
      this.shootFireball(ctx, FireballKind.SMALL);
    }
  }

  /** 朝玩家丢一颗火球。 */
  private shootFireball(ctx: EntityContext, kind: FireballKind): void {
    const player = ctx.player;
    const dx = player.x - this.x;
    const dy = player.y + player.height * 0.6 - this.eyeY;
    const dz = player.z - this.z;
    const dist = Math.hypot(dx, dy, dz) || 1;
    const ball = new FireballEntity(kind, this.id);
    ball.setPosition(this.x, this.eyeY, this.z);
    ball.vx = (dx / dist) * FIREBALL_SPEED;
    ball.vy = (dy / dist) * FIREBALL_SPEED;
    ball.vz = (dz / dist) * FIREBALL_SPEED;
    ctx.spawnEntity(ball);
    ctx.playSound('fizz', this.x, this.y, this.z);
  }

  private shootArrow(ctx: EntityContext): void {
    const player = ctx.player;
    const dx = player.x - this.x;
    const dy = player.y + player.height * 0.6 - this.eyeY;
    const dz = player.z - this.z;
    const dist = Math.hypot(dx, dy, dz) || 1;
    const arrow = new ArrowEntity(this.id, false);
    arrow.setPosition(this.x, this.eyeY, this.z);
    const inaccuracy = 0.08;
    arrow.vx = (dx / dist + (ctx.random() - 0.5) * inaccuracy) * ARROW_SPEED;
    arrow.vy = (dy / dist + 0.08 + (ctx.random() - 0.5) * inaccuracy) * ARROW_SPEED;
    arrow.vz = (dz / dist + (ctx.random() - 0.5) * inaccuracy) * ARROW_SPEED;
    ctx.spawnEntity(arrow);
    ctx.playSound('bow', this.x, this.y, this.z);
  }

  private meleeAttack(ctx: EntityContext): void {
    this.attackCooldown = MOB_ATTACK_COOLDOWN_TICKS;
    const damage = this.def.attackDamage * DIFFICULTY_DAMAGE_MULTIPLIER[ctx.difficulty];
    ctx.hurtPlayer(damage, this);
    // 烈焰人点燃、凋灵骷髅施加凋零
    if (this.def.igniteTicks) {
      ctx.player.setOnFire(this.def.igniteTicks);
    }
    if (this.def.witherTicks) {
      ctx.player.addEffect(EffectId.WITHER, this.def.witherTicks, 0, ctx);
    }
  }

  private applyMovement(ctx: EntityContext, dt: number): void {
    // 平滑转向
    let diff = this.targetYaw - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.yaw += diff * Math.min(1, dt * 8);
    const speed = this.def.speed * this.moveForward;
    const accel = this.onGround || this.inWater ? MOB_GROUND_ACCEL : MOB_AIR_ACCEL;
    const fx = -Math.sin(this.yaw) * speed;
    const fz = -Math.cos(this.yaw) * speed;
    this.steerTowards(fx, fz, dt, accel);
    if (this.moveForward === 0) {
      return;
    }
    if (this.inWater) {
      this.vy += 8 * dt;
    }
    if (this.onGround && this.isBlockedAhead(ctx)) {
      this.vy = MOB_JUMP_VELOCITY;
    }
  }

  /** 前方一格是否有可跨越的障碍。 */
  private isBlockedAhead(ctx: EntityContext): boolean {
    const dirX = -Math.sin(this.yaw);
    const dirZ = -Math.cos(this.yaw);
    const ahead = AABB.fromFeet(this.x + dirX * 0.6, this.y + 0.1, this.z + dirZ * 0.6, this.width, this.height - 0.1);
    if (!isBoxBlocked(ctx.world, ahead)) {
      return false;
    }
    const aheadUp = ahead.offset(0, ENTITY_STEP_HEIGHT + 0.5, 0);
    return !isBoxBlocked(ctx.world, aheadUp);
  }

  private handleSunlight(ctx: EntityContext): void {
    if (!this.def.burnsInSunlight || !ctx.isDaytime()) {
      this.burnTicks = 0;
      return;
    }
    const sky = ctx.world.getSkyLight(Math.floor(this.x), Math.floor(this.eyeY), Math.floor(this.z));
    if (sky < MOB_BURN_LIGHT_MIN || this.inWater) {
      this.burnTicks = 0;
      return;
    }
    this.burnTicks++;
    if (this.burnTicks % MOB_BURN_DAMAGE_INTERVAL_TICKS === 0) {
      this.hurt(ctx, MOB_BURN_DAMAGE, null);
    }
  }

  /** 是否正在燃烧（用于渲染）：阳光灼烧或被岩浆 / 火点着。 */
  get isBurning(): boolean {
    return this.burnTicks > 0 || this.isOnFire;
  }

  /** 死亡时分裂成两只更小的同类（史莱姆）；已经很小的就不再分裂。 */
  private trySplit(ctx: EntityContext): void {
    if (!this.def.splits || this.width < this.def.width * SLIME_SPLIT_SCALE) {
      return;
    }
    for (let i = 0; i < SLIME_SPLIT_COUNT; i++) {
      const child = new Mob(this.type);
      child.width = this.width * SLIME_SPLIT_SCALE;
      child.height = this.height * SLIME_SPLIT_SCALE;
      child.maxHealth = Math.max(1, Math.floor(this.maxHealth * SLIME_SPLIT_SCALE));
      child.health = child.maxHealth;
      child.setPosition(this.x + (ctx.random() - 0.5), this.y, this.z + (ctx.random() - 0.5));
      ctx.spawnEntity(child);
    }
  }

  /** 受伤时随机传送（末影人）。 */
  private tryTeleport(ctx: EntityContext): void {
    for (let i = 0; i < TELEPORT_ATTEMPTS; i++) {
      const x = Math.floor(this.x) + Math.floor((ctx.random() - 0.5) * 2 * TELEPORT_RANGE);
      const z = Math.floor(this.z) + Math.floor((ctx.random() - 0.5) * 2 * TELEPORT_RANGE);
      const y = Math.floor(this.y) + Math.floor((ctx.random() - 0.5) * 2 * TELEPORT_VERTICAL_RANGE);
      if (ctx.world.canStandAt(x, y, z)) {
        this.setPosition(x + 0.5, y, z + 0.5);
        ctx.playSound('hit', this.x, this.y, this.z);
        return;
      }
    }
  }

  /** 被打后连同附近同族一起进入愤怒状态（1.8.9 的猪人群体激怒）。 */
  private angerNearby(ctx: EntityContext): void {
    this.angerTicks = PIGMAN_ANGER_TICKS;
    for (const other of ctx.livingEntitiesNear(this.x, this.y, this.z, PIGMAN_ANGER_RADIUS)) {
      if (other instanceof Mob && other.type === this.type) {
        other.angerTicks = PIGMAN_ANGER_TICKS;
      }
    }
  }

  /** 闲置叫声：平均每 IDLE_SOUND_INTERVAL_TICKS 出一次声。 */
  private tickIdleSound(ctx: EntityContext): void {
    if (ctx.random() >= 1 / IDLE_SOUND_INTERVAL_TICKS) {
      return;
    }
    ctx.playMobSound(this.type, MobSoundKind.IDLE, this.x, this.y, this.z, this.isBaby);
  }

  protected override onHurt(ctx: EntityContext, _amount: number, source: Entity | null): void {
    ctx.playMobSound(this.type, MobSoundKind.HURT, this.x, this.y, this.z, this.isBaby);
    if (this.def.neutral && source) {
      this.angerNearby(ctx);
    }
    if (this.def.teleports && ctx.random() < TELEPORT_ON_HURT_CHANCE) {
      this.tryTeleport(ctx);
    }
    if (this.def.hostile) {
      if (source && this.state !== MobState.CHASE && ctx.canMobsTargetPlayer) {
        this.state = MobState.CHASE;
      }
      return;
    }
    this.panicTicks = PANIC_TICKS;
    if (source) {
      // 背向攻击者逃跑：朝向 (dx, dz) 的 yaw 为 atan2(-dx, -dz)
      const dx = this.x - source.x;
      const dz = this.z - source.z;
      this.targetYaw = Math.atan2(-dx, -dz);
    }
  }

  protected override onLand(ctx: EntityContext, fallDistance: number): void {
    if (this.def.noFallDamage) {
      return;
    }
    super.onLand(ctx, fallDistance);
  }

  protected override onDeath(ctx: EntityContext, byPlayer: boolean): void {
    ctx.playMobSound(this.type, MobSoundKind.DEATH, this.x, this.y, this.z, this.isBaby);
    this.trySplit(ctx);
    // 抢夺：玩家击杀时每级最多多掉 1 个（1.8.9 同）
    const looting = byPlayer ? enchantLevel(ctx.player.heldItem, EnchantmentId.LOOTING) : 0;
    for (const drop of this.def.drops) {
      if (drop.item === 'wool' && !this.hasWool) {
        continue;
      }
      if (drop.chance !== undefined && ctx.random() > drop.chance) {
        continue;
      }
      const count = drop.min + Math.floor(ctx.random() * (drop.max - drop.min + 1 + looting));
      if (count > 0) {
        ctx.dropItem(this.x, this.y + this.height / 2, this.z, { id: drop.item, count }, 0.3);
      }
    }
    ctx.onEntityKilled(this, byPlayer);
  }

  /** 序列化。 */
  serialize(): EntitySaveData {
    return {
      ...this.serializeBase(),
      health: this.health,
      hasWool: this.hasWool,
      woolRegrowTicks: this.woolRegrowTicks,
      isBaby: this.isBaby,
      growTicks: this.growTicks,
    };
  }

  /** 反序列化。 */
  static deserialize(data: EntitySaveData): Mob {
    const mob = new Mob(data.type as MobType, data.id);
    mob.setPosition(data.x, data.y, data.z);
    mob.yaw = data.yaw;
    mob.age = data.age;
    if (typeof data.health === 'number') {
      mob.health = data.health;
    }
    if (typeof data.hasWool === 'boolean') {
      mob.hasWool = data.hasWool;
    }
    if (typeof data.woolRegrowTicks === 'number') {
      mob.woolRegrowTicks = data.woolRegrowTicks;
    }
    if (data.isBaby === true) {
      mob.setBaby(true, typeof data.growTicks === 'number' ? data.growTicks : MOB_BABY_GROW_TICKS);
    }
    return mob;
  }
}
