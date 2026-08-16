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
import { HOSTILE_SPAWN_LIGHT_MAX } from '../constants/mobs';
import { AABB } from '../physics/AABB';
import { isBoxBlocked } from '../physics/collision';
import { ArrowEntity } from './ArrowEntity';
import type { Entity, EntitySaveData } from './Entity';
import type { EntityContext } from './EntityContext';
import { LivingEntity } from './LivingEntity';
import { MOB_DEFS, MobType, type MobDef } from './MobDefs';

const MOB_GROUND_ACCEL = 10;
const MOB_AIR_ACCEL = 2;
const STUCK_SPEED_THRESHOLD = 0.3;
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
  private stuckTicks = 0;
  private detourTicks = 0;
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
    if (this.health > 0) {
      this.tickBreeding();
      this.think(ctx);
      this.handleSunlight(ctx);
    }
    super.tick(ctx);
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
      this.handleStuck(ctx);
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

  private isAggressive(ctx: EntityContext): boolean {
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
    const dx = player.x - this.x;
    const dz = player.z - this.z;
    this.targetYaw = Math.atan2(-dx, -dz);
    const dist = Math.sqrt(distSq);
    switch (this.type) {
      case MobType.CREEPER:
        this.chaseCreeper(ctx, dist);
        break;
      case MobType.SKELETON:
        this.chaseSkeleton(ctx, dist);
        break;
      default:
        this.moveForward = 1;
        if (dist < MOB_ATTACK_RANGE + this.width / 2 && this.attackCooldown === 0) {
          this.meleeAttack(ctx);
        }
        break;
    }
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

  protected override onHurt(ctx: EntityContext, _amount: number, source: Entity | null): void {
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
    for (const drop of this.def.drops) {
      if (drop.item === 'wool' && !this.hasWool) {
        continue;
      }
      if (drop.chance !== undefined && ctx.random() > drop.chance) {
        continue;
      }
      const count = drop.min + Math.floor(ctx.random() * (drop.max - drop.min + 1));
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
