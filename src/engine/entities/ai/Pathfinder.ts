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

/**
 * 相邻一列需要扫描的高度范围：最高落脚点 (y+MAX_STEP_UP) 的头顶到最低落脚点 (y-MAX_DROP) 的脚下。
 * 相对当前 y 的偏移：从 +COLUMN_TOP_OFFSET 往下数 COLUMN_HEIGHT 格。
 */
const COLUMN_TOP_OFFSET = MAX_STEP_UP + CLEARANCE - 1;
const COLUMN_BOTTOM_OFFSET = -MAX_DROP - 1;
const COLUMN_HEIGHT = COLUMN_TOP_OFFSET - COLUMN_BOTTOM_OFFSET + 1;
/** 未找到时的坐标键哨兵。 */
const NO_KEY = -1;

/** 路径上的一个落脚点（方块坐标，y 是脚所在的那一格）。 */
export interface PathNode {
  x: number;
  y: number;
  z: number;
}

// ---- 模块级 scratch：findPath 不可重入，每次调用开头清空后复用，避免每 tick 大量分配 ----

/** 相邻一列的方块是否实心 / 是否完整方块，下标 i 对应 y = cy + COLUMN_TOP_OFFSET - i。 */
const columnSolid = new Uint8Array(COLUMN_HEIGHT);
const columnFull = new Uint8Array(COLUMN_HEIGHT);
/** 每个节点当前最优 g 值与前驱，键为 packPos 后的数字。 */
const gScore = new Map<number, number>();
const cameFrom = new Map<number, number>();
/**
 * 开放集二叉最小堆（按 f 排序）。三条并行数组分别是节点键、f、以及入堆时的 g；
 * 同一节点找到更短路时直接再压一条，弹出时若 g 已过期就丢弃（懒删除），省掉 decrease-key。
 */
const heapKeys: number[] = [];
const heapF: number[] = [];
const heapG: number[] = [];
/** unpackPos 的输出缓冲。 */
const unpackOut = [0, 0, 0];

function heapPush(key: number, f: number, g: number): void {
  let i = heapKeys.length;
  heapKeys.push(key);
  heapF.push(f);
  heapG.push(g);
  // 上浮
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (heapF[parent] <= f) {
      break;
    }
    heapKeys[i] = heapKeys[parent];
    heapF[i] = heapF[parent];
    heapG[i] = heapG[parent];
    i = parent;
  }
  heapKeys[i] = key;
  heapF[i] = f;
  heapG[i] = g;
}

/** 弹出并返回 f 最小的堆顶键；需要它的 g 的话，调用前先从 heapG[0] 取。 */
function heapPop(): number {
  const topKey = heapKeys[0];
  const last = heapKeys.length - 1;
  const key = heapKeys[last];
  const f = heapF[last];
  const g = heapG[last];
  heapKeys.pop();
  heapF.pop();
  heapG.pop();
  if (last === 0) {
    return topKey;
  }
  // 把原堆尾放到堆顶再下沉
  let i = 0;
  const size = last;
  for (;;) {
    const left = 2 * i + 1;
    if (left >= size) {
      break;
    }
    const right = left + 1;
    let child = left;
    if (right < size && heapF[right] < heapF[left]) {
      child = right;
    }
    if (heapF[child] >= f) {
      break;
    }
    heapKeys[i] = heapKeys[child];
    heapF[i] = heapF[child];
    heapG[i] = heapG[child];
    i = child;
  }
  heapKeys[i] = key;
  heapF[i] = f;
  heapG[i] = g;
  return topKey;
}

/**
 * 把 (x, z) 这一列从 y+COLUMN_TOP_OFFSET 到 y+COLUMN_BOTTOM_OFFSET 扫一遍进 scratch。
 * 之前每个候选落脚点各自读 3 格，7 个不同的方块要读 15 次；现在只读一次。
 * 世界高度之外的格视为实心且不完整，天然不可落脚也不可穿越。
 */
function scanColumn(world: World, x: number, y: number, z: number): void {
  const top = y + COLUMN_TOP_OFFSET;
  for (let i = 0; i < COLUMN_HEIGHT; i++) {
    const cy = top - i;
    if (cy < 0 || cy >= WORLD_SIZE_Y) {
      columnSolid[i] = 1;
      columnFull[i] = 0;
      continue;
    }
    const def = getBlock(world.getBlock(x, cy, z));
    columnSolid[i] = def.solid ? 1 : 0;
    columnFull[i] = isFullCube(def) ? 1 : 0;
  }
}

/**
 * 从 y 往某个水平方向走一步（该列已由 scanColumn 装入 scratch），返回落脚点 y；走不过去返回 NO_KEY。
 * 允许抬腿上 1 格、以及往下最多掉 MAX_DROP 格；一格能站人 = 脚下是完整方块，且自己这一格往上有净空。
 *
 * @param headBlocked 当前位置头顶那一格是否实心（上台阶时要钻得过去）
 */
function stepInScannedColumn(y: number, headBlocked: boolean): number {
  for (let dy = MAX_STEP_UP; dy >= -MAX_DROP; dy--) {
    const ny = y + dy;
    if (ny <= 0 || ny + CLEARANCE > WORLD_SIZE_Y) {
      continue;
    }
    // ny 对应的 scratch 下标
    const footIndex = COLUMN_TOP_OFFSET - dy;
    const groundIndex = footIndex + 1;
    if (columnSolid[groundIndex] === 0 || columnFull[groundIndex] === 0) {
      continue;
    }
    let clear = true;
    for (let i = 0; i < CLEARANCE; i++) {
      if (columnSolid[footIndex - i] !== 0) {
        clear = false;
        break;
      }
    }
    if (!clear) {
      continue;
    }
    if (dy > 0 && headBlocked) {
      return NO_KEY;
    }
    return ny;
  }
  return NO_KEY;
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
 * 注意：内部使用模块级 scratch，**不可重入**（不要在回调里嵌套调用）。
 *
 * @param maxNodes 本次最多展开多少节点（默认 MAX_EXPANDED_NODES）
 * @returns 从 start 的下一步到 goal 的路径；无路可走返回空数组
 */
export function findPath(world: World, start: PathNode, goal: PathNode, maxNodes = MAX_EXPANDED_NODES): PathNode[] {
  const startKey = packPos(start.x, start.y, start.z);
  const goalKey = packPos(goal.x, goal.y, goal.z);
  if (startKey === goalKey) {
    return [];
  }
  gScore.clear();
  cameFrom.clear();
  heapKeys.length = 0;
  heapF.length = 0;
  heapG.length = 0;
  gScore.set(startKey, 0);
  heapPush(startKey, heuristic(start.x, start.y, start.z, goal.x, goal.y, goal.z), 0);
  let expanded = 0;
  while (heapKeys.length > 0 && expanded < maxNodes) {
    const entryG = heapG[0];
    const currentKey = heapPop();
    // 懒删除：这条记录入堆之后又找到了更短的路，跳过
    const currentG = gScore.get(currentKey);
    if (currentG === undefined || currentG !== entryG) {
      continue;
    }
    expanded++;
    if (currentKey === goalKey) {
      return rebuildPath(currentKey, startKey);
    }
    unpackPos(currentKey, unpackOut);
    const cx = unpackOut[0];
    const cy = unpackOut[1];
    const cz = unpackOut[2];
    // 头顶那一格每个节点只读一次，四个方向共用
    const headY = cy + CLEARANCE;
    const headBlocked = headY < WORLD_SIZE_Y && getBlock(world.getBlock(cx, headY, cz)).solid;
    for (let n = 0; n < NEIGHBORS.length; n++) {
      const dx = NEIGHBORS[n][0];
      const dz = NEIGHBORS[n][1];
      const nx = cx + dx;
      const nz = cz + dz;
      scanColumn(world, nx, cy, nz);
      const ny = stepInScannedColumn(cy, headBlocked);
      if (ny === NO_KEY) {
        continue;
      }
      const key = packPos(nx, ny, nz);
      const drop = cy > ny ? cy - ny : 0;
      const tentative = currentG + STEP_COST + drop * DROP_COST_PER_BLOCK;
      const knownG = gScore.get(key);
      if (knownG !== undefined && tentative >= knownG) {
        continue;
      }
      cameFrom.set(key, currentKey);
      gScore.set(key, tentative);
      heapPush(key, tentative + heuristic(nx, ny, nz, goal.x, goal.y, goal.z), tentative);
    }
  }
  return [];
}

/** 沿 cameFrom 从终点回溯到起点，直接倒着填结果数组，不经过中间的键数组。 */
function rebuildPath(goalKey: number, startKey: number): PathNode[] {
  let length = 0;
  let key = goalKey;
  while (key !== startKey) {
    length++;
    const previous = cameFrom.get(key);
    if (previous === undefined) {
      return [];
    }
    key = previous;
  }
  const path = new Array<PathNode>(length);
  key = goalKey;
  for (let i = length - 1; i >= 0; i--) {
    unpackPos(key, unpackOut);
    path[i] = { x: unpackOut[0], y: unpackOut[1], z: unpackOut[2] };
    // 上面已经验证过整条链都存在，这里不会是 undefined
    key = cameFrom.get(key) ?? NO_KEY;
  }
  return path;
}
