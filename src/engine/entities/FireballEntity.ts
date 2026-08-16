/**
 * 火球：恶魂的大火球（撞到就爆炸、可被玩家击退反弹）与烈焰人的小火球（点燃目标）。
 * 与箭一样走直线不受重力，只是命中效果不同。
 */

import { DIFFICULTY_DAMAGE_MULTIPLIER } from '../constants/game';
import {
  FIREBALL_EXPLOSION_RADIUS,
  FIREBALL_LIFETIME_TICKS,
  SMALL_FIREBALL_DAMAGE,
  SMALL_FIREBALL_IGNITE_TICKS,
} from '../constants/mobs';
import { Entity, type EntitySaveData } from './Entity';
import type { EntityContext } from './EntityContext';
import { LivingEntity } from './LivingEntity';

const FIREBALL_SIZE = 0.5;
const SMALL_FIREBALL_SIZE = 0.3;
/** 找被砸中的生物时的搜索半径。 */
const HIT_SEARCH_RADIUS = 3;

/** 火球种类。 */
export const FireballKind = { LARGE: 'large', SMALL: 'small' } as const;
export type FireballKind = (typeof FireballKind)[keyof typeof FireballKind];

/** 恶魂 / 烈焰人的火球。 */
export class FireballEntity extends Entity {
  readonly type = 'fireball';
  /** 被玩家打中后会掉头飞回去（1.8.9 的反弹恶魂火球）。 */
  reflected = false;

  constructor(
    readonly kind: FireballKind,
    public shooterId: number,
    id?: number,
  ) {
    super(id);
    const size = kind === FireballKind.LARGE ? FIREBALL_SIZE : SMALL_FIREBALL_SIZE;
    this.width = size;
    this.height = size;
    this.hasGravity = false;
  }

  override tick(_ctx: EntityContext): void {
    this.age++;
    if (this.age > FIREBALL_LIFETIME_TICKS) {
      this.isDead = true;
    }
  }

  override move(ctx: EntityContext, dt: number): void {
    if (this.isDead) {
      return;
    }
    const nx = this.x + this.vx * dt;
    const ny = this.y + this.vy * dt;
    const nz = this.z + this.vz * dt;
    if (ctx.world.isSolidAt(Math.floor(nx), Math.floor(ny), Math.floor(nz))) {
      this.impact(ctx);
      return;
    }
    this.x = nx;
    this.y = ny;
    this.z = nz;
    const target = this.findHitEntity(ctx);
    if (target) {
      this.hitEntity(ctx, target);
    }
  }

  private findHitEntity(ctx: EntityContext): LivingEntity | null {
    for (const e of ctx.livingEntitiesNear(this.x, this.y, this.z, HIT_SEARCH_RADIUS)) {
      if (e.id === this.shooterId || e.isDying) {
        continue;
      }
      const box = e.box();
      if (
        this.x >= box.minX &&
        this.x <= box.maxX &&
        this.y >= box.minY &&
        this.y <= box.maxY &&
        this.z >= box.minZ &&
        this.z <= box.maxZ
      ) {
        return e;
      }
    }
    return null;
  }

  private hitEntity(ctx: EntityContext, target: LivingEntity): void {
    if (this.kind === FireballKind.SMALL) {
      target.setOnFire(SMALL_FIREBALL_IGNITE_TICKS);
      target.hurt(ctx, SMALL_FIREBALL_DAMAGE * DIFFICULTY_DAMAGE_MULTIPLIER[ctx.difficulty], this);
      this.isDead = true;
      return;
    }
    this.impact(ctx);
  }

  /** 命中：大火球炸开，小火球在原地点一小撮火。 */
  private impact(ctx: EntityContext): void {
    this.isDead = true;
    if (this.kind === FireballKind.LARGE) {
      ctx.explode(this.x, this.y, this.z, FIREBALL_EXPLOSION_RADIUS, this.shooterId);
      return;
    }
    ctx.igniteAt(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z));
  }

  /** 被玩家击中：掉头飞回去，之后由玩家"负责"这一发。 */
  reflect(byId: number): void {
    this.vx = -this.vx;
    this.vy = -this.vy;
    this.vz = -this.vz;
    this.shooterId = byId;
    this.reflected = true;
  }

  /** 序列化（飞行中的火球不存档）。 */
  serialize(): EntitySaveData | null {
    return null;
  }
}
