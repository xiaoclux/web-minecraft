import { GRAVITY, TERMINAL_VELOCITY, WATER_GRAVITY, WATER_TERMINAL_VELOCITY } from '../constants/game';
import { AABB } from '../physics/AABB';
import { isBoxInLiquid, moveWithCollisions } from '../physics/collision';
import type { EntityContext } from './EntityContext';

let nextEntityId = 1;

/** 重置实体 id 计数（读档后）。 */
export function resetEntityIds(start: number): void {
  nextEntityId = start;
}

/** 分配新实体 id。 */
export function allocateEntityId(): number {
  return nextEntityId++;
}

/** 水中/陆地阻力。 */
const AIR_DRAG = 0.91;
const WATER_DRAG = 0.8;
const GROUND_FRICTION = 0.6;
const DRAG_TICK_BASE = 20;

/** 实体基类：位置、速度、包围盒、基础物理。 */
export abstract class Entity {
  readonly id: number;
  abstract readonly type: string;
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  yaw = 0;
  pitch = 0;
  width = 0.6;
  height = 1.8;
  onGround = false;
  inWater = false;
  isDead = false;
  age = 0;
  /** 是否受重力。 */
  hasGravity = true;
  /** 是否可被方块碰撞阻挡。 */
  hasCollision = true;
  fallDistance = 0;

  constructor(id?: number) {
    this.id = id ?? allocateEntityId();
  }

  /** 包围盒。 */
  box(): AABB {
    return AABB.fromFeet(this.x, this.y, this.z, this.width, this.height);
  }

  /** 设置位置。 */
  setPosition(x: number, y: number, z: number): void {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  /** 每逻辑 tick（20Hz）。 */
  tick(_ctx: EntityContext): void {
    this.age++;
  }

  /** 每帧物理更新（可变 dt）。 */
  move(ctx: EntityContext, dt: number): void {
    this.applyPhysics(ctx, dt);
  }

  /** 应用重力、位移与碰撞。 */
  protected applyPhysics(ctx: EntityContext, dt: number): void {
    const world = ctx.world;
    const before = this.box();
    this.inWater = isBoxInLiquid(world, before, 0.4);
    if (this.hasGravity) {
      const g = this.inWater ? WATER_GRAVITY : GRAVITY;
      const terminal = this.inWater ? WATER_TERMINAL_VELOCITY : TERMINAL_VELOCITY;
      this.vy = Math.max(-terminal, this.vy - g * dt);
    }
    if (!this.hasCollision) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.z += this.vz * dt;
      return;
    }
    const result = moveWithCollisions(world, before, this.vx * dt, this.vy * dt, this.vz * dt);
    const wasFalling = this.vy < 0;
    this.x = (result.box.minX + result.box.maxX) / 2;
    this.y = result.box.minY;
    this.z = (result.box.minZ + result.box.maxZ) / 2;
    if (result.collidedX) {
      this.vx = 0;
    }
    if (result.collidedZ) {
      this.vz = 0;
    }
    if (result.collidedY) {
      if (wasFalling && result.onGround) {
        this.onLand(ctx, this.fallDistance);
        this.fallDistance = 0;
      }
      this.vy = 0;
    }
    this.onGround = result.onGround;
    if (!this.onGround && this.vy < 0) {
      this.fallDistance += -result.dy;
    } else if (this.onGround || this.inWater) {
      this.fallDistance = 0;
    }
    if (this.inWater) {
      this.vy *= Math.pow(WATER_DRAG, dt * DRAG_TICK_BASE);
    }
  }

  /** 对水平速度施加地面摩擦 / 空气阻力（按 tick 归一化）。 */
  protected applyHorizontalFriction(dt: number): void {
    const drag = this.inWater ? WATER_DRAG : AIR_DRAG;
    const factor = Math.pow(drag, dt * DRAG_TICK_BASE);
    const friction = this.onGround ? Math.pow(GROUND_FRICTION, dt * DRAG_TICK_BASE) : 1;
    this.vx *= factor * friction;
    this.vz *= factor * friction;
  }

  /**
   * 把水平速度朝目标速度平滑逼近（用于受控实体：玩家/生物）。
   * @param accel 逼近系数（越大越灵敏）
   */
  protected steerTowards(targetVx: number, targetVz: number, dt: number, accel: number): void {
    const k = Math.min(1, dt * accel);
    this.vx += (targetVx - this.vx) * k;
    this.vz += (targetVz - this.vz) * k;
  }

  /** 着地回调。 */
  protected onLand(_ctx: EntityContext, _fallDistance: number): void {
    // 子类按需实现
  }

  /** 与另一实体的水平距离平方。 */
  distanceSqTo(other: Entity): number {
    const dx = other.x - this.x;
    const dy = other.y - this.y;
    const dz = other.z - this.z;
    return dx * dx + dy * dy + dz * dz;
  }

  /** 眼睛高度。 */
  get eyeY(): number {
    return this.y + this.height * 0.85;
  }

  /** 序列化基础字段。 */
  serializeBase(): EntitySaveData {
    return {
      type: this.type,
      id: this.id,
      x: this.x,
      y: this.y,
      z: this.z,
      vx: this.vx,
      vy: this.vy,
      vz: this.vz,
      yaw: this.yaw,
      age: this.age,
    };
  }
}

/** 实体存档数据。 */
export interface EntitySaveData {
  type: string;
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  age: number;
  [key: string]: unknown;
}
