/**
 * 凋灵之首：凋灵发射的黑色弹丸，命中生物会造成伤害并附加凋零效果，撞墙则炸开一小片。
 */

import { DIFFICULTY_DAMAGE_MULTIPLIER } from '../constants/game';
import {
  WITHER_SKULL_DAMAGE,
  WITHER_SKULL_EFFECT_TICKS,
  WITHER_SKULL_EXPLOSION_RADIUS,
  WITHER_SKULL_LIFETIME_TICKS,
} from '../constants/mobs';
import { EffectId } from './effects';
import { Entity, type EntitySaveData } from './Entity';
import type { EntityContext } from './EntityContext';
import type { LivingEntity } from './LivingEntity';

const SKULL_SIZE = 0.4;
/** 找被砸中的生物时的搜索半径。 */
const HIT_SEARCH_RADIUS = 3;

/** 凋灵之首。 */
export class WitherSkullEntity extends Entity {
  readonly type = 'wither_skull';

  constructor(
    readonly shooterId: number,
    id?: number,
  ) {
    super(id);
    this.width = SKULL_SIZE;
    this.height = SKULL_SIZE;
    this.hasGravity = false;
  }

  override tick(_ctx: EntityContext): void {
    this.age++;
    if (this.age > WITHER_SKULL_LIFETIME_TICKS) {
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
      this.explode(ctx);
      return;
    }
    this.x = nx;
    this.y = ny;
    this.z = nz;
    const target = this.findHitEntity(ctx);
    if (target) {
      target.addEffect(EffectId.WITHER, WITHER_SKULL_EFFECT_TICKS, 0, ctx);
      target.hurt(ctx, WITHER_SKULL_DAMAGE * DIFFICULTY_DAMAGE_MULTIPLIER[ctx.difficulty], this);
      this.isDead = true;
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

  private explode(ctx: EntityContext): void {
    this.isDead = true;
    ctx.explode(this.x, this.y, this.z, WITHER_SKULL_EXPLOSION_RADIUS, this.shooterId);
  }

  /** 飞行中的弹丸不存档。 */
  serialize(): EntitySaveData | null {
    return null;
  }
}
