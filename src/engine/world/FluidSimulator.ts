import { BlockId, getBlock } from '../blocks/BlockRegistry';
import {
  LAVA_FLOW_SEARCH_RANGE,
  LAVA_MAX_LEVEL,
  LAVA_TICK_INTERVAL,
  WATER_FALLING_META,
  WATER_FLOW_BLOCKED_COST,
  WATER_FLOW_SEARCH_RANGE,
  WATER_INFINITE_SOURCE_COUNT,
  WATER_MAX_LEVEL,
  WATER_SOURCE_META,
  WATER_TICK_INTERVAL,
  type FluidSpec,
} from '../constants/fluids';
import { CHUNK_SIZE, WORLD_SIZE_Y } from '../constants/world';
import type { Chunk } from './Chunk';
import { sectionIndex } from './Chunk';
import type { World } from './World';

/** 位置打包为数字键：x/z 各占 ±2^21，y 占 64。 */
const POS_OFFSET = 1 << 21;
const POS_SPAN = 1 << 22;
function packPos(x: number, y: number, z: number): number {
  return ((x + POS_OFFSET) * POS_SPAN + (z + POS_OFFSET)) * WORLD_SIZE_Y + y;
}

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

/** 被流体冲走的方块回调（用于掉落植物等）。 */
export type WashedListener = (x: number, y: number, z: number, blockId: number) => void;

/** 各流体的行为参数（按方块 id 查）。 */
export const FLUID_SPECS: Record<number, FluidSpec> = {
  [BlockId.WATER]: {
    block: BlockId.WATER,
    maxLevel: WATER_MAX_LEVEL,
    tickInterval: WATER_TICK_INTERVAL,
    infiniteSource: true,
    flowSearchRange: WATER_FLOW_SEARCH_RANGE,
  },
  [BlockId.LAVA]: {
    block: BlockId.LAVA,
    maxLevel: LAVA_MAX_LEVEL,
    tickInterval: LAVA_TICK_INTERVAL,
    infiniteSource: false,
    flowSearchRange: LAVA_FLOW_SEARCH_RANGE,
  },
};

/** 取某个方块 id 的流体参数；不是流体返回 null。 */
export function fluidSpecOf(blockId: number): FluidSpec | null {
  return FLUID_SPECS[blockId] ?? null;
}

/**
 * 流体的流动模拟（1.8 规则简化版），水与岩浆共用同一套算法、参数不同：
 * 源(0) 向下形成下落流体(8)，向侧面按 1..maxLevel 递减扩散；失去供给的流体逐级消退；
 * 支持无限源的流体在两侧都是源且下方稳固时升级为源。
 * 岩浆碰到水会凝固：源变黑曜石、流动的变圆石。
 */
export class FluidSimulator {
  /** 按流体方块 id 分开的待更新位置（不同流体的更新频率不同）。 */
  private readonly pendingByFluid = new Map<number, Set<number>>();
  /** 已经调用过多少次 tick，用来按各流体的间隔分频。 */
  private tickCount = 0;
  private readonly washedListeners = new Set<WashedListener>();

  constructor(private readonly world: World) {
    world.onBlockChange((x, y, z) => this.scheduleAround(x, y, z));
    world.onBatchChange((changes) => {
      for (const c of changes) {
        this.scheduleAround(c.x, c.y, c.z);
      }
    });
    world.onChunkLoad((chunk) => this.scheduleFlowingIn(chunk));
  }

  /** 订阅“方块被水冲走”。 */
  onWashed(listener: WashedListener): () => void {
    this.washedListeners.add(listener);
    return () => this.washedListeners.delete(listener);
  }

  /** 待处理位置数（测试 / 调试用）。 */
  get pendingCount(): number {
    let total = 0;
    for (const set of this.pendingByFluid.values()) {
      total += set.size;
    }
    return total;
  }

  /** 方块变化后：把该位置及六邻中的水加入待更新。 */
  scheduleAround(x: number, y: number, z: number): void {
    this.scheduleIfFluid(x, y, z);
    for (const [dx, dy, dz] of NEIGHBORS) {
      this.scheduleIfFluid(x + dx, y + dy, z + dz);
    }
  }

  /** chunk 加载（读档 / 生成）后：让其中未静止的流动水继续更新（生成的海水全是源，不会被调度）。 */
  private scheduleFlowingIn(chunk: Chunk): void {
    for (let y = chunk.filledMinY; y < chunk.filledMaxY; y++) {
      const section = chunk.sectionAt(y);
      if (!section) {
        continue;
      }
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const idx = sectionIndex(lx, y, lz);
          if (fluidSpecOf(section.blocks[idx]) && section.meta[idx] !== WATER_SOURCE_META) {
            this.schedule(chunk.originX + lx, y, chunk.originZ + lz, section.blocks[idx]);
          }
        }
      }
    }
  }

  private scheduleIfFluid(x: number, y: number, z: number): void {
    const id = this.world.getBlock(x, y, z);
    if (fluidSpecOf(id)) {
      this.schedule(x, y, z, id);
    }
  }

  /** 按流体种类放进对应的待更新集合。 */
  private schedule(x: number, y: number, z: number, blockId: number): void {
    this.pendingFor(blockId).add(packPos(x, y, z));
  }

  private pendingFor(blockId: number): Set<number> {
    let set = this.pendingByFluid.get(blockId);
    if (!set) {
      set = new Set<number>();
      this.pendingByFluid.set(blockId, set);
    }
    return set;
  }

  /**
   * 处理一轮待更新的流体（每 WATER_TICK_INTERVAL 个游戏 tick 调用一次）。
   * 更新更慢的流体（岩浆）按自己的间隔分频。
   */
  tick(): void {
    this.tickCount++;
    for (const [blockId, set] of this.pendingByFluid) {
      const spec = fluidSpecOf(blockId);
      if (!spec || set.size === 0) {
        continue;
      }
      const everyNCalls = Math.max(1, Math.round(spec.tickInterval / WATER_TICK_INTERVAL));
      if (this.tickCount % everyNCalls !== 0) {
        continue;
      }
      const batch = [...set];
      set.clear();
      for (const key of batch) {
        const y = key % WORLD_SIZE_Y;
        const rest = (key - y) / WORLD_SIZE_Y;
        const z = (rest % POS_SPAN) - POS_OFFSET;
        const x = (rest - (z + POS_OFFSET)) / POS_SPAN - POS_OFFSET;
        this.updateFluid(x, y, z, spec);
      }
    }
  }

  private updateFluid(x: number, y: number, z: number, spec: FluidSpec): void {
    const world = this.world;
    if (world.getBlock(x, y, z) !== spec.block) {
      return;
    }
    let meta = world.getMeta(x, y, z);
    if (this.solidifyLavaOnContact(x, y, z, spec, meta)) {
      return;
    }
    if (meta !== WATER_SOURCE_META) {
      const next = this.recomputeLevel(x, y, z, spec);
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
    const spreadLevel = effectiveLevel(meta);
    if (this.canFlowInto(x, y - 1, z)) {
      this.flowInto(x, y - 1, z, WATER_FALLING_META, spec);
      return;
    }
    const belowSolid = getBlock(world.getBlock(x, y - 1, z)).solid;
    const canSpread = meta === WATER_SOURCE_META || belowSolid;
    if (!canSpread || spreadLevel + 1 > spec.maxLevel) {
      return;
    }
    for (const [dx, dz] of this.optimalFlowDirections(x, y, z, spec)) {
      if (this.canFlowInto(x + dx, y, z + dz)) {
        this.flowInto(x + dx, y, z + dz, spreadLevel + 1, spec);
      }
    }
  }

  /** 岩浆碰到水就凝固：源变黑曜石、流动的变圆石。返回是否已凝固。 */
  private solidifyLavaOnContact(x: number, y: number, z: number, spec: FluidSpec, meta: number): boolean {
    if (spec.block !== BlockId.LAVA) {
      return false;
    }
    const world = this.world;
    let touchesWater = world.getBlock(x, y + 1, z) === BlockId.WATER;
    for (const [dx, dz] of SIDES) {
      touchesWater = touchesWater || world.getBlock(x + dx, y, z + dz) === BlockId.WATER;
    }
    if (!touchesWater) {
      return false;
    }
    world.setBlock(x, y, z, meta === WATER_SOURCE_META ? BlockId.OBSIDIAN : BlockId.COBBLESTONE);
    this.scheduleAround(x, y, z);
    return true;
  }

  /** 由邻居重新推算流动水的 meta；返回 null 表示应消失。 */
  private recomputeLevel(x: number, y: number, z: number, spec: FluidSpec): number | null {
    const world = this.world;
    if (world.getBlock(x, y + 1, z) === spec.block) {
      return WATER_FALLING_META;
    }
    let min = Infinity;
    let sources = 0;
    for (const [dx, dz] of SIDES) {
      if (world.getBlock(x + dx, y, z + dz) !== spec.block) {
        continue;
      }
      const m = world.getMeta(x + dx, y, z + dz);
      if (m === WATER_SOURCE_META) {
        sources++;
      }
      min = Math.min(min, effectiveLevel(m));
    }
    const belowId = world.getBlock(x, y - 1, z);
    const belowStable =
      getBlock(belowId).solid || (belowId === spec.block && world.getMeta(x, y - 1, z) === WATER_SOURCE_META);
    if (spec.infiniteSource && sources >= WATER_INFINITE_SOURCE_COUNT && belowStable) {
      return WATER_SOURCE_META;
    }
    if (min === Infinity || min + 1 > spec.maxLevel) {
      return null;
    }
    return min + 1;
  }

  /** 目标位置能否被水占据：空气或非实心、非液体的小方块（草花火把等，会被冲走）。 */
  private canFlowInto(x: number, y: number, z: number): boolean {
    if (y < 0) {
      return false;
    }
    const chunk = this.world.getChunkAt(x, z);
    if (!chunk) {
      return false;
    }
    const def = getBlock(chunk.getLocal(x - chunk.originX, y, z - chunk.originZ));
    return !def.solid && !def.isLiquid;
  }

  private flowInto(x: number, y: number, z: number, meta: number, spec: FluidSpec): void {
    const old = this.world.getBlock(x, y, z);
    if (old !== BlockId.AIR) {
      for (const listener of this.washedListeners) {
        listener(x, y, z, old);
      }
    }
    this.world.setBlock(x, y, z, spec.block, meta);
    this.scheduleAround(x, y, z);
  }

  /** 沿某方向寻找落差的代价（1.8 calculateFlowCost 简化版）。 */
  private flowCost(
    x: number,
    y: number,
    z: number,
    depth: number,
    fromDx: number,
    fromDz: number,
    spec: FluidSpec,
  ): number {
    let best = WATER_FLOW_BLOCKED_COST;
    for (const [dx, dz] of SIDES) {
      if (dx === -fromDx && dz === -fromDz) {
        continue;
      }
      const nx = x + dx;
      const nz = z + dz;
      if (!this.isPassable(nx, y, nz, spec)) {
        continue;
      }
      if (this.canFlowInto(nx, y - 1, nz)) {
        return depth;
      }
      if (depth < spec.flowSearchRange) {
        best = Math.min(best, this.flowCost(nx, y, nz, depth + 1, dx, dz, spec));
      }
    }
    return best;
  }

  /** 搜索路径上可穿过：非实心且不是同种流体的源（流动的可以穿过）。 */
  private isPassable(x: number, y: number, z: number, spec: FluidSpec): boolean {
    const chunk = this.world.getChunkAt(x, z);
    if (!chunk) {
      return false;
    }
    const section = chunk.sectionAt(y);
    if (!section) {
      return true;
    }
    const idx = sectionIndex(x - chunk.originX, y, z - chunk.originZ);
    const id = section.blocks[idx];
    if (id === spec.block) {
      return section.meta[idx] !== WATER_SOURCE_META;
    }
    return !getBlock(id).solid;
  }

  /** 选出离“落差”最近的扩散方向（可能多个）。 */
  private optimalFlowDirections(x: number, y: number, z: number, spec: FluidSpec): (readonly [number, number])[] {
    const costs: number[] = [];
    let min = WATER_FLOW_BLOCKED_COST;
    for (const [dx, dz] of SIDES) {
      const nx = x + dx;
      const nz = z + dz;
      let cost = WATER_FLOW_BLOCKED_COST;
      if (this.isPassable(nx, y, nz, spec)) {
        cost = this.canFlowInto(nx, y - 1, nz) ? 0 : this.flowCost(nx, y, nz, 1, dx, dz, spec);
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
    const own = effectiveLevel(world.getMeta(x, y, z));
    let vx = 0;
    let vz = 0;
    for (const [dx, dz] of SIDES) {
      const nx = x + dx;
      const nz = z + dz;
      if (world.getBlock(nx, y, nz) === BlockId.WATER) {
        const diff = effectiveLevel(world.getMeta(nx, y, nz)) - own;
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
}

/** 参与扩散计算的有效水位：下落水按源（0）处理。 */
function effectiveLevel(meta: number): number {
  return meta === WATER_FALLING_META ? 0 : meta;
}
