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
/** 门板厚度（1.8.9 为 3/16）。 */
export const DOOR_THICKNESS = 3 / 16;
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

/** 方块在给定 meta 下的子盒（渲染与选中用）。 */
export function shapeBoxes(def: BlockDef, meta: number): readonly BlockBox[] {
  switch (def.shape) {
    case BlockShape.CROSS:
      return CROSS_BOXES;
    case BlockShape.SLAB:
      return (meta & SLAB_TOP_BIT) === 0 ? SLAB_BOTTOM : SLAB_TOP;
    case BlockShape.STAIRS:
      return STAIRS_BOXES[meta & FACING_MASK][(meta & STAIRS_FLIP_BIT) === 0 ? 0 : 1];
    case BlockShape.BED:
      return BED_BOXES;
    case BlockShape.LADDER:
      return LADDER_BOXES[meta & FACING_MASK];
    case BlockShape.DOOR:
      return DOOR_BOXES[meta & FACING_MASK][(meta & DOOR_OPEN_BIT) === 0 ? 0 : 1];
    default:
      return FULL_BOXES;
  }
}

/** 方块在给定 meta 下的碰撞盒；不阻挡实体时为空。 */
export function collisionBoxes(def: BlockDef, meta: number): readonly BlockBox[] {
  if (!def.solid) {
    return NO_BOXES;
  }
  return shapeBoxes(def, meta);
}

/** 方块所有子盒的并集（选中线框用；楼梯等多盒方块整体框住，与 1.8.9 一致）。 */
export function outlineBox(def: BlockDef, meta: number): BlockBox {
  const boxes = shapeBoxes(def, meta);
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
