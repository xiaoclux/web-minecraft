/**
 * 矿车：沿着铁轨跑的载具。铁轨决定它往哪走（直轨沿轴、拐弯轨换轴），
 * 动力铁轨通电时加速、断电时刹车；不在轨道上时就当普通实体自由落体。
 * 玩家右键上车、下蹲或再次右键下车；车会带着玩家一起动。
 */

import { BlockId } from '../blocks/BlockRegistry';
import {
  MINECART_BRAKE_FACTOR,
  MINECART_DRAG,
  MINECART_MAX_SPEED,
  MINECART_POWERED_ACCEL,
  RAIL_SHAPE_MASK,
  RailShape,
} from '../constants/redstone';
import { Entity, type EntitySaveData } from './Entity';
import type { EntityContext } from './EntityContext';

const MINECART_WIDTH = 0.98;
const MINECART_HEIGHT = 0.7;

/** 矿车。 */
export class MinecartEntity extends Entity {
  readonly type = 'minecart';
  /** 车上的乘客实体 id（目前只可能是玩家）。 */
  riderId: number | null = null;

  constructor(id?: number) {
    super(id);
    this.width = MINECART_WIDTH;
    this.height = MINECART_HEIGHT;
  }

  override tick(_ctx: EntityContext): void {
    this.age++;
  }

  override move(ctx: EntityContext, dt: number): void {
    const bx = Math.floor(this.x);
    const by = Math.floor(this.y);
    const bz = Math.floor(this.z);
    const railInfo = railAt(ctx, bx, by, bz);
    if (!railInfo) {
      // 不在轨道上：走普通物理（会掉下去）
      this.hasGravity = true;
      super.move(ctx, dt);
      return;
    }
    this.hasGravity = false;
    this.followRail(ctx, railInfo, bx, by, bz, dt);
  }

  /** 沿轨道推进：把速度投影到轨道方向上，再按动力轨加速 / 刹车。 */
  private followRail(
    ctx: EntityContext,
    rail: { shape: number; powered: boolean },
    bx: number,
    by: number,
    bz: number,
    dt: number,
  ): void {
    const [ax, az] = railAxis(rail.shape);
    // 只保留沿轨方向的速度分量
    let speed = this.vx * ax + this.vz * az;
    if (rail.powered) {
      // 动力轨：顺着当前方向加速；停着的话朝车头方向起步
      const direction = speed === 0 ? 1 : Math.sign(speed);
      speed += MINECART_POWERED_ACCEL * dt * direction;
    } else if (ctx.world.getBlock(bx, by, bz) === BlockId.POWERED_RAIL) {
      // 没通电的动力轨是刹车
      speed *= MINECART_BRAKE_FACTOR;
    } else {
      speed *= 1 - MINECART_DRAG * dt;
    }
    speed = Math.max(-MINECART_MAX_SPEED, Math.min(MINECART_MAX_SPEED, speed));
    this.vx = ax * speed;
    this.vz = az * speed;
    this.vy = 0;
    // 贴着轨道中心线走，避免歪出轨
    const centerX = bx + 0.5;
    const centerZ = bz + 0.5;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.y = by + RAIL_RIDE_HEIGHT;
    if (ax === 0) {
      this.x = centerX;
    } else {
      this.z = centerZ;
    }
    this.yaw = Math.atan2(-this.vx, -this.vz);
    this.onGround = true;
  }

  serialize(): EntitySaveData {
    return { ...this.serializeBase(), type: this.type };
  }

  static deserialize(data: EntitySaveData): MinecartEntity {
    const cart = new MinecartEntity(data.id);
    cart.setPosition(data.x, data.y, data.z);
    cart.vx = data.vx;
    cart.vy = data.vy;
    cart.vz = data.vz;
    cart.yaw = data.yaw;
    return cart;
  }
}

/** 矿车坐在轨道上时的离地高度。 */
const RAIL_RIDE_HEIGHT = 0.1;

/** 该格是不是铁轨；是的话返回轨道形状与是否通电。 */
export function railAt(
  ctx: EntityContext,
  x: number,
  y: number,
  z: number,
): { shape: number; powered: boolean } | null {
  const id = ctx.world.getBlock(x, y, z);
  if (id !== BlockId.RAIL && id !== BlockId.POWERED_RAIL) {
    return null;
  }
  const meta = ctx.world.getMeta(x, y, z);
  return {
    shape: meta & RAIL_SHAPE_MASK,
    powered: id === BlockId.POWERED_RAIL && (meta & POWERED_RAIL_ON_BIT) !== 0,
  };
}

/** 动力铁轨 meta 里"通电"的位。 */
export const POWERED_RAIL_ON_BIT = 8;

/** 轨道形状对应的行进轴（单位向量）。 */
export function railAxis(shape: number): [number, number] {
  return shape === RailShape.NORTH_SOUTH ? [0, 1] : [1, 0];
}
