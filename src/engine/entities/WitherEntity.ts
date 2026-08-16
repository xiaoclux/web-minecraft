/**
 * 凋灵：召唤后先蓄力再开打；悬停在玩家上方连发凋灵之首，命中带凋零效果。
 * 血条与末影龙共用 HUD 的 Boss 条；击杀掉一颗下界之星。
 */

import {
  WITHER_CHARGE_TICKS,
  WITHER_HOVER_HEIGHT,
  WITHER_MAX_HEALTH,
  WITHER_SHOOT_COOLDOWN_TICKS,
  WITHER_SHOOT_RANGE,
  WITHER_SKULL_SPEED,
  WITHER_SPEED,
} from '../constants/mobs';
import type { EntitySaveData } from './Entity';
import type { EntityContext } from './EntityContext';
import { LivingEntity } from './LivingEntity';
import { WitherSkullEntity } from './WitherSkullEntity';

const WITHER_WIDTH = 0.9;
const WITHER_HEIGHT = 3.5;

/** 凋灵的阶段。 */
export const WitherPhase = {
  /** 召唤后的蓄力（原版会先爆炸一次，这里只是不动地涨血）。 */
  CHARGING: 'charging',
  /** 正常战斗。 */
  FIGHTING: 'fighting',
} as const;
export type WitherPhase = (typeof WitherPhase)[keyof typeof WitherPhase];

/** 凋灵 Boss。 */
export class WitherEntity extends LivingEntity {
  readonly type = 'wither';
  phase: WitherPhase = WitherPhase.CHARGING;
  private chargeTicks = 0;
  private shootCooldown = 0;

  constructor(id?: number) {
    super(WITHER_MAX_HEALTH, id);
    this.width = WITHER_WIDTH;
    this.height = WITHER_HEIGHT;
    this.hasGravity = false;
    // 蓄力期间只有一半血，蓄满才是满血（1.8.9 同）
    this.health = WITHER_MAX_HEALTH / 2;
  }

  /** 血量比例（Boss 血条用）。 */
  get healthRatio(): number {
    return Math.max(0, this.health / this.maxHealth);
  }

  override tick(ctx: EntityContext): void {
    super.tick(ctx);
    if (this.health <= 0) {
      return;
    }
    if (this.phase === WitherPhase.CHARGING) {
      this.tickCharging(ctx);
      return;
    }
    if (this.shootCooldown > 0) {
      this.shootCooldown--;
      return;
    }
    // 射击放在 tick 里（与恶魂 / 烈焰人一致），move 只负责位移
    const player = ctx.player;
    const distance = Math.hypot(player.x - this.x, player.z - this.z);
    if (distance < WITHER_SHOOT_RANGE && !player.isDead) {
      this.shootCooldown = WITHER_SHOOT_COOLDOWN_TICKS;
      this.shootSkull(ctx);
    }
  }

  /** 蓄力：血量逐渐涨到满，涨满就开打并炸开一圈。 */
  private tickCharging(ctx: EntityContext): void {
    this.chargeTicks++;
    this.health = Math.min(this.maxHealth, (this.maxHealth / 2) * (1 + this.chargeTicks / WITHER_CHARGE_TICKS));
    if (this.chargeTicks < WITHER_CHARGE_TICKS) {
      return;
    }
    this.phase = WitherPhase.FIGHTING;
    this.health = this.maxHealth;
    ctx.explode(this.x, this.y, this.z, WITHER_SPAWN_EXPLOSION_RADIUS, this.id);
  }

  override move(ctx: EntityContext, dt: number): void {
    if (this.phase === WitherPhase.CHARGING || this.health <= 0) {
      return;
    }
    const player = ctx.player;
    const targetY = player.y + WITHER_HOVER_HEIGHT;
    const dx = player.x - this.x;
    const dz = player.z - this.z;
    const distance = Math.hypot(dx, dz) || 1;
    // 保持在射程内绕着玩家飘
    const approach = distance > WITHER_SHOOT_RANGE / 2 ? 1 : -0.5;
    this.x += (dx / distance) * WITHER_SPEED * approach * dt;
    this.z += (dz / distance) * WITHER_SPEED * approach * dt;
    this.y += Math.sign(targetY - this.y) * WITHER_SPEED * dt;
    this.yaw = Math.atan2(-dx, -dz);
  }

  /** 朝玩家发一颗凋灵之首。 */
  private shootSkull(ctx: EntityContext): void {
    const player = ctx.player;
    const dx = player.x - this.x;
    const dy = player.y + player.height * 0.6 - this.y;
    const dz = player.z - this.z;
    const distance = Math.hypot(dx, dy, dz) || 1;
    const skull = new WitherSkullEntity(this.id);
    skull.setPosition(this.x, this.y, this.z);
    skull.vx = (dx / distance) * WITHER_SKULL_SPEED;
    skull.vy = (dy / distance) * WITHER_SKULL_SPEED;
    skull.vz = (dz / distance) * WITHER_SKULL_SPEED;
    ctx.spawnEntity(skull);
    ctx.playSound('fizz', this.x, this.y, this.z);
  }

  protected override onDeath(ctx: EntityContext, byPlayer: boolean): void {
    ctx.onEntityKilled(this, byPlayer);
  }

  /** 凋灵不存档（打完就没了；没打完时离开世界视为消失）。 */
  serialize(): EntitySaveData | null {
    return null;
  }
}

/** 凋灵蓄力完成时的爆炸半径。 */
const WITHER_SPAWN_EXPLOSION_RADIUS = 5;
