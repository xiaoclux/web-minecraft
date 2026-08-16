import { BlockId } from '../blocks/BlockRegistry';
import {
  CACTUS_DAMAGE,
  CACTUS_DAMAGE_INTERVAL_TICKS,
  FALL_DAMAGE_THRESHOLD,
  FIRE_DAMAGE,
  FIRE_DAMAGE_INTERVAL_TICKS,
  FIRE_TOUCH_BURN_TICKS,
  INVULNERABLE_TICKS,
  KNOCKBACK_STRENGTH,
} from '../constants/game';
import { LAVA_BURN_TICKS, LAVA_DAMAGE, LAVA_DAMAGE_INTERVAL_TICKS } from '../constants/fluids';
import { MOB_DEATH_TICKS, MOB_HURT_TICKS } from '../constants/mobs';
import { isBoxTouchingBlock } from '../physics/collision';
import {
  EFFECT_DEFS,
  EffectId,
  INSTANT_BASE_AMOUNT,
  PERIODIC_AMOUNT,
  POISON_MIN_HEALTH,
  isEffectId,
  type ActiveEffect,
} from './effects';
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
  /** 身上的状态效果。 */
  readonly effects = new Map<EffectId, ActiveEffect>();
  /** 各效果距离下次周期性生效还有多少 tick。 */
  private readonly effectTimers = new Map<EffectId, number>();
  /** 着火剩余 tick。 */
  fireTicks = 0;
  private fireDamageTimer = 0;
  private lavaDamageTimer = 0;
  private cactusDamageTimer = 0;

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
    this.tickEffects(ctx);
    this.tickFire(ctx);
    super.tick(ctx);
  }

  /**
   * 加一个状态效果。同种效果取"等级更高的赢，等级相同取时间更长的"。
   * 瞬间类效果（瞬间治疗 / 伤害）当场结算、不驻留。
   */
  addEffect(id: EffectId, ticks: number, amplifier = 0, ctx?: EntityContext): void {
    const def = EFFECT_DEFS[id];
    if (def.instant) {
      this.applyInstant(id, amplifier, ctx);
      return;
    }
    const existing = this.effects.get(id);
    if (existing && (existing.amplifier > amplifier || (existing.amplifier === amplifier && existing.ticks >= ticks))) {
      return;
    }
    this.effects.set(id, { id, amplifier, ticks });
    this.effectTimers.set(id, this.periodOf(id, amplifier));
  }

  /** 移除一个效果。 */
  removeEffect(id: EffectId): void {
    this.effects.delete(id);
    this.effectTimers.delete(id);
  }

  /** 清空所有效果（喝牛奶）。 */
  clearEffects(): void {
    this.effects.clear();
    this.effectTimers.clear();
  }

  /** 效果等级：没有返回 0，I 级返回 1，依此类推。 */
  effectLevel(id: EffectId): number {
    const effect = this.effects.get(id);
    return effect ? effect.amplifier + 1 : 0;
  }

  /** 是否有某个效果。 */
  hasEffect(id: EffectId): boolean {
    return this.effects.has(id);
  }

  /** 周期性效果的实际间隔：等级每高一级快一倍。 */
  private periodOf(id: EffectId, amplifier: number): number {
    const period = EFFECT_DEFS[id].periodTicks ?? 0;
    return Math.max(1, period >> amplifier);
  }

  /** 瞬间治疗 / 瞬间伤害。 */
  private applyInstant(id: EffectId, amplifier: number, ctx?: EntityContext): void {
    const amount = INSTANT_BASE_AMOUNT * Math.pow(2, amplifier);
    if (id === EffectId.INSTANT_HEALTH) {
      this.heal(amount);
    } else if (ctx) {
      this.hurt(ctx, amount, null);
    }
  }

  /** 效果计时与周期性结算（生命恢复 / 中毒 / 凋零）。 */
  private tickEffects(ctx: EntityContext): void {
    if (this.effects.size === 0) {
      return;
    }
    for (const effect of [...this.effects.values()]) {
      effect.ticks--;
      if (effect.ticks <= 0) {
        this.removeEffect(effect.id);
        continue;
      }
      const period = EFFECT_DEFS[effect.id].periodTicks;
      if (!period) {
        continue;
      }
      const remaining = (this.effectTimers.get(effect.id) ?? period) - 1;
      if (remaining > 0) {
        this.effectTimers.set(effect.id, remaining);
        continue;
      }
      this.effectTimers.set(effect.id, this.periodOf(effect.id, effect.amplifier));
      this.applyPeriodic(ctx, effect.id);
    }
  }

  private applyPeriodic(ctx: EntityContext, id: EffectId): void {
    if (id === EffectId.REGENERATION) {
      this.heal(PERIODIC_AMOUNT);
      return;
    }
    if (id === EffectId.POISON) {
      // 中毒打不死人，最低留一格血
      if (this.health > POISON_MIN_HEALTH) {
        this.hurt(ctx, PERIODIC_AMOUNT, null);
      }
      return;
    }
    if (id === EffectId.WITHER) {
      this.hurt(ctx, PERIODIC_AMOUNT, null);
    }
  }

  /** 序列化身上的效果。 */
  serializeEffects(): ActiveEffect[] {
    return [...this.effects.values()].map((e) => ({ ...e }));
  }

  /** 反序列化效果（旧存档没有该字段时什么都不做）。 */
  loadEffects(data: readonly ActiveEffect[] | undefined): void {
    this.clearEffects();
    for (const e of data ?? []) {
      if (isEffectId(e.id)) {
        this.effects.set(e.id, { ...e });
        this.effectTimers.set(e.id, this.periodOf(e.id, e.amplifier));
      }
    }
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
   * 环境伤害：岩浆 / 火会点燃并掉血，仙人掌扎人。
   * 离开岩浆后火还会烧一会儿，进水立刻熄灭。
   */
  protected tickFire(ctx: EntityContext): void {
    const box = this.box();
    if (isBoxTouchingBlock(ctx.world, box, BlockId.CACTUS)) {
      this.cactusDamageTimer++;
      if (this.cactusDamageTimer >= CACTUS_DAMAGE_INTERVAL_TICKS) {
        this.cactusDamageTimer = 0;
        this.hurt(ctx, CACTUS_DAMAGE, null);
      }
    } else {
      this.cactusDamageTimer = 0;
    }
    if (this.hasEffect(EffectId.FIRE_RESISTANCE)) {
      this.fireTicks = 0;
      return;
    }
    if (isBoxTouchingBlock(ctx.world, box, BlockId.FIRE)) {
      this.setOnFire(FIRE_TOUCH_BURN_TICKS);
    }
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
