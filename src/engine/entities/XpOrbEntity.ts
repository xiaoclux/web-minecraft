import {
  XP_ORB_ATTRACT_ACCEL,
  XP_ORB_ATTRACT_RANGE,
  XP_ORB_DESPAWN_TICKS,
  XP_ORB_PICKUP_RANGE,
  XP_ORB_SIZE,
} from '../constants/game';
import { Entity, type EntitySaveData } from './Entity';
import type { EntityContext } from './EntityContext';

/**
 * 经验球：会被附近的玩家吸过去，碰到就加经验。
 * 和 1.8.9 一样按数量分成若干颗（拆分由生成方决定）。
 */
export class XpOrbEntity extends Entity {
  readonly type = 'xp_orb';

  constructor(
    public amount: number,
    id?: number,
  ) {
    super(id);
    this.width = XP_ORB_SIZE;
    this.height = XP_ORB_SIZE;
  }

  override move(ctx: EntityContext, dt: number): void {
    super.move(ctx, dt);
    this.applyHorizontalFriction(dt);
    if (this.inWater) {
      this.vy += 6 * dt;
    }
  }

  override tick(ctx: EntityContext): void {
    super.tick(ctx);
    if (this.age > XP_ORB_DESPAWN_TICKS) {
      this.isDead = true;
      return;
    }
    const player = ctx.player;
    if (player.isDead) {
      return;
    }
    const dx = player.x - this.x;
    const dy = player.y + player.height / 2 - this.y;
    const dz = player.z - this.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq < XP_ORB_PICKUP_RANGE * XP_ORB_PICKUP_RANGE) {
      player.addXp(this.amount);
      ctx.playSound('pickup', this.x, this.y, this.z);
      this.isDead = true;
      return;
    }
    if (distSq < XP_ORB_ATTRACT_RANGE * XP_ORB_ATTRACT_RANGE) {
      const dist = Math.sqrt(distSq) || 1;
      const accel = XP_ORB_ATTRACT_ACCEL / 20;
      this.vx += (dx / dist) * accel;
      this.vy += (dy / dist) * accel;
      this.vz += (dz / dist) * accel;
    }
  }

  /** 序列化。 */
  serialize(): EntitySaveData {
    return { ...this.serializeBase(), amount: this.amount };
  }

  /** 反序列化。 */
  static deserialize(data: EntitySaveData): XpOrbEntity {
    const e = new XpOrbEntity(typeof data.amount === 'number' ? data.amount : 1, data.id);
    e.setPosition(data.x, data.y, data.z);
    e.age = data.age;
    return e;
  }
}
