import { FISHING_MAX_WAIT_TICKS, FISHING_MIN_WAIT_TICKS } from '../constants/game';
import { Entity, type EntitySaveData } from './Entity';
import type { EntityContext } from './EntityContext';

const BOBBER_SIZE = 0.25;
/** 抛出去时的重力（比投掷物轻一些，弧线更平）。 */
const BOBBER_GRAVITY = 12;
/** 落水之后上下浮动的幅度与速度。 */
const BOB_AMPLITUDE = 0.05;
const BOB_SPEED = 3;

/**
 * 钓鱼浮漂：抛出去飞一段，落到水面就开始等鱼咬钩。
 * 咬钩之后 `hasBite` 变 true，玩家再右键收竿就有收获（由 Game 结算）。
 */
export class FishingBobberEntity extends Entity {
  readonly type = 'fishing_bobber';
  /** 已经落在水面上。 */
  inWaterSurface = false;
  /** 鱼咬钩了。 */
  hasBite = false;
  private waitTicks = 0;
  private surfaceY = 0;

  constructor(id?: number) {
    super(id);
    this.width = BOBBER_SIZE;
    this.height = BOBBER_SIZE;
    this.hasGravity = false;
  }

  override tick(ctx: EntityContext): void {
    this.age++;
    if (!this.inWaterSurface) {
      return;
    }
    if (this.waitTicks > 0) {
      this.waitTicks--;
      return;
    }
    if (!this.hasBite) {
      this.hasBite = true;
      // 咬钩时溅一下水花，提示玩家收竿
      ctx.playSound('splash', this.x, this.y, this.z);
    }
  }

  override move(ctx: EntityContext, dt: number): void {
    if (this.isDead) {
      return;
    }
    if (this.inWaterSurface) {
      // 咬钩前小幅上下浮动，咬钩后往下一沉
      this.y = this.surfaceY + (this.hasBite ? -BOB_AMPLITUDE * 2 : Math.sin(this.age * BOB_SPEED * dt) * BOB_AMPLITUDE);
      return;
    }
    this.vy -= BOBBER_GRAVITY * dt;
    const nx = this.x + this.vx * dt;
    const ny = this.y + this.vy * dt;
    const nz = this.z + this.vz * dt;
    const world = ctx.world;
    if (world.isLiquidAt(Math.floor(nx), Math.floor(ny), Math.floor(nz))) {
      this.landOnWater(ctx, nx, Math.floor(ny) + 1, nz);
      return;
    }
    if (world.isSolidAt(Math.floor(nx), Math.floor(ny), Math.floor(nz))) {
      // 砸到地上就算这一竿废了
      this.isDead = true;
      return;
    }
    this.x = nx;
    this.y = ny;
    this.z = nz;
  }

  private landOnWater(ctx: EntityContext, x: number, surfaceY: number, z: number): void {
    this.inWaterSurface = true;
    this.surfaceY = surfaceY;
    this.setPosition(x, surfaceY, z);
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.waitTicks =
      FISHING_MIN_WAIT_TICKS + Math.floor(ctx.random() * (FISHING_MAX_WAIT_TICKS - FISHING_MIN_WAIT_TICKS));
    ctx.playSound('splash', x, surfaceY, z);
  }

  /** 浮漂不存档（收竿或退出就没了）。 */
  serialize(): EntitySaveData | null {
    return null;
  }
}
