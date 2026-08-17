/**
 * 末影龙：绕着主岛中心盘旋，隔一阵子朝玩家俯冲一次，撞到就打人并把沿途方块撞碎；
 * 只要还有末影水晶活着就会被持续回血。血条由 HUD 显示，击杀后掉大量经验并开启返回传送门。
 */

import { getBlock } from '../blocks/BlockRegistry';
import {
  DRAGON_CHARGE_COOLDOWN_TICKS,
  DRAGON_CHARGE_DAMAGE,
  DRAGON_CHARGE_SPEED,
  DRAGON_CIRCLE_RADIUS,
  DRAGON_CIRCLE_SPEED,
  DRAGON_CRUISE_HEIGHT,
  DRAGON_HEAL_PER_CRYSTAL,
  DRAGON_HEAL_INTERVAL_TICKS,
  DRAGON_HIT_RANGE,
  DRAGON_MAX_HEALTH,
  DRAGON_WRECK_RADIUS,
} from '../constants/mobs';
import type { EntitySaveData } from './Entity';
import type { EntityContext } from './EntityContext';
import { LivingEntity } from './LivingEntity';

const DRAGON_WIDTH = 6;
const DRAGON_HEIGHT = 3;

/** 记录多少个历史位置供身体分段跟随（越长尾巴甩得越开）。 */
const HISTORY_LENGTH = 24;
/** 历史采样的字段数：x, y, z, yaw。 */
const HISTORY_STRIDE = 4;

/** 末影龙的行为阶段。 */
export const DragonPhase = {
  /** 绕岛盘旋。 */
  CIRCLE: 'circle',
  /** 朝玩家俯冲。 */
  CHARGE: 'charge',
} as const;
export type DragonPhase = (typeof DragonPhase)[keyof typeof DragonPhase];

/** 末影龙。 */
export class EnderDragonEntity extends LivingEntity {
  readonly type = 'ender_dragon';
  phase: DragonPhase = DragonPhase.CIRCLE;
  /** 盘旋角度。 */
  private angle = 0;
  private chargeCooldown = DRAGON_CHARGE_COOLDOWN_TICKS;
  private healTimer = 0;
  /** 最近若干帧的位置与朝向（环形缓冲），脖子与尾巴按不同延迟跟着它走。 */
  private readonly history = new Float32Array(HISTORY_LENGTH * HISTORY_STRIDE);
  private historyHead = -1;

  constructor(
    /** 盘旋中心（主岛中心）。 */
    readonly centerX: number,
    readonly centerZ: number,
    id?: number,
  ) {
    super(DRAGON_MAX_HEALTH, id);
    this.width = DRAGON_WIDTH;
    this.height = DRAGON_HEIGHT;
    this.hasGravity = false;
  }

  /** 血量比例（血条用）。 */
  get healthRatio(): number {
    return Math.max(0, this.health / this.maxHealth);
  }

  override tick(ctx: EntityContext): void {
    super.tick(ctx);
    if (this.health <= 0) {
      return;
    }
    this.tickCrystalHeal(ctx);
    if (this.chargeCooldown > 0) {
      this.chargeCooldown--;
    }
    if (this.phase === DragonPhase.CIRCLE && this.chargeCooldown === 0 && !ctx.player.isDead) {
      this.phase = DragonPhase.CHARGE;
    }
  }

  /** 每隔一段时间，被每颗存活的水晶回一次血。 */
  private tickCrystalHeal(ctx: EntityContext): void {
    this.healTimer++;
    if (this.healTimer < DRAGON_HEAL_INTERVAL_TICKS) {
      return;
    }
    this.healTimer = 0;
    let crystals = 0;
    for (const e of ctx.crystalsNear(this.x, this.y, this.z)) {
      if (!e.isDead) {
        crystals++;
      }
    }
    if (crystals > 0) {
      this.heal(crystals * DRAGON_HEAL_PER_CRYSTAL);
    }
  }

  override move(ctx: EntityContext, dt: number): void {
    this.recordHistory();
    if (this.health <= 0) {
      // 死亡动画期间缓缓上升
      this.y += dt;
      return;
    }
    if (this.phase === DragonPhase.CHARGE) {
      this.moveCharge(ctx, dt);
      return;
    }
    this.moveCircle(ctx, dt);
  }

  /** 盘旋：沿圆周飞，高度固定在岛面之上。 */
  private moveCircle(ctx: EntityContext, dt: number): void {
    this.angle += DRAGON_CIRCLE_SPEED * dt;
    const targetX = this.centerX + Math.cos(this.angle) * DRAGON_CIRCLE_RADIUS;
    const targetZ = this.centerZ + Math.sin(this.angle) * DRAGON_CIRCLE_RADIUS;
    const targetY = ctx.player.y + DRAGON_CRUISE_HEIGHT;
    this.approach(targetX, targetY, targetZ, DRAGON_CIRCLE_SPEED * DRAGON_CIRCLE_RADIUS, dt);
  }

  /** 俯冲：直扑玩家，撞到就打人，冲过头就回到盘旋。 */
  private moveCharge(ctx: EntityContext, dt: number): void {
    const player = ctx.player;
    this.approach(player.x, player.y + 1, player.z, DRAGON_CHARGE_SPEED, dt);
    this.wreckBlocks(ctx);
    const distance = Math.hypot(player.x - this.x, player.y - this.y, player.z - this.z);
    if (distance < DRAGON_HIT_RANGE) {
      ctx.hurtPlayer(DRAGON_CHARGE_DAMAGE, this);
      player.applyKnockback(this.x, this.z);
      this.endCharge();
      return;
    }
    // 冲太久没撞到也收手
    if (this.chargeCooldown === 0) {
      this.chargeCooldown = -1;
    }
    if (this.chargeCooldown === -1 && distance > DRAGON_CIRCLE_RADIUS * 1.5) {
      this.endCharge();
    }
  }

  private endCharge(): void {
    this.phase = DragonPhase.CIRCLE;
    this.chargeCooldown = DRAGON_CHARGE_COOLDOWN_TICKS;
  }

  /**
   * 取 stepsAgo 帧之前的位置与朝向；历史还没攒够时退回当前状态。
   * 渲染端用它摆脖子与尾巴的分段，让身体像蛇一样跟着头走。
   * @param stepsAgo 0 表示当前帧
   */
  sampleHistory(stepsAgo: number, out: { x: number; y: number; z: number; yaw: number }): void {
    if (this.historyHead < 0) {
      out.x = this.x;
      out.y = this.y;
      out.z = this.z;
      out.yaw = this.yaw;
      return;
    }
    const index = ((this.historyHead - Math.min(stepsAgo, HISTORY_LENGTH - 1)) % HISTORY_LENGTH + HISTORY_LENGTH) % HISTORY_LENGTH;
    const base = index * HISTORY_STRIDE;
    out.x = this.history[base];
    out.y = this.history[base + 1];
    out.z = this.history[base + 2];
    out.yaw = this.history[base + 3];
  }

  /** 把当前位置压进历史缓冲。 */
  private recordHistory(): void {
    this.historyHead = (this.historyHead + 1) % HISTORY_LENGTH;
    const base = this.historyHead * HISTORY_STRIDE;
    this.history[base] = this.x;
    this.history[base + 1] = this.y;
    this.history[base + 2] = this.z;
    this.history[base + 3] = this.yaw;
  }

  /** 朝目标点飞，同时把朝向转过去。 */
  private approach(tx: number, ty: number, tz: number, speed: number, dt: number): void {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dz = tz - this.z;
    const distance = Math.hypot(dx, dy, dz) || 1;
    const step = Math.min(distance, speed * dt);
    this.x += (dx / distance) * step;
    this.y += (dy / distance) * step;
    this.z += (dz / distance) * step;
    this.yaw = Math.atan2(-dx, -dz);
  }

  /** 俯冲时撞碎路过的方块（基岩与黑曜石撞不动，和 1.8.9 一样）。 */
  private wreckBlocks(ctx: EntityContext): void {
    const cx = Math.floor(this.x);
    const cy = Math.floor(this.y);
    const cz = Math.floor(this.z);
    for (let dy = 0; dy <= DRAGON_WRECK_RADIUS; dy++) {
      for (let dz = -DRAGON_WRECK_RADIUS; dz <= DRAGON_WRECK_RADIUS; dz++) {
        for (let dx = -DRAGON_WRECK_RADIUS; dx <= DRAGON_WRECK_RADIUS; dx++) {
          const id = ctx.world.getBlock(cx + dx, cy + dy, cz + dz);
          if (id === 0 || getBlock(id).isBlastResistant === false || getBlock(id).hardness < 0) {
            continue;
          }
          ctx.world.setBlock(cx + dx, cy + dy, cz + dz, 0);
        }
      }
    }
  }

  protected override onDeath(ctx: EntityContext, byPlayer: boolean): void {
    // 交给 Game 发经验、开返回传送门、放龙蛋
    ctx.onEntityKilled(this, byPlayer);
  }

  /** 末影龙不存档（离开末地后由 Game 按需重建）。 */
  serialize(): EntitySaveData | null {
    return null;
  }
}
