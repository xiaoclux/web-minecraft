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
import { FACINGS, FACING_MASK } from '../blocks/blockShapes';
import {
  POWERED_RAIL_CHAIN,
  RAIL_SHAPE_MASK,
  COMPARATOR_MODE_BIT,
  COMPARATOR_OUTPUT_MASK,
  COMPARATOR_OUTPUT_SHIFT,
  REDSTONE_MAX_POWER,
  REDSTONE_POWER_MASK,
  REDSTONE_UPDATE_RADIUS,
  REPEATER_FACING_MASK,
  NOTE_CENTER,
  SEMITONES_PER_OCTAVE,
  RailShape,
} from '../constants/redstone';
import { packPos, unpackPos } from '../world/posKey';
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
/** 红石粉能连到的 12 个相对位置：水平四邻各自的同层 / 上一格 / 下一格。 */
const WIRE_LINKS: readonly (readonly [number, number, number])[] = HORIZONTAL.flatMap(([dx, , dz]) =>
  [0, 1, -1].map((dy) => [dx, dy, dz] as const),
);
/** 沿轨道两个方向。 */
const SIGNS = [1, -1] as const;
/** unpackPos 的复用输出，避免热路径分配。 */
const POS_OUT = [0, 0, 0];

/**
 * 一个方块朝某个方向输出多强的信号。
 * @param toX,toY,toZ 要送电的目标格（中继器只朝正面输出，所以要看方向）
 */
export function sourcePowerTo(
  world: World,
  x: number,
  y: number,
  z: number,
  toX: number,
  toY: number,
  toZ: number,
): number {
  const def = getBlock(world.getBlock(x, y, z));
  if (def.redstone?.repeater || def.redstone?.comparator) {
    // 中继器 / 比较器只给正面那一格供电
    const [fx, fz] = FACINGS[world.getMeta(x, y, z) & REPEATER_FACING_MASK];
    if (toX !== x + fx || toZ !== z + fz || toY !== y) {
      return 0;
    }
  }
  // 红石火把不给自己脚下的附着方块供电（否则会自锁：石块有电 → 火把灭 → 石块没电…）
  if (def.redstone?.invertedOffId !== undefined && toX === x && toY === y - 1 && toZ === z) {
    return 0;
  }
  return sourcePower(world, x, y, z);
}

/** 一个方块作为电源时能提供多强的信号；不是电源返回 0。 */
export function sourcePower(world: World, x: number, y: number, z: number): number {
  const id = world.getBlock(x, y, z);
  const def = getBlock(id);
  if (!def.redstone) {
    return 0;
  }
  // 比较器：输出强度存在 meta 高 4 位，不需要 source 字段
  if (def.redstone.comparator) {
    return (world.getMeta(x, y, z) >> COMPARATOR_OUTPUT_SHIFT) & COMPARATOR_OUTPUT_MASK;
  }
  const { source } = def.redstone;
  if (source === undefined) {
    return 0;
  }
  // 日光传感器：强度是连续的，直接存在 meta 里
  if (def.redstone.analogFromMeta) {
    return Math.min(world.getMeta(x, y, z) & REDSTONE_POWER_MASK, REDSTONE_MAX_POWER);
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
 * @param ignore 要跳过的邻居（红石火把判断脚下方块时要排除自己，否则会自锁）
 */
export function powerAt(
  world: World,
  x: number,
  y: number,
  z: number,
  ignore?: readonly [number, number, number],
): number {
  let power = 0;
  for (const [dx, dy, dz] of NEIGHBORS) {
    const nx = x + dx;
    const ny = y + dy;
    const nz = z + dz;
    if (ignore && nx === ignore[0] && ny === ignore[1] && nz === ignore[2]) {
      continue;
    }
    power = Math.max(power, sourcePowerTo(world, nx, ny, nz, x, y, z));
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
    power = Math.max(power, sourcePowerTo(world, nx, ny, nz, bx, by, bz));
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
 * 动力铁轨是否通电：自己被充能，或沿着轨道方向连着的动力轨里有被充能的（最多传 8 格）。
 */
export function isPoweredRailOn(world: World, x: number, y: number, z: number): boolean {
  if (powerAt(world, x, y, z) > 0) {
    return true;
  }
  const alongZ = (world.getMeta(x, y, z) & RAIL_SHAPE_MASK) === RailShape.NORTH_SOUTH;
  const ax = alongZ ? 0 : 1;
  const az = alongZ ? 1 : 0;
  for (const sign of SIGNS) {
    for (let i = 1; i <= POWERED_RAIL_CHAIN; i++) {
      const nx = x + ax * i * sign;
      const nz = z + az * i * sign;
      if (world.getBlock(nx, y, nz) !== BlockId.POWERED_RAIL) {
        break;
      }
      if (powerAt(world, nx, y, nz) > 0) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 比较器该输出多强的信号。
 * @param containerLevelAt 读容器充盈度的回调（背后是箱子 / 熔炉之类时用），非容器返回 0
 */
export function comparatorOutput(
  world: World,
  x: number,
  y: number,
  z: number,
  containerLevelAt: (x: number, y: number, z: number) => number,
): number {
  const meta = world.getMeta(x, y, z);
  const [fx, fz] = FACINGS[meta & FACING_MASK];
  // 背面：先看容器充盈度，没有容器再看普通红石信号
  const bx = x - fx;
  const bz = z - fz;
  const container = containerLevelAt(bx, y, bz);
  const back = container > 0 ? container : inputPowerAt(world, bx, y, bz, x, y, z);
  // 两侧：垂直于朝向的两格
  const sideA = inputPowerAt(world, x + fz, y, z + fx, x, y, z);
  const sideB = inputPowerAt(world, x - fz, y, z - fx, x, y, z);
  const side = Math.max(sideA, sideB);
  if ((meta & COMPARATOR_MODE_BIT) !== 0) {
    // 减法模式
    return Math.max(0, back - side);
  }
  return side > back ? 0 : back;
}

/** 某一格能给 (toX,toY,toZ) 送多强的信号（粉 / 电源 / 被强充能的实心方块都算）。 */
function inputPowerAt(
  world: World,
  x: number,
  y: number,
  z: number,
  toX: number,
  toY: number,
  toZ: number,
): number {
  const wire = wirePower(world, x, y, z);
  const source = sourcePowerTo(world, x, y, z, toX, toY, toZ);
  const conducted = isConductive(world, x, y, z) ? strongPowerOf(world, x, y, z) : 0;
  return Math.max(wire, Math.max(source, conducted));
}

/**
 * 中继器背面收到的信号（只有正对背面的那一格算数）。
 */
export function repeaterInputPower(world: World, x: number, y: number, z: number): number {
  const [fx, fz] = FACINGS[world.getMeta(x, y, z) & REPEATER_FACING_MASK];
  // 背面 = 正面的反方向
  return inputPowerAt(world, x - fx, y, z - fz, x, y, z);
}

/**
 * 重算以 (x, y, z) 为中心一小片区域里的红石粉强度。
 * 做法是标准的多源 BFS：所有电源旁的粉先拿到强度，再逐格衰减扩散。
 * @returns 强度发生变化的红石粉坐标（调用方据此刷新它们旁边的用电器）
 */
export function updateWires(world: World, x: number, y: number, z: number): [number, number, number][] {
  const wires = collectWires(world, x, y, z);
  if (wires.length === 0) {
    return [];
  }
  // 先算每根粉从"非粉来源"能拿到的初始强度
  const power = new Map<number, number>();
  const queue: number[] = [];
  for (const key of wires) {
    unpackPos(key, POS_OUT);
    const wx = POS_OUT[0];
    const wy = POS_OUT[1];
    const wz = POS_OUT[2];
    let best = 0;
    for (const [dx, dy, dz] of NEIGHBORS) {
      best = Math.max(best, sourcePowerTo(world, wx + dx, wy + dy, wz + dz, wx, wy, wz));
      if (isConductive(world, wx + dx, wy + dy, wz + dz)) {
        best = Math.max(best, strongPowerOf(world, wx + dx, wy + dy, wz + dz));
      }
    }
    power.set(key, best);
    if (best > 0) {
      queue.push(key);
    }
  }
  // 逐格衰减扩散（读指针代替 shift，避免每次搬移数组）
  for (let head = 0; head < queue.length; head++) {
    const currentKey = queue[head];
    const current = power.get(currentKey) ?? 0;
    if (current <= 1) {
      continue;
    }
    unpackPos(currentKey, POS_OUT);
    const wx = POS_OUT[0];
    const wy = POS_OUT[1];
    const wz = POS_OUT[2];
    for (const [dx, dy, dz] of WIRE_LINKS) {
      const key = packPos(wx + dx, wy + dy, wz + dz);
      const known = power.get(key);
      if (known === undefined || known >= current - 1) {
        continue;
      }
      power.set(key, current - 1);
      queue.push(key);
    }
  }
  const changed: [number, number, number][] = [];
  for (const [key, value] of power) {
    unpackPos(key, POS_OUT);
    const wx = POS_OUT[0];
    const wy = POS_OUT[1];
    const wz = POS_OUT[2];
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
    power = Math.max(power, sourcePowerTo(world, x + dx, y + dy, z + dz, x, y, z));
  }
  return power;
}

/** 收集变更点附近相连的全部红石粉（packPos 键，顺序即发现顺序）。 */
function collectWires(world: World, x: number, y: number, z: number): number[] {
  const found: number[] = [];
  const seen = new Set<number>();
  // 从变更点周围一圈开始找粉
  for (let dy = -REDSTONE_UPDATE_RADIUS; dy <= REDSTONE_UPDATE_RADIUS; dy++) {
    for (let dz = -REDSTONE_UPDATE_RADIUS; dz <= REDSTONE_UPDATE_RADIUS; dz++) {
      for (let dx = -REDSTONE_UPDATE_RADIUS; dx <= REDSTONE_UPDATE_RADIUS; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        const nz = z + dz;
        if (world.getBlock(nx, ny, nz) === BlockId.REDSTONE_WIRE) {
          const key = packPos(nx, ny, nz);
          if (!seen.has(key)) {
            seen.add(key);
            found.push(key);
          }
        }
      }
    }
  }
  // 顺着相连的粉扩出去，保证整条线一起重算；found 自身就是 BFS 队列
  for (let head = 0; head < found.length; head++) {
    unpackPos(found[head], POS_OUT);
    const wx = POS_OUT[0];
    const wy = POS_OUT[1];
    const wz = POS_OUT[2];
    for (const [dx, dy, dz] of WIRE_LINKS) {
      const nx = wx + dx;
      const ny = wy + dy;
      const nz = wz + dz;
      const key = packPos(nx, ny, nz);
      if (seen.has(key) || world.getBlock(nx, ny, nz) !== BlockId.REDSTONE_WIRE) {
        continue;
      }
      seen.add(key);
      found.push(key);
    }
  }
  return found;
}

/** 信号强度上限（导出给 UI / 测试用）。 */
export const MAX_POWER = REDSTONE_MAX_POWER;

/**
 * 音符盒某个音高相对音效原始音高的倍率（十二平均律）。
 * @param note 0 ~ NOTE_COUNT-1，NOTE_CENTER 为原音高
 */
export function notePitch(note: number): number {
  return 2 ** ((note - NOTE_CENTER) / SEMITONES_PER_OCTAVE);
}
