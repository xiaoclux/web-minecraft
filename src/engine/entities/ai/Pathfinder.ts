import { getBlock } from '../../blocks/BlockRegistry';
import { isFullCube } from '../../blocks/blockShapes';
import { WORLD_SIZE_Y } from '../../constants/world';
import { packPos, unpackPos } from '../../world/posKey';
import type { World } from '../../world/World';

/** 陆生生物一步能上多高、能安全落多深（与 1.8.9 一致：上 1 格、下 3 格）。 */
const MAX_STEP_UP = 1;
const MAX_DROP = 3;
/** 站立需要的净空高度（格）。 */
const CLEARANCE = 2;
/** 一次搜索最多展开多少个节点，防止追不到的目标把 tick 拖垮。 */
const MAX_EXPANDED_NODES = 500;
/** 走一格的基础代价；掉落每多一格加一点代价，让生物优先走平路。 */
const STEP_COST = 10;
const DROP_COST_PER_BLOCK = 4;
/** 水平四邻。 */
const NEIGHBORS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** 路径上的一个落脚点（方块坐标，y 是脚所在的那一格）。 */
export interface PathNode {
  x: number;
  y: number;
  z: number;
}

/** 一格能不能站人：脚下是完整方块，且自己这一格往上有净空。 */
function isStandable(world: World, x: number, y: number, z: number): boolean {
  if (y <= 0 || y + CLEARANCE > WORLD_SIZE_Y) {
    return false;
  }
  const ground = getBlock(world.getBlock(x, y - 1, z));
  if (!ground.solid || !isFullCube(ground)) {
    return false;
  }
  for (let i = 0; i < CLEARANCE; i++) {
    const def = getBlock(world.getBlock(x, y + i, z));
    if (def.solid) {
      return false;
    }
  }
  return true;
}

/**
 * 从 (x, y, z) 往这个水平方向走一步，落脚点的 y；走不过去返回 null。
 * 允许抬腿上 1 格、以及往下最多掉 MAX_DROP 格。
 */
function stepTo(world: World, x: number, y: number, z: number, dx: number, dz: number): number | null {
  const nx = x + dx;
  const nz = z + dz;
  for (let dy = MAX_STEP_UP; dy >= -MAX_DROP; dy--) {
    const ny = y + dy;
    if (!isStandable(world, nx, ny, nz)) {
      continue;
    }
    // 上台阶时，头顶那一格也得空着才钻得过去
    if (dy > 0 && getBlock(world.getBlock(x, y + CLEARANCE, z)).solid) {
      return null;
    }
    return ny;
  }
  return null;
}

/** 曼哈顿距离（只走四邻，这个启发式是可采纳的）。 */
function heuristic(x: number, y: number, z: number, tx: number, ty: number, tz: number): number {
  return (Math.abs(x - tx) + Math.abs(y - ty) + Math.abs(z - tz)) * STEP_COST;
}

/**
 * A\* 寻路：在方块网格上找一条从 start 走到 goal 的落脚点序列。
 *
 * 只处理陆行生物（走、跨一格台阶、跳下不超过 3 格），飞行与游泳生物不用它。
 * 搜索节点数有上限，找不到路时返回空数组，调用方退回直线追逐即可。
 *
 * @param maxNodes 本次最多展开多少节点（默认 MAX_EXPANDED_NODES）
 * @returns 从 start 的下一步到 goal 的路径；无路可走返回空数组
 */
export function findPath(
  world: World,
  start: PathNode,
  goal: PathNode,
  maxNodes = MAX_EXPANDED_NODES,
): PathNode[] {
  const startKey = packPos(start.x, start.y, start.z);
  const goalKey = packPos(goal.x, goal.y, goal.z);
  if (startKey === goalKey) {
    return [];
  }
  // gScore / cameFrom 用打包后的数字键，避免热路径里拼字符串
  const gScore = new Map<number, number>([[startKey, 0]]);
  const cameFrom = new Map<number, number>();
  // 简单的"每次线性取最小 f"开放集：节点数有上限，比维护二叉堆更划算
  const open = new Map<number, number>([[startKey, heuristic(start.x, start.y, start.z, goal.x, goal.y, goal.z)]]);
  const out = [0, 0, 0];
  let expanded = 0;
  while (open.size > 0 && expanded < maxNodes) {
    let currentKey = -1;
    let bestF = Infinity;
    for (const [key, f] of open) {
      if (f < bestF) {
        bestF = f;
        currentKey = key;
      }
    }
    open.delete(currentKey);
    expanded++;
    if (currentKey === goalKey) {
      return rebuildPath(cameFrom, currentKey, startKey);
    }
    unpackPos(currentKey, out);
    const cx = out[0];
    const cy = out[1];
    const cz = out[2];
    const currentG = gScore.get(currentKey) ?? 0;
    for (const [dx, dz] of NEIGHBORS) {
      const ny = stepTo(world, cx, cy, cz, dx, dz);
      if (ny === null) {
        continue;
      }
      const nx = cx + dx;
      const nz = cz + dz;
      const key = packPos(nx, ny, nz);
      const drop = Math.max(0, cy - ny);
      const tentative = currentG + STEP_COST + drop * DROP_COST_PER_BLOCK;
      if (tentative >= (gScore.get(key) ?? Infinity)) {
        continue;
      }
      cameFrom.set(key, currentKey);
      gScore.set(key, tentative);
      open.set(key, tentative + heuristic(nx, ny, nz, goal.x, goal.y, goal.z));
    }
  }
  return [];
}

function rebuildPath(cameFrom: Map<number, number>, goalKey: number, startKey: number): PathNode[] {
  const keys: number[] = [];
  let key = goalKey;
  while (key !== startKey) {
    keys.push(key);
    const previous = cameFrom.get(key);
    if (previous === undefined) {
      return [];
    }
    key = previous;
  }
  keys.reverse();
  const out = [0, 0, 0];
  return keys.map((k) => {
    unpackPos(k, out);
    return { x: out[0], y: out[1], z: out[2] };
  });
}
