/**
 * 方块形状：把"一个方块 = 一个整立方体"放宽为"一个方块 = 若干子盒"，
 * 供碰撞、射线选中、线框与网格生成共用。子盒坐标是单位立方体内的 0~1 局部坐标。
 */

import type { BlockDef } from './BlockRegistry';

/** 单位立方体内的子盒。 */
export interface BlockBox {
  readonly x0: number;
  readonly y0: number;
  readonly z0: number;
  readonly x1: number;
  readonly y1: number;
  readonly z1: number;
}

/** 方块形状。 */
export const BlockShape = {
  /** 完整立方体。 */
  FULL: 'full',
  /** 十字面片（花草），无碰撞。 */
  CROSS: 'cross',
  /** 半砖：占上半或下半。 */
  SLAB: 'slab',
  /** 楼梯：一层半砖 + 半格台阶。 */
  STAIRS: 'stairs',
  /** 床：占半格多一点的一层。 */
  BED: 'bed',
  /** 梯子：贴在墙上的薄片。 */
  LADDER: 'ladder',
  /** 门：占两格高的一扇薄板，可开合。 */
  DOOR: 'door',
  /** 栅栏：中心柱 + 朝已连接方向伸出的横杆。 */
  FENCE: 'fence',
  /** 栅栏门：关着时挡住通道，开着时两扇转到两侧、可以走过去。 */
  FENCE_GATE: 'fence_gate',
  /** 耕地：比整格矮 1/16。 */
  FARMLAND: 'farmland',
  /** 仙人掌：比整格细一圈。 */
  CACTUS: 'cactus',
  /** 酿造台：一层薄底座 + 中间一根细杆。 */
  BREWING_STAND: 'brewing_stand',
  /** 附魔台：3/4 高的方块。 */
  ENCHANTING_TABLE: 'enchanting_table',
  /** 铁砧：底座 + 砧面，比整格窄一圈。 */
  ANVIL: 'anvil',
} as const;
export type BlockShape = (typeof BlockShape)[keyof typeof BlockShape];

/** 半砖 meta：该位为 1 表示贴在格子上半（1.8.9 同位）。 */
export const SLAB_TOP_BIT = 8;
/** 带朝向的方块 meta：低 2 位为水平朝向序号（楼梯是台阶高的一侧，箱子等是正面朝向）。 */
export const FACING_MASK = 3;
/** 楼梯 meta：该位为 1 表示上下颠倒（贴在格子上半）。 */
export const STAIRS_FLIP_BIT = 4;
/** 床 meta：该位为 1 表示这半格是床头（与 1.8.9 同位）。 */
export const BED_HEAD_BIT = 8;
/** 门 meta：该位为 1 表示门是开着的。 */
export const DOOR_OPEN_BIT = 4;
/** 门 meta：该位为 1 表示这格是门的上半扇。 */
export const DOOR_UPPER_BIT = 8;
/** 耕地高度（1.8.9 为 15/16，站上去会矮一点）。 */
export const FARMLAND_HEIGHT = 15 / 16;
/** 耕地 meta：湿润度 0~7，0 表示干燥。 */
export const FARMLAND_MAX_MOISTURE = 7;
/** 作物 meta：生长阶段 0~7，7 为成熟。 */
export const CROP_MAX_STAGE = 7;

/** 门板厚度（1.8.9 为 3/16）。 */
export const DOOR_THICKNESS = 3 / 16;
/** 栅栏的碰撞高度（1.8.9 为 1.5 格，防止跳过去）。 */
export const FENCE_COLLISION_HEIGHT = 1.5;
/** 栅栏门 meta：该位为 1 表示门是开着的（与门共用同一位）。 */
export const GATE_OPEN_BIT = DOOR_OPEN_BIT;
/** 连接掩码的位：按 FACINGS 顺序。 */
export function connectionBit(facing: number): number {
  return 1 << facing;
}
/** 连接掩码的取值个数（4 个方向）。 */
const CONNECTION_COUNT = 16;
/** 床的高度（1.8.9 为 9/16）。 */
export const BED_HEIGHT = 9 / 16;
/** 水平朝向序号 → 单位方向。 */
export const FACINGS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** 朝向序号 → 反向的朝向序号。 */
export function oppositeFacing(facing: number): number {
  const [fx, fz] = FACINGS[facing & FACING_MASK];
  return facingIndexOf(-fx, -fz);
}

/** 水平方向 → 朝向序号；不是水平单位方向时返回 0。 */
export function facingIndexOf(dx: number, dz: number): number {
  const index = FACINGS.findIndex(([fx, fz]) => fx === dx && fz === dz);
  return index < 0 ? 0 : index;
}

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): BlockBox => ({
  x0,
  y0,
  z0,
  x1,
  y1,
  z1,
});

export const FULL_BOX = box(0, 0, 0, 1, 1, 1);
const FULL_BOXES: readonly BlockBox[] = [FULL_BOX];
const NO_BOXES: readonly BlockBox[] = [];
/** 花草的选中盒（比整格略小，视觉上贴合十字面片）。 */
const CROSS_INSET = 0.2;
const CROSS_BOXES: readonly BlockBox[] = [box(CROSS_INSET, 0, CROSS_INSET, 1 - CROSS_INSET, 0.8, 1 - CROSS_INSET)];

const SLAB_BOTTOM: readonly BlockBox[] = [box(0, 0, 0, 1, 0.5, 1)];
const BED_BOXES: readonly BlockBox[] = [box(0, 0, 0, 1, BED_HEIGHT, 1)];
const FARMLAND_BOXES: readonly BlockBox[] = [box(0, 0, 0, 1, FARMLAND_HEIGHT, 1)];
/** 仙人掌比整格细 1/16（1.8.9 同）。 */
const CACTUS_INSET = 1 / 16;
const CACTUS_BOXES: readonly BlockBox[] = [
  box(CACTUS_INSET, 0, CACTUS_INSET, 1 - CACTUS_INSET, 1, 1 - CACTUS_INSET),
];
/** 酿造台：底座 2/16 高，中杆 2/16 粗、14/16 高。 */
const BREWING_BASE_HEIGHT = 2 / 16;
const BREWING_ROD_HALF = 1 / 16;
const BREWING_ROD_HEIGHT = 14 / 16;
const BREWING_STAND_BOXES: readonly BlockBox[] = [
  box(0, 0, 0, 1, BREWING_BASE_HEIGHT, 1),
  box(0.5 - BREWING_ROD_HALF, 0, 0.5 - BREWING_ROD_HALF, 0.5 + BREWING_ROD_HALF, BREWING_ROD_HEIGHT, 0.5 + BREWING_ROD_HALF),
];
const ENCHANTING_TABLE_HEIGHT = 0.75;
const ANVIL_INSET = 2 / 16;
const ANVIL_BASE_HEIGHT = 4 / 16;
const ANVIL_TOP_START = 10 / 16;
const ANVIL_BOXES: readonly BlockBox[] = [
  box(ANVIL_INSET, 0, ANVIL_INSET, 1 - ANVIL_INSET, ANVIL_BASE_HEIGHT, 1 - ANVIL_INSET),
  box(0.5 - ANVIL_INSET, ANVIL_BASE_HEIGHT, 0.5 - ANVIL_INSET, 0.5 + ANVIL_INSET, ANVIL_TOP_START, 0.5 + ANVIL_INSET),
  box(0, ANVIL_TOP_START, ANVIL_INSET, 1, 1, 1 - ANVIL_INSET),
];
const ENCHANTING_TABLE_BOXES: readonly BlockBox[] = [box(0, 0, 0, 1, ENCHANTING_TABLE_HEIGHT, 1)];
/** 贴在格子某一侧面的薄板（厚度 t，方向 (dx,dz) 指向该侧面）。 */
function panelBox(dx: number, dz: number, t: number): BlockBox {
  if (dx === 1) {
    return box(1 - t, 0, 0, 1, 1, 1);
  }
  if (dx === -1) {
    return box(0, 0, 0, t, 1, 1);
  }
  if (dz === 1) {
    return box(0, 0, 1 - t, 1, 1, 1);
  }
  return box(0, 0, 0, 1, 1, t);
}

/**
 * 门：关着时门板横在通道上（朝向的反面），开着时转 90° 贴到右手边，让出通道。
 * 索引 [朝向][是否打开]。
 */
const DOOR_BOXES: readonly BlockBox[][][] = FACINGS.map(([fx, fz]) => [
  [panelBox(-fx, -fz, DOOR_THICKNESS)],
  [panelBox(-fz, fx, DOOR_THICKNESS)],
]);

/** 栅栏：中心柱 4/16 见方，横杆在 6~9 与 12~15 两层。 */
const FENCE_POST_MIN = 6 / 16;
const FENCE_POST_MAX = 10 / 16;
const FENCE_ARM_MIN = 7 / 16;
const FENCE_ARM_MAX = 9 / 16;
const FENCE_ARM_LEVELS: readonly (readonly [number, number])[] = [
  [6 / 16, 9 / 16],
  [12 / 16, 15 / 16],
];

/** 生成某个连接掩码下的栅栏子盒；postTop 用于把碰撞盒抬高到 1.5 格。 */
function buildFenceBoxes(mask: number, postTop: number): BlockBox[] {
  const boxes: BlockBox[] = [box(FENCE_POST_MIN, 0, FENCE_POST_MIN, FENCE_POST_MAX, postTop, FENCE_POST_MAX)];
  for (let facing = 0; facing < FACINGS.length; facing++) {
    if ((mask & connectionBit(facing)) === 0) {
      continue;
    }
    const [dx, dz] = FACINGS[facing];
    for (const [y0, y1] of FENCE_ARM_LEVELS) {
      if (dx !== 0) {
        const x0 = dx > 0 ? FENCE_POST_MAX : 0;
        const x1 = dx > 0 ? 1 : FENCE_POST_MIN;
        boxes.push(box(x0, y0, FENCE_ARM_MIN, x1, y1, FENCE_ARM_MAX));
      } else {
        const z0 = dz > 0 ? FENCE_POST_MAX : 0;
        const z1 = dz > 0 ? 1 : FENCE_POST_MIN;
        boxes.push(box(FENCE_ARM_MIN, y0, z0, FENCE_ARM_MAX, y1, z1));
      }
    }
  }
  return boxes;
}

const FENCE_BOXES: readonly BlockBox[][] = Array.from({ length: CONNECTION_COUNT }, (_, mask) =>
  buildFenceBoxes(mask, 1),
);
const FENCE_COLLISION_BOXES: readonly BlockBox[][] = Array.from({ length: CONNECTION_COUNT }, (_, mask) =>
  buildFenceBoxes(mask, FENCE_COLLISION_HEIGHT),
);

/** 栅栏门：门板厚 2/16、下沿离地 5/16；开着时两扇缩到通道两侧。 */
const GATE_THICKNESS_MIN = 7 / 16;
const GATE_THICKNESS_MAX = 9 / 16;
const GATE_BOTTOM = 5 / 16;
const GATE_SIDE_DEPTH = 2 / 16;

function buildGateBoxes(top: number): readonly BlockBox[][][] {
  return FACINGS.map(([fx]) => {
    const alongX = fx !== 0;
    const closed = alongX
      ? [box(GATE_THICKNESS_MIN, GATE_BOTTOM, 0, GATE_THICKNESS_MAX, top, 1)]
      : [box(0, GATE_BOTTOM, GATE_THICKNESS_MIN, 1, top, GATE_THICKNESS_MAX)];
    const open = alongX
      ? [
          box(GATE_THICKNESS_MIN, GATE_BOTTOM, 0, GATE_THICKNESS_MAX, top, GATE_SIDE_DEPTH),
          box(GATE_THICKNESS_MIN, GATE_BOTTOM, 1 - GATE_SIDE_DEPTH, GATE_THICKNESS_MAX, top, 1),
        ]
      : [
          box(0, GATE_BOTTOM, GATE_THICKNESS_MIN, GATE_SIDE_DEPTH, top, GATE_THICKNESS_MAX),
          box(1 - GATE_SIDE_DEPTH, GATE_BOTTOM, GATE_THICKNESS_MIN, 1, top, GATE_THICKNESS_MAX),
        ];
    return [closed, open];
  });
}

const GATE_BOXES = buildGateBoxes(1);
/** 关着的栅栏门和栅栏一样有 1.5 格碰撞高度，跳不过去。 */
const GATE_COLLISION_BOXES = buildGateBoxes(FENCE_COLLISION_HEIGHT);

/** 梯子厚度（1.8.9 为 2/16）。 */
const LADDER_THICKNESS = 2 / 16;
/** 按朝向序号索引：朝向是梯子正面对着的方向，背面贴墙。 */
const LADDER_BOXES: readonly BlockBox[][] = FACINGS.map(([fx, fz]) =>
  fx === 1
    ? [box(0, 0, 0, LADDER_THICKNESS, 1, 1)]
    : fx === -1
      ? [box(1 - LADDER_THICKNESS, 0, 0, 1, 1, 1)]
      : fz === 1
        ? [box(0, 0, 0, 1, 1, LADDER_THICKNESS)]
        : [box(0, 0, 1 - LADDER_THICKNESS, 1, 1, 1)],
);
const SLAB_TOP: readonly BlockBox[] = [box(0, 0.5, 0, 1, 1, 1)];

/** 楼梯：[朝向][是否颠倒] → 子盒列表。 */
const STAIRS_BOXES: readonly BlockBox[][][] = FACINGS.map(([dx, dz]) => {
  const step =
    dx === 1
      ? box(0.5, 0.5, 0, 1, 1, 1)
      : dx === -1
        ? box(0, 0.5, 0, 0.5, 1, 1)
        : dz === 1
          ? box(0, 0.5, 0.5, 1, 1, 1)
          : box(0, 0.5, 0, 1, 1, 0.5);
  const upright: BlockBox[] = [box(0, 0, 0, 1, 0.5, 1), step];
  const flipped: BlockBox[] = upright.map((b) => box(b.x0, 1 - b.y1, b.z0, b.x1, 1 - b.y0, b.z1));
  return [upright, flipped];
});

/**
 * 方块在给定 meta 下的子盒（渲染与选中用）。
 * @param connections 连接型方块（栅栏等）的四邻连接掩码，其余形状忽略
 */
export function shapeBoxes(def: BlockDef, meta: number, connections = 0): readonly BlockBox[] {
  switch (def.shape) {
    case BlockShape.FENCE:
      return FENCE_BOXES[connections & (CONNECTION_COUNT - 1)];
    case BlockShape.CROSS:
      return CROSS_BOXES;
    case BlockShape.SLAB:
      return (meta & SLAB_TOP_BIT) === 0 ? SLAB_BOTTOM : SLAB_TOP;
    case BlockShape.STAIRS:
      return STAIRS_BOXES[meta & FACING_MASK][(meta & STAIRS_FLIP_BIT) === 0 ? 0 : 1];
    case BlockShape.BED:
      return BED_BOXES;
    case BlockShape.FARMLAND:
      return FARMLAND_BOXES;
    case BlockShape.CACTUS:
      return CACTUS_BOXES;
    case BlockShape.BREWING_STAND:
      return BREWING_STAND_BOXES;
    case BlockShape.ENCHANTING_TABLE:
      return ENCHANTING_TABLE_BOXES;
    case BlockShape.ANVIL:
      return ANVIL_BOXES;
    case BlockShape.LADDER:
      return LADDER_BOXES[meta & FACING_MASK];
    case BlockShape.DOOR:
      return DOOR_BOXES[meta & FACING_MASK][(meta & DOOR_OPEN_BIT) === 0 ? 0 : 1];
    case BlockShape.FENCE_GATE:
      return GATE_BOXES[meta & FACING_MASK][(meta & GATE_OPEN_BIT) === 0 ? 0 : 1];
    default:
      return FULL_BOXES;
  }
}

/** 方块在给定 meta 下的碰撞盒；不阻挡实体时为空。栅栏的碰撞比外观高，跳不过去。 */
export function collisionBoxes(def: BlockDef, meta: number, connections = 0): readonly BlockBox[] {
  if (!def.solid) {
    return NO_BOXES;
  }
  if (def.shape === BlockShape.FENCE) {
    return FENCE_COLLISION_BOXES[connections & (CONNECTION_COUNT - 1)];
  }
  if (def.shape === BlockShape.FENCE_GATE) {
    // 开着的栅栏门可以直接走过去
    return (meta & GATE_OPEN_BIT) !== 0 ? NO_BOXES : GATE_COLLISION_BOXES[meta & FACING_MASK][0];
  }
  return shapeBoxes(def, meta, connections);
}

/** 方块所有子盒的并集（选中线框用；楼梯等多盒方块整体框住，与 1.8.9 一致）。 */
export function outlineBox(def: BlockDef, meta: number, connections = 0): BlockBox {
  const boxes = shapeBoxes(def, meta, connections);
  if (boxes.length === 1) {
    return boxes[0];
  }
  let x0 = 1;
  let y0 = 1;
  let z0 = 1;
  let x1 = 0;
  let y1 = 0;
  let z1 = 0;
  for (const b of boxes) {
    x0 = Math.min(x0, b.x0);
    y0 = Math.min(y0, b.y0);
    z0 = Math.min(z0, b.z0);
    x1 = Math.max(x1, b.x1);
    y1 = Math.max(y1, b.y1);
    z1 = Math.max(z1, b.z1);
  }
  return box(x0, y0, z0, x1, y1, z1);
}

/** 是否是完整立方体（面剔除与环境光遮蔽只认完整立方体）。 */
export function isFullCube(def: BlockDef): boolean {
  return def.shape === undefined || def.shape === BlockShape.FULL;
}

/** 形状是否需要知道四邻的连接情况。 */
export function needsConnections(def: BlockDef): boolean {
  return def.shape === BlockShape.FENCE;
}

/** 按四邻算出连接掩码；getNeighbor 返回该方向相邻方块的定义。 */
export function computeConnections(def: BlockDef, getNeighbor: (dx: number, dz: number) => BlockDef): number {
  let mask = 0;
  for (let facing = 0; facing < FACINGS.length; facing++) {
    const [dx, dz] = FACINGS[facing];
    if (canConnect(def, getNeighbor(dx, dz))) {
      mask |= connectionBit(facing);
    }
  }
  return mask;
}

/** 连接型方块之间是否相连：同一连接组之间相连，与完整实心方块也相连。 */
export function canConnect(def: BlockDef, neighbor: BlockDef): boolean {
  if (def.connectGroup !== undefined && def.connectGroup === neighbor.connectGroup) {
    return true;
  }
  return neighbor.solid && isFullCube(neighbor);
}
