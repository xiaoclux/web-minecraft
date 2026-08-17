import { SPLASH_POTION_GRAVITY, SPLASH_POTION_LIFETIME_TICKS } from '../constants/mobs';
import { Entity, type EntitySaveData } from './Entity';
import type { EntityContext } from './EntityContext';
import type { LivingEntity } from './LivingEntity';
import { findLivingEntityAt } from './projectileHit';

const THROWN_SIZE = 0.25;

/**
 * 扔出去的东西（喷溅药水、雪球、鸡蛋）的共同部分：抛物线飞行，撞到方块或生物就落地。
 * 具体撞上之后发生什么由 Game 按子类结算。
 * 扔出的头几 tick 不会撞到扔的人自己（出手时投掷物就在他的包围盒里）。
 */
export abstract class ThrownEntity extends Entity {
  /** 落点；null 表示还在飞。Game 读取后结算并移除实体。 */
  impact: { x: number; y: number; z: number } | null = null;
  /** 砸中的生物；只撞到方块时为 null。 */
  hitEntity: LivingEntity | null = null;

  constructor(
    readonly throwerId: number,
    id?: number,
  ) {
    super(id);
    this.width = THROWN_SIZE;
    this.height = THROWN_SIZE;
    this.hasGravity = false;
  }

  override tick(_ctx: EntityContext): void {
    this.age++;
    if (this.age > SPLASH_POTION_LIFETIME_TICKS) {
      this.isDead = true;
    }
  }

  override move(ctx: EntityContext, dt: number): void {
    if (this.impact || this.isDead) {
      return;
    }
    this.vy -= SPLASH_POTION_GRAVITY * dt;
    const nx = this.x + this.vx * dt;
    const ny = this.y + this.vy * dt;
    const nz = this.z + this.vz * dt;
    if (ctx.world.isSolidAt(Math.floor(nx), Math.floor(ny), Math.floor(nz))) {
      this.impact = { x: this.x, y: this.y, z: this.z };
      return;
    }
    this.x = nx;
    this.y = ny;
    this.z = nz;
    const hit = findLivingEntityAt(ctx, this.x, this.y, this.z, this.throwerId);
    if (hit) {
      this.hitEntity = hit;
      this.impact = { x: this.x, y: this.y, z: this.z };
    }
  }

  /** 飞行中的投掷物不存档。 */
  serialize(): EntitySaveData | null {
    return null;
  }
}
