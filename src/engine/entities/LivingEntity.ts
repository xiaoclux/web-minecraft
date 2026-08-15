import { FALL_DAMAGE_THRESHOLD, INVULNERABLE_TICKS, KNOCKBACK_STRENGTH } from '../constants/game';
import { MOB_DEATH_TICKS, MOB_HURT_TICKS } from '../constants/mobs';
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
    super.tick(ctx);
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
