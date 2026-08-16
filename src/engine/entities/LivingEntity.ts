import { BlockId } from '../blocks/BlockRegistry';
import {
  FALL_DAMAGE_THRESHOLD,
  FIRE_DAMAGE,
  FIRE_DAMAGE_INTERVAL_TICKS,
  INVULNERABLE_TICKS,
  KNOCKBACK_STRENGTH,
} from '../constants/game';
import { LAVA_BURN_TICKS, LAVA_DAMAGE, LAVA_DAMAGE_INTERVAL_TICKS } from '../constants/fluids';
import { MOB_DEATH_TICKS, MOB_HURT_TICKS } from '../constants/mobs';
import { isBoxTouchingBlock } from '../physics/collision';
import { Entity } from './Entity';
import type { EntityContext } from './EntityContext';

/** 有生命值的实体。 */
export abstract class LivingEntity extends Entity {
  health: number;
  maxHealth: number;
  hurtTicks = 0;
  deathTicks = 0;
  invulnerableTicks = 0;
  /** 上一次伤害来源实体 id（击杀归属）。 */
  lastAttackerId: number | null = null;
  lastAttackedByPlayer = false;
  /** 着火剩余 tick。 */
  fireTicks = 0;
  private fireDamageTimer = 0;
  private lavaDamageTimer = 0;

  constructor(maxHealth: number, id?: number) {
    super(id);
    this.maxHealth = maxHealth;
    this.health = maxHealth;
  }

  /** 是否处于死亡动画。 */
  get isDying(): boolean {
    return this.health <= 0;
  }

  override tick(ctx: EntityContext): void {
    if (this.hurtTicks > 0) {
      this.hurtTicks--;
    }
    if (this.invulnerableTicks > 0) {
      this.invulnerableTicks--;
    }
    if (this.health <= 0) {
      this.deathTicks++;
      if (this.deathTicks >= MOB_DEATH_TICKS) {
        this.isDead = true;
      }
      return;
    }
    this.tickFire(ctx);
    super.tick(ctx);
  }

  /** 让实体着火（取较长的时间）。 */
  setOnFire(ticks: number): void {
    this.fireTicks = Math.max(this.fireTicks, ticks);
  }

  /** 是否正在着火（岩浆 / 火焰点燃）。 */
  get isOnFire(): boolean {
    return this.fireTicks > 0;
  }

  /**
   * 泡在岩浆里持续掉血并被点燃；离开后火还会烧一会儿，进水立刻熄灭。
   */
  protected tickFire(ctx: EntityContext): void {
    const box = this.box();
    if (isBoxTouchingBlock(ctx.world, box, BlockId.LAVA)) {
      this.setOnFire(LAVA_BURN_TICKS);
      this.lavaDamageTimer++;
      if (this.lavaDamageTimer >= LAVA_DAMAGE_INTERVAL_TICKS) {
        this.lavaDamageTimer = 0;
        this.hurt(ctx, LAVA_DAMAGE, null);
      }
    } else {
      this.lavaDamageTimer = 0;
    }
    if (this.fireTicks === 0) {
      return;
    }
    // 只有真的碰到水才灭火（inWater 对岩浆也是 true）
    if (isBoxTouchingBlock(ctx.world, box, BlockId.WATER)) {
      this.fireTicks = 0;
      return;
    }
    this.fireTicks--;
    this.fireDamageTimer++;
    if (this.fireDamageTimer >= FIRE_DAMAGE_INTERVAL_TICKS) {
      this.fireDamageTimer = 0;
      this.hurt(ctx, FIRE_DAMAGE, null);
    }
  }

  /**
   * 受伤。返回是否实际造成伤害。
   * @param source 伤害来源实体（用于击退方向），可空
   */
  hurt(ctx: EntityContext, amount: number, source: Entity | null, byPlayer = false): boolean {
    if (this.health <= 0 || amount <= 0 || this.invulnerableTicks > 0) {
      return false;
    }
    this.health = Math.max(0, this.health - amount);
    this.hurtTicks = MOB_HURT_TICKS;
    this.invulnerableTicks = INVULNERABLE_TICKS;
    this.lastAttackerId = source?.id ?? null;
    this.lastAttackedByPlayer = byPlayer;
    if (source) {
      this.applyKnockback(source.x, source.z);
    }
    this.onHurt(ctx, amount, source);
    if (this.health <= 0) {
      this.onDeath(ctx, byPlayer);
    }
    return true;
  }

  /** 从来源位置反向击退。 */
  applyKnockback(fromX: number, fromZ: number, strength = KNOCKBACK_STRENGTH): void {
    let dx = this.x - fromX;
    let dz = this.z - fromZ;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    this.vx += dx * strength * 0.5;
    this.vz += dz * strength * 0.5;
    this.vy = Math.max(this.vy, strength * 0.6);
  }

  /** 回复生命。 */
  heal(amount: number): void {
    if (this.health <= 0) {
      return;
    }
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  protected override onLand(ctx: EntityContext, fallDistance: number): void {
    const damage = Math.floor(fallDistance - FALL_DAMAGE_THRESHOLD);
    if (damage > 0 && !this.inWater) {
      this.hurt(ctx, damage, null);
    }
  }

  protected onHurt(_ctx: EntityContext, _amount: number, _source: Entity | null): void {
    // 子类按需实现
  }

  protected onDeath(_ctx: EntityContext, _byPlayer: boolean): void {
    // 子类按需实现
  }
}
