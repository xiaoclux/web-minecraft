import { ARROW_DAMAGE, ARROW_GRAVITY, ARROW_LIFETIME_TICKS } from '../constants/mobs';
import { DIFFICULTY_DAMAGE_MULTIPLIER } from '../constants/game';
import { Entity, type EntitySaveData } from './Entity';
import type { EntityContext } from './EntityContext';
import { findLivingEntityAt } from './projectileHit';

const ARROW_SIZE = 0.3;
const STUCK_LIFETIME_TICKS = 100;

/** 箭矢：直线飞行受重力，命中方块后停留一段时间。 */
export class ArrowEntity extends Entity {
  readonly type = 'arrow';
  isStuck = false;
  private stuckTicks = 0;

  constructor(
    public readonly shooterId: number,
    public readonly fromPlayer: boolean,
    /** 命中的基础伤害（玩家射的箭按拉弓程度传进来）。 */
    public readonly damage: number = ARROW_DAMAGE,
    id?: number,
  ) {
    super(id);
    this.width = ARROW_SIZE;
    this.height = ARROW_SIZE;
    this.hasGravity = false;
  }

  override tick(_ctx: EntityContext): void {
    this.age++;
    if (this.age > ARROW_LIFETIME_TICKS) {
      this.isDead = true;
      return;
    }
    if (this.isStuck) {
      this.stuckTicks++;
      if (this.stuckTicks > STUCK_LIFETIME_TICKS) {
        this.isDead = true;
      }
    }
  }

  override move(ctx: EntityContext, dt: number): void {
    if (this.isStuck || this.isDead) {
      return;
    }
    this.vy -= ARROW_GRAVITY * dt;
    const nx = this.x + this.vx * dt;
    const ny = this.y + this.vy * dt;
    const nz = this.z + this.vz * dt;
    if (ctx.world.isSolidAt(Math.floor(nx), Math.floor(ny), Math.floor(nz))) {
      this.isStuck = true;
      this.vx = 0;
      this.vy = 0;
      this.vz = 0;
      return;
    }
    this.x = nx;
    this.y = ny;
    this.z = nz;
    this.yaw = Math.atan2(-this.vx, -this.vz);
    this.pitch = Math.atan2(this.vy, Math.hypot(this.vx, this.vz));
    this.checkHit(ctx);
  }

  private checkHit(ctx: EntityContext): void {
    if (this.fromPlayer) {
      this.checkHitMob(ctx);
      return;
    }
    const player = ctx.player;
    if (player.isDead) {
      return;
    }
    if (player.box().containsPoint(this.x, this.y, this.z)) {
      ctx.hurtPlayer(this.damage * DIFFICULTY_DAMAGE_MULTIPLIER[ctx.difficulty], this);
      this.isDead = true;
    }
  }

  /** 玩家射出的箭：撞到哪只生物就打哪只（射手自己除外）。 */
  private checkHitMob(ctx: EntityContext): void {
    const target = findLivingEntityAt(ctx, this.x, this.y, this.z, this.shooterId);
    if (target) {
      target.hurt(ctx, this.damage, ctx.player, true);
      this.isDead = true;
    }
  }

  /** 序列化（箭矢不存档，返回 null）。 */
  serialize(): EntitySaveData | null {
    return null;
  }
}
