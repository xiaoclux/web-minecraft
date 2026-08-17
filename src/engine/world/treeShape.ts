import { BlockId } from '../blocks/BlockRegistry';
import { COCOA_MAX_STAGE, COCOA_STAGE_SHIFT, FACINGS } from '../blocks/blockShapes';
import { createRng } from '../textures/PixelCanvas';
import { Wood } from './biomes';

/** 一棵树的确定性描述（位置 + 高度 + 树冠缺角的随机种子）。 */
export interface TreePlacement {
  x: number;
  /** 树干底部 y。 */
  y: number;
  z: number;
  height: number;
  /** 树冠四角是否缺失（按 [dy 层][角序号] 展开成一维，供裁剪时复现）。 */
  cornerSeed: number;
  /** 木材种类（原木 / 树叶的 meta 变种序号）。 */
  wood: number;
}

/** 树冠半径与顶部收窄的层数。 */
export const TREE_CANOPY_RADIUS = 2;
export const TREE_MIN_HEIGHT = 4;
export const TREE_HEIGHT_VARIANCE = 3;

/**
 * 依次回调这棵树的每个方块：先树叶后树干。
 * 树叶只应写在空气上、树干无条件覆盖，两个调用方（世界生成与树苗长大）行为一致。
 */
/** 每棵丛林树尝试挂几次可可果，以及每次的概率。 */
const COCOA_ATTEMPTS_PER_TREE = 2;
const COCOA_CHANCE_PER_ATTEMPT = 0.25;

export function forEachTreeBlock(
  tree: TreePlacement,
  emit: (x: number, y: number, z: number, id: number, meta: number) => void,
): void {
  const cornerRng = createRng(tree.cornerSeed);
  for (let dy = tree.height - 3; dy <= tree.height; dy++) {
    const radius = dy >= tree.height - 1 ? 1 : TREE_CANOPY_RADIUS;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const isCorner = Math.abs(dx) === radius && Math.abs(dz) === radius;
        // 角落缺失的随机数必须无条件消耗，保证不同 chunk 复现同一形状
        const cornerMissing = isCorner && (radius === 1 || cornerRng() < 0.5);
        if (cornerMissing) {
          continue;
        }
        emit(tree.x + dx, tree.y + dy, tree.z + dz, BlockId.LEAVES, tree.wood);
      }
    }
  }
  for (let i = 0; i < tree.height; i++) {
    emit(tree.x, tree.y + i, tree.z, BlockId.LOG, tree.wood);
  }
  emitCocoa(tree, cornerRng, emit);
}

/** 丛林树干上偶尔挂一两个可可果（1.8.9 只有丛林木有）。 */
function emitCocoa(
  tree: TreePlacement,
  rng: () => number,
  emit: (x: number, y: number, z: number, id: number, meta: number) => void,
): void {
  if (tree.wood !== Wood.JUNGLE) {
    return;
  }
  for (let i = 0; i < COCOA_ATTEMPTS_PER_TREE; i++) {
    // 随机数无条件消耗，保证相邻 chunk 复现同一棵树
    const roll = rng();
    const facing = Math.floor(rng() * FACINGS.length);
    const level = Math.floor(rng() * Math.max(1, tree.height - 3)) + 1;
    const stage = Math.floor(rng() * (COCOA_MAX_STAGE + 1));
    if (roll >= COCOA_CHANCE_PER_ATTEMPT) {
      continue;
    }
    const [dx, dz] = FACINGS[facing];
    emit(tree.x + dx, tree.y + level, tree.z + dz, BlockId.COCOA, facing | (stage << COCOA_STAGE_SHIFT));
  }
}
