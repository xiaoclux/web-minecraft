import { requireItem } from './ItemRegistry';
import { createStack, type ItemStack } from './ItemStack';

/** 有序配方。 */
export interface ShapedRecipe {
  type: 'shaped';
  /** 每行一个字符串，空格表示空位。 */
  pattern: string[];
  key: Record<string, string>;
  result: ItemStack;
}

/** 无序配方。 */
export interface ShapelessRecipe {
  type: 'shapeless';
  ingredients: string[];
  result: ItemStack;
}

export type Recipe = ShapedRecipe | ShapelessRecipe;

const shaped = (pattern: string[], key: Record<string, string>, result: string, count = 1): ShapedRecipe => ({
  type: 'shaped',
  pattern,
  key,
  result: createStack(result, count),
});
const shapeless = (ingredients: string[], result: string, count = 1): ShapelessRecipe => ({
  type: 'shapeless',
  ingredients,
  result: createStack(result, count),
});

const TIER_MATERIAL: Record<string, string> = {
  wooden: 'planks',
  stone: 'cobblestone',
  iron: 'iron_ingot',
  diamond: 'diamond',
};

function toolRecipes(): ShapedRecipe[] {
  const out: ShapedRecipe[] = [];
  for (const [tier, mat] of Object.entries(TIER_MATERIAL)) {
    const key = { M: mat, S: 'stick' };
    out.push(shaped(['MMM', ' S ', ' S '], key, `${tier}_pickaxe`));
    out.push(shaped(['MM', 'MS', ' S'], key, `${tier}_axe`));
    out.push(shaped(['M', 'S', 'S'], key, `${tier}_shovel`));
    out.push(shaped(['M', 'M', 'S'], key, `${tier}_sword`));
  }
  return out;
}

/** 半砖：一横排 3 个原料出 6 个；楼梯：阶梯状 6 个原料出 4 个。 */
const SLAB_MATERIAL: Record<string, string> = {
  stone_slab: 'stone',
  oak_slab: 'planks',
};
const STAIRS_MATERIAL: Record<string, string> = {
  oak_stairs: 'planks',
  cobblestone_stairs: 'cobblestone',
  brick_stairs: 'bricks',
  stone_brick_stairs: 'stone_bricks',
  sandstone_stairs: 'sandstone',
};

function slabAndStairsRecipes(): ShapedRecipe[] {
  const out: ShapedRecipe[] = [];
  for (const [result, material] of Object.entries(SLAB_MATERIAL)) {
    out.push(shaped(['MMM'], { M: material }, result, 6));
  }
  for (const [result, material] of Object.entries(STAIRS_MATERIAL)) {
    out.push(shaped(['M  ', 'MM ', 'MMM'], { M: material }, result, 4));
  }
  return out;
}

/** 全部配方。 */
export const RECIPES: Recipe[] = [
  shapeless(['log'], 'planks', 4),
  shaped(['P', 'P'], { P: 'planks' }, 'stick', 4),
  shaped(['PP', 'PP'], { P: 'planks' }, 'crafting_table'),
  shaped(['CCC', 'C C', 'CCC'], { C: 'cobblestone' }, 'furnace'),
  shaped(['PPP', 'P P', 'PPP'], { P: 'planks' }, 'chest'),
  shaped(['WWW', 'PPP'], { W: 'wool', P: 'planks' }, 'bed'),
  shaped(['S S', 'SSS', 'S S'], { S: 'stick' }, 'ladder', 3),
  shaped(['C', 'S'], { C: 'coal', S: 'stick' }, 'torch', 4),
  shaped(['C', 'S'], { C: 'charcoal', S: 'stick' }, 'torch', 4),
  shaped(['SS', 'SS'], { S: 'sand' }, 'sandstone'),
  shaped(['SS', 'SS'], { S: 'stone' }, 'stone_bricks', 4),
  shaped(['SS', 'SS'], { S: 'snowball' }, 'snow'),
  shaped(['SSS', 'SSS', 'SSS'], { S: 'string' }, 'wool'),
  shaped(['PPP', 'BBB', 'PPP'], { P: 'planks', B: 'wheat_seeds' }, 'bookshelf'),
  shaped(['GGG', 'GGG', 'GGG'], { G: 'glowstone' }, 'glowstone'),
  shaped(['GSG', 'SGS', 'GSG'], { G: 'gunpowder', S: 'sand' }, 'tnt'),
  shaped([' SF', 'S F', ' SF'], { S: 'stick', F: 'string' }, 'bow'),
  shaped(['F', 'S', 'E'], { F: 'cobblestone', S: 'stick', E: 'feather' }, 'arrow', 4),
  shapeless(['pumpkin'], 'wheat_seeds', 4),
  shapeless(['melon_slice'], 'wheat_seeds'),
  shaped(['MMM', 'MMM', 'MMM'], { M: 'melon_slice' }, 'melon'),
  ...toolRecipes(),
  ...slabAndStairsRecipes(),
];

for (const recipe of RECIPES) {
  requireItem(recipe.result.id);
  if (recipe.type === 'shaped') {
    Object.values(recipe.key).forEach(requireItem);
  } else {
    recipe.ingredients.forEach(requireItem);
  }
}

/** 网格：行优先，null 为空格。 */
export type CraftingGrid = (ItemStack | null)[];

interface Trimmed {
  rows: number;
  cols: number;
  cells: (string | null)[];
}

function trimGrid(grid: CraftingGrid, size: number): Trimmed | null {
  let minR = size;
  let maxR = -1;
  let minC = size;
  let maxC = -1;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r * size + c]) {
        minR = Math.min(minR, r);
        maxR = Math.max(maxR, r);
        minC = Math.min(minC, c);
        maxC = Math.max(maxC, c);
      }
    }
  }
  if (maxR < 0) {
    return null;
  }
  const rows = maxR - minR + 1;
  const cols = maxC - minC + 1;
  const cells: (string | null)[] = [];
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      cells.push(grid[r * size + c]?.id ?? null);
    }
  }
  return { rows, cols, cells };
}

function trimPattern(recipe: ShapedRecipe, mirror: boolean): Trimmed {
  const rows = recipe.pattern.length;
  const cols = Math.max(...recipe.pattern.map((p) => p.length));
  const cells: (string | null)[] = [];
  for (let r = 0; r < rows; r++) {
    const line = recipe.pattern[r].padEnd(cols, ' ');
    const chars = mirror ? [...line].reverse() : [...line];
    for (const ch of chars) {
      cells.push(ch === ' ' ? null : recipe.key[ch]);
    }
  }
  return { rows, cols, cells };
}

function matchesShaped(recipe: ShapedRecipe, trimmed: Trimmed): boolean {
  for (const mirror of [false, true]) {
    const pat = trimPattern(recipe, mirror);
    if (pat.rows !== trimmed.rows || pat.cols !== trimmed.cols) {
      continue;
    }
    let ok = true;
    for (let i = 0; i < pat.cells.length; i++) {
      if (pat.cells[i] !== trimmed.cells[i]) {
        ok = false;
        break;
      }
    }
    if (ok) {
      return true;
    }
  }
  return false;
}

function matchesShapeless(recipe: ShapelessRecipe, grid: CraftingGrid): boolean {
  const present = grid.filter((s): s is ItemStack => s !== null).map((s) => s.id);
  if (present.length !== recipe.ingredients.length) {
    return false;
  }
  const pool = [...recipe.ingredients];
  for (const id of present) {
    const idx = pool.indexOf(id);
    if (idx < 0) {
      return false;
    }
    pool.splice(idx, 1);
  }
  return pool.length === 0;
}

/**
 * 在网格上匹配配方。
 * @param grid 行优先网格
 * @param size 网格边长（2 或 3）
 * @returns 匹配到的产物（副本），无匹配返回 null
 */
export function matchRecipe(grid: CraftingGrid, size: number): ItemStack | null {
  const trimmed = trimGrid(grid, size);
  if (!trimmed) {
    return null;
  }
  for (const recipe of RECIPES) {
    if (recipe.type === 'shaped') {
      if (trimmed.rows <= size && trimmed.cols <= size && matchesShaped(recipe, trimmed)) {
        return { ...recipe.result };
      }
    } else if (matchesShapeless(recipe, grid)) {
      return { ...recipe.result };
    }
  }
  return null;
}
