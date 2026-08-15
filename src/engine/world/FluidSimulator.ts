import { BlockId, getBlock } from '../blocks/BlockRegistry';
import {
  WATER_FALLING_META,
  WATER_FLOW_BLOCKED_COST,
  WATER_FLOW_SEARCH_RANGE,
  WATER_INFINITE_SOURCE_COUNT,
  WATER_MAX_LEVEL,
  WATER_SOURCE_META,
} from '../constants/fluids';
import type { World } from './World';

const SIDES: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const NEIGHBORS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/** 被水冲走的方块回调（用于掉落植物等）。 */
export type WashedListener = (x: number, y: number, z: number, blockId: number) => void;

/**
 * 水的流动模拟（1.8 规则简化版）：
 * 源(0) 向下形成下落水(8)，向侧面按 1..7 递减扩散；失去供给的流动水逐级消退；
 * 两侧都是源且下方稳固的流动水升级为源（无限水）。
 */
export class FluidSimulator {
  private pending = new Set<string>();
  private readonly washedListeners = new Set<WashedListener>();

  constructor(private readonly world: World) {}

  /** 订阅“方块被水冲走”。 */
  onWashed(listener: WashedListener): () => void {
    this.washedListeners.add(listener);
    return () => this.washedListeners.delete(listener);
  }

  /** 待处理位置数（测试 / 调试用）。 */
  get pendingCount(): number {
    return this.pending.size;
  }

  /** 方块变化后：把该位置及六邻中的水加入待更新。 */
  scheduleAround(x: number, y: number, z: number): void {
    this.scheduleIfWater(x, y, z);
    for (const [dx, dy, dz] of NEIGHBORS) {
      this.scheduleIfWater(x + dx, y + dy, z + dz);
    }
  }

  /** 把范围内所有水加入待更新（批量变更 / 读档）。 */
  scheduleArea(minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number): void {
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          this.scheduleIfWater(x, y, z);
        }
      }
    }
  }

  private scheduleIfWater(x: number, y: number, z: number): void {
    if (this.world.getBlock(x, y, z) === BlockId.WATER) {
      this.pending.add(`${x},${y},${z}`);
    }
  }

  /** 处理一轮待更新的水（每 WATER_TICK_INTERVAL 个游戏 tick 调用一次）。 */
  tick(): void {
    if (this.pending.size === 0) {
      return;
    }
    const batch = this.pending;
    this.pending = new Set<string>();
    for (const key of batch) {
      const [x, y, z] = key.split(',').map(Number);
      this.updateWater(x, y, z);
    }
  }

  private updateWater(x: number, y: number, z: number): void {
    const world = this.world;
    if (world.getBlock(x, y, z) !== BlockId.WATER) {
      return;
    }
    let meta = world.getMeta(x, y, z);
    if (meta !== WATER_SOURCE_META) {
      const next = this.recomputeLevel(x, y, z);
      if (next === null) {
        world.setBlock(x, y, z, BlockId.AIR);
        this.scheduleAround(x, y, z);
        return;
      }
      if (next !== meta) {
        world.setMeta(x, y, z, next);
        this.scheduleAround(x, y, z);
        meta = next;
      }
    }
    const spreadLevel = meta === WATER_FALLING_META ? 0 : meta;
    const belowId = world.getBlock(x, y - 1, z);
    if (this.canFlowInto(x, y - 1, z)) {
      this.flowInto(x, y - 1, z, WATER_FALLING_META);
      return;
    }
    const belowSolid = getBlock(belowId).solid;
    const canSpread = meta === WATER_SOURCE_META || belowSolid;
    if (!canSpread || spreadLevel + 1 > WATER_MAX_LEVEL) {
      return;
    }
    for (const [dx, dz] of this.optimalFlowDirections(x, y, z)) {
      if (this.canFlowInto(x + dx, y, z + dz)) {
        this.flowInto(x + dx, y, z + dz, spreadLevel + 1);
      }
    }
  }

  /** 由邻居重新推算流动水的 meta；返回 null 表示应消失。 */
  private recomputeLevel(x: number, y: number, z: number): number | null {
    const world = this.world;
    if (world.getBlock(x, y + 1, z) === BlockId.WATER) {
      return WATER_FALLING_META;
    }
    let min = Infinity;
    let sources = 0;
    for (const [dx, dz] of SIDES) {
      if (world.getBlock(x + dx, y, z + dz) !== BlockId.WATER) {
        continue;
      }
      const m = world.getMeta(x + dx, y, z + dz);
      if (m === WATER_SOURCE_META) {
        sources++;
      }
      min = Math.min(min, m === WATER_FALLING_META ? 0 : m);
    }
    const belowId = world.getBlock(x, y - 1, z);
    const belowStable =
      getBlock(belowId).solid || (belowId === BlockId.WATER && world.getMeta(x, y - 1, z) === WATER_SOURCE_META);
    if (sources >= WATER_INFINITE_SOURCE_COUNT && belowStable) {
      return WATER_SOURCE_META;
    }
    if (min === Infinity || min + 1 > WATER_MAX_LEVEL) {
      return null;
    }
    return min + 1;
  }

  /** 目标位置能否被水占据：空气或非实心、非液体的小方块（草花火把等，会被冲走）。 */
  private canFlowInto(x: number, y: number, z: number): boolean {
    if (y < 0 || !this.world.hasChunkAt(x, z)) {
      return false;
    }
    const def = getBlock(this.world.getBlock(x, y, z));
    return !def.solid && !def.isLiquid;
  }

  private flowInto(x: number, y: number, z: number, meta: number): void {
    const old = this.world.getBlock(x, y, z);
    if (old !== BlockId.AIR) {
      for (const listener of this.washedListeners) {
        listener(x, y, z, old);
      }
    }
    this.world.setBlock(x, y, z, BlockId.WATER, meta);
    this.scheduleAround(x, y, z);
  }

  /** 沿某方向寻找落差的代价（1.8 calculateFlowCost 简化版）。 */
  private flowCost(x: number, y: number, z: number, depth: number, fromDx: number, fromDz: number): number {
    let best = WATER_FLOW_BLOCKED_COST;
    for (const [dx, dz] of SIDES) {
      if (dx === -fromDx && dz === -fromDz) {
        continue;
      }
      const nx = x + dx;
      const nz = z + dz;
      if (!this.isPassable(nx, y, nz)) {
        continue;
      }
      if (this.canFlowInto(nx, y - 1, nz)) {
        return depth;
      }
      if (depth < WATER_FLOW_SEARCH_RANGE) {
        best = Math.min(best, this.flowCost(nx, y, nz, depth + 1, dx, dz));
      }
    }
    return best;
  }

  /** 搜索路径上可穿过：非实心且不是水源（流动水可以穿过）。 */
  private isPassable(x: number, y: number, z: number): boolean {
    if (!this.world.hasChunkAt(x, z)) {
      return false;
    }
    const id = this.world.getBlock(x, y, z);
    if (id === BlockId.WATER) {
      return this.world.getMeta(x, y, z) !== WATER_SOURCE_META;
    }
    return !getBlock(id).solid;
  }

  /** 选出离“落差”最近的扩散方向（可能多个）。 */
  private optimalFlowDirections(x: number, y: number, z: number): (readonly [number, number])[] {
    const costs: number[] = [];
    let min = WATER_FLOW_BLOCKED_COST;
    for (const [dx, dz] of SIDES) {
      const nx = x + dx;
      const nz = z + dz;
      let cost = WATER_FLOW_BLOCKED_COST;
      if (this.isPassable(nx, y, nz)) {
        cost = this.canFlowInto(nx, y - 1, nz) ? 0 : this.flowCost(nx, y, nz, 1, dx, dz);
      }
      costs.push(cost);
      min = Math.min(min, cost);
    }
    return SIDES.filter((_, i) => costs[i] === min);
  }

  /**
   * 该位置水流方向（单位向量，指向水位更低处）；静水返回 (0,0)。用于推动实体。
   */
  flowVector(x: number, y: number, z: number): { x: number; z: number } {
    const world = this.world;
    if (world.getBlock(x, y, z) !== BlockId.WATER) {
      return { x: 0, z: 0 };
    }
    const own = this.effectiveLevel(world.getMeta(x, y, z));
    let vx = 0;
    let vz = 0;
    for (const [dx, dz] of SIDES) {
      const nx = x + dx;
      const nz = z + dz;
      if (world.getBlock(nx, y, nz) === BlockId.WATER) {
        const diff = this.effectiveLevel(world.getMeta(nx, y, nz)) - own;
        vx += dx * diff;
        vz += dz * diff;
      } else if (this.canFlowInto(nx, y, nz) && this.canFlowInto(nx, y - 1, nz)) {
        // 边缘：朝落差方向流
        vx += dx;
        vz += dz;
      }
    }
    const len = Math.hypot(vx, vz);
    return len === 0 ? { x: 0, z: 0 } : { x: vx / len, z: vz / len };
  }

  private effectiveLevel(meta: number): number {
    return meta === WATER_FALLING_META ? 0 : meta;
  }
}

/** 水面高度（方块内 0..1）：源约 0.89，越浅越低；下落水或上方有水时为满高。 */
export function waterHeight(meta: number, aboveIsWater: boolean): number {
  if (aboveIsWater || meta === WATER_FALLING_META) {
    return 1;
  }
  return 1 - (meta + 1) / (WATER_MAX_LEVEL + 2);
}
