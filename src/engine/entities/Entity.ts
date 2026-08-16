import {
  GRAVITY,
  TERMINAL_VELOCITY,
  WATER_CLIMB_VELOCITY,
  WATER_GRAVITY,
  WATER_TERMINAL_VELOCITY,
} from '../constants/game';
import { WATER_PUSH_ACCEL } from '../constants/fluids';
import { AABB } from '../physics/AABB';
import { isBoxBlocked, isBoxInLiquid, isBoxTouchingLiquid, moveWithCollisions } from '../physics/collision';
import type { EntityContext } from './EntityContext';
import type { World } from '../world/World';

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
/** 判定“身体在水中”时忽略的顶部高度（1.8 为 0.4）与最小身体高度。 */
const WATER_BODY_TOP_MARGIN = 0.4;
const WATER_BODY_MIN_HEIGHT = 0.2;
/** 攀岸探测：前方探测距离、可攀台阶最大高度（相对脚部）、触发所需的最小水平位移。 */
const WATER_CLIMB_PROBE_DISTANCE = 0.3;
const WATER_CLIMB_MAX_HEIGHT = 1.8;
const WATER_CLIMB_MIN_MOVE = 1e-4;
/** 采样水流方向的高度（脚上方）。 */
const WATER_FLOW_SAMPLE_HEIGHT = 0.3;

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
  /** 上一次移动是否在水平方向撞到方块。 */
  collidedHorizontally = false;
  /** 水中攀岸的目标脚部高度；null 表示未在攀爬。 */
  private climbTargetY: number | null = null;
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
    const wantedDx = this.vx * dt;
    const wantedDz = this.vz * dt;
    const result = moveWithCollisions(world, before, wantedDx, this.vy * dt, wantedDz);
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
    this.collidedHorizontally = result.collidedX || result.collidedZ;
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
      const flow = ctx.waterFlowAt(
        Math.floor(this.x),
        Math.floor(this.y + WATER_FLOW_SAMPLE_HEIGHT),
        Math.floor(this.z),
      );
      this.vx += flow.x * WATER_PUSH_ACCEL * dt;
      this.vz += flow.z * WATER_PUSH_ACCEL * dt;
    }
    this.updateWaterClimb(world, wantedDx, wantedDz);
  }

  /**
   * 水中贴墙自动攀上岸（对应 1.8 游泳撞墙时 motionY = 0.3）：
   * 身体下部碰到水、水平方向被挡、且前方台阶顶不高于 WATER_CLIMB_MAX_HEIGHT 并有站立空间时，
   * 持续给向上速度直到脚高过台阶顶；离开水后只要仍在攀爬中且还顶着墙就继续，避免半途落回水里。
   */
  private updateWaterClimb(world: World, wantedDx: number, wantedDz: number): void {
    const horizontal = Math.hypot(wantedDx, wantedDz);
    if (!this.collidedHorizontally || horizontal < WATER_CLIMB_MIN_MOVE) {
      this.climbTargetY = null;
      return;
    }
    const box = this.box();
    const bodyTop = box.minY + Math.max(WATER_BODY_MIN_HEIGHT, this.height - WATER_BODY_TOP_MARGIN);
    const body = new AABB(box.minX, box.minY, box.minZ, box.maxX, bodyTop, box.maxZ);
    const touchesWater = this.inWater || isBoxTouchingLiquid(world, body);
    if (this.climbTargetY === null && !touchesWater) {
      return;
    }
    if (this.climbTargetY !== null && this.y >= this.climbTargetY) {
      this.climbTargetY = null;
      return;
    }
    if (this.climbTargetY === null) {
      const dirX = (wantedDx / horizontal) * WATER_CLIMB_PROBE_DISTANCE;
      const dirZ = (wantedDz / horizontal) * WATER_CLIMB_PROBE_DISTANCE;
      const ledgeTop = this.findLedgeTop(world, box.offset(dirX, 0, dirZ));
      if (ledgeTop === null || ledgeTop - this.y > WATER_CLIMB_MAX_HEIGHT) {
        return;
      }
      this.climbTargetY = ledgeTop;
    }
    this.vy = Math.max(this.vy, WATER_CLIMB_VELOCITY);
  }

  /** 前方包围盒从脚所在高度往上找第一个能容纳整个身体的台阶顶高度；找不到返回 null。 */
  private findLedgeTop(world: World, ahead: AABB): number | null {
    const feet = Math.floor(ahead.minY);
    for (let y = feet + 1; y <= feet + WATER_CLIMB_MAX_HEIGHT + 1; y++) {
      const candidate = new AABB(ahead.minX, y, ahead.minZ, ahead.maxX, y + this.height, ahead.maxZ);
      if (!isBoxBlocked(world, candidate)) {
        return y;
      }
    }
    return null;
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

  /** 与另一实体的距离平方。 */
  distanceSqTo(other: Entity): number {
    return this.distanceSqToPoint(other.x, other.y, other.z);
  }

  /** 与某个点的距离平方（比较范围时用平方，省掉开方）。 */
  distanceSqToPoint(x: number, y: number, z: number): number {
    const dx = x - this.x;
    const dy = y - this.y;
    const dz = z - this.z;
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
