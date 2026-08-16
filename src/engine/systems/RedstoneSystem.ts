/**
 * 红石信号：以"每个红石元件有一个 0~15 的输出强度"为模型，方块变化后重算受影响的一小片。
 *
 * 与 1.8.9 的对应关系：
 * - 电源（拉杆 / 按钮 / 压力板 / 红石块 / 红石火把）向外提供强充能或弱充能；
 * - 红石粉沿着相邻的粉传播，每格衰减 1，被强充能的方块可以再点亮贴着它的粉；
 * - 用电器（红石灯 / 门 / 活板门 / 发射器…）读自己周围的充能强度决定开关。
 *
 * 为了避免"改一块就全图重算"，每次变更只从变更点出发做有界的广度优先重算。
 */

import { BlockId, getBlock } from '../blocks/BlockRegistry';
import { REDSTONE_MAX_POWER, REDSTONE_UPDATE_RADIUS } from '../constants/redstone';
import type { World } from '../world/World';

/** 六个方向。 */
const NEIGHBORS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
/** 水平四邻（红石粉的传播方向）。 */
const HORIZONTAL: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/** 一个方块作为电源时能提供多强的信号；不是电源返回 0。 */
export function sourcePower(world: World, x: number, y: number, z: number): number {
  const id = world.getBlock(x, y, z);
  const def = getBlock(id);
  if (!def.redstone) {
    return 0;
  }
  const { source } = def.redstone;
  if (source === undefined) {
    return 0;
  }
  // 拉杆 / 按钮 / 压力板：meta 的开关位决定通不通电
  if (def.redstone.poweredBit !== undefined) {
    return (world.getMeta(x, y, z) & def.redstone.poweredBit) !== 0 ? source : 0;
  }
  return source;
}

/** 该方块是不是"强充能体"（信号能穿过它去点亮贴着它的红石粉）。 */
function isConductive(world: World, x: number, y: number, z: number): boolean {
  const def = getBlock(world.getBlock(x, y, z));
  return def.opaque && !def.redstone;
}

/** 红石粉当前的信号强度（存在 meta 里）。 */
export function wirePower(world: World, x: number, y: number, z: number): number {
  return world.getBlock(x, y, z) === BlockId.REDSTONE_WIRE ? world.getMeta(x, y, z) : 0;
}

/**
 * 某个位置受到的充能强度：取周围电源与红石粉能给到的最大值。
 * 用电器（红石灯、门等）用它决定开关。
 */
export function powerAt(world: World, x: number, y: number, z: number): number {
  let power = 0;
  for (const [dx, dy, dz] of NEIGHBORS) {
    const nx = x + dx;
    const ny = y + dy;
    const nz = z + dz;
    power = Math.max(power, sourcePower(world, nx, ny, nz));
    // 红石粉只向"它指着的"方块供能：上下不供，水平与正下方供
    if (dy <= 0) {
      power = Math.max(power, wirePower(world, nx, ny, nz));
    }
    // 强充能的实心方块把电源的信号传给贴着它的粉
    if (isConductive(world, nx, ny, nz)) {
      power = Math.max(power, conductedPower(world, nx, ny, nz, x, y, z));
    }
  }
  return power;
}

/** 实心方块被周围的电源 / 粉强充能后，能转手给出多大的信号。 */
function conductedPower(
  world: World,
  bx: number,
  by: number,
  bz: number,
  fromX: number,
  fromY: number,
  fromZ: number,
): number {
  let power = 0;
  for (const [dx, dy, dz] of NEIGHBORS) {
    const nx = bx + dx;
    const ny = by + dy;
    const nz = bz + dz;
    if (nx === fromX && ny === fromY && nz === fromZ) {
      continue;
    }
    power = Math.max(power, sourcePower(world, nx, ny, nz));
    // 只有"指向该方块"的红石粉才算强充能，简化为：粉在方块旁边且强度 > 0
    if (dy === 0) {
      const wire = wirePower(world, nx, ny, nz);
      if (wire > 0) {
        power = Math.max(power, wire - 1);
      }
    }
  }
  return power;
}

/**
 * 重算以 (x, y, z) 为中心一小片区域里的红石粉强度。
 * 做法是标准的多源 BFS：所有电源旁的粉先拿到强度，再逐格衰减扩散。
 * @returns 强度发生变化的红石粉坐标（调用方据此刷新它们旁边的用电器）
 */
export function updateWires(world: World, x: number, y: number, z: number): [number, number, number][] {
  const wires = collectWires(world, x, y, z);
  if (wires.size === 0) {
    return [];
  }
  // 先算每根粉从"非粉来源"能拿到的初始强度
  const power = new Map<string, number>();
  const queue: [number, number, number][] = [];
  for (const key of wires) {
    const [wx, wy, wz] = key.split(',').map(Number);
    let best = 0;
    for (const [dx, dy, dz] of NEIGHBORS) {
      best = Math.max(best, sourcePower(world, wx + dx, wy + dy, wz + dz));
      if (isConductive(world, wx + dx, wy + dy, wz + dz)) {
        best = Math.max(best, strongPowerOf(world, wx + dx, wy + dy, wz + dz));
      }
    }
    power.set(key, best);
    if (best > 0) {
      queue.push([wx, wy, wz]);
    }
  }
  // 逐格衰减扩散
  while (queue.length > 0) {
    const [wx, wy, wz] = queue.shift() as [number, number, number];
    const current = power.get(wireKey(wx, wy, wz)) ?? 0;
    if (current <= 1) {
      continue;
    }
    for (const [dx, , dz] of HORIZONTAL) {
      for (const dy of [0, 1, -1]) {
        const nx = wx + dx;
        const ny = wy + dy;
        const nz = wz + dz;
        const key = wireKey(nx, ny, nz);
        if (!wires.has(key)) {
          continue;
        }
        if ((power.get(key) ?? 0) >= current - 1) {
          continue;
        }
        power.set(key, current - 1);
        queue.push([nx, ny, nz]);
      }
    }
  }
  const changed: [number, number, number][] = [];
  for (const [key, value] of power) {
    const [wx, wy, wz] = key.split(',').map(Number);
    if (world.getMeta(wx, wy, wz) !== value) {
      world.setBlock(wx, wy, wz, BlockId.REDSTONE_WIRE, value);
      changed.push([wx, wy, wz]);
    }
  }
  return changed;
}

/** 实心方块被电源强充能的强度（供红石粉取用）。 */
function strongPowerOf(world: World, x: number, y: number, z: number): number {
  let power = 0;
  for (const [dx, dy, dz] of NEIGHBORS) {
    power = Math.max(power, sourcePower(world, x + dx, y + dy, z + dz));
  }
  return power;
}

function wireKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

/** 收集变更点附近相连的全部红石粉。 */
function collectWires(world: World, x: number, y: number, z: number): Set<string> {
  const found = new Set<string>();
  const seen = new Set<string>();
  const queue: [number, number, number][] = [];
  // 从变更点周围一圈开始找粉
  for (let dy = -REDSTONE_UPDATE_RADIUS; dy <= REDSTONE_UPDATE_RADIUS; dy++) {
    for (let dz = -REDSTONE_UPDATE_RADIUS; dz <= REDSTONE_UPDATE_RADIUS; dz++) {
      for (let dx = -REDSTONE_UPDATE_RADIUS; dx <= REDSTONE_UPDATE_RADIUS; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        const nz = z + dz;
        if (world.getBlock(nx, ny, nz) === BlockId.REDSTONE_WIRE) {
          const key = wireKey(nx, ny, nz);
          if (!seen.has(key)) {
            seen.add(key);
            found.add(key);
            queue.push([nx, ny, nz]);
          }
        }
      }
    }
  }
  // 顺着相连的粉扩出去，保证整条线一起重算
  while (queue.length > 0) {
    const [wx, wy, wz] = queue.shift() as [number, number, number];
    for (const [dx, , dz] of HORIZONTAL) {
      for (const dy of [0, 1, -1]) {
        const nx = wx + dx;
        const ny = wy + dy;
        const nz = wz + dz;
        const key = wireKey(nx, ny, nz);
        if (seen.has(key) || world.getBlock(nx, ny, nz) !== BlockId.REDSTONE_WIRE) {
          continue;
        }
        seen.add(key);
        found.add(key);
        queue.push([nx, ny, nz]);
      }
    }
  }
  return found;
}

/** 信号强度上限（导出给 UI / 测试用）。 */
export const MAX_POWER = REDSTONE_MAX_POWER;
