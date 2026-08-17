import { COLOR_VARIANTS } from '../blocks/BlockRegistry';
import {
  ARMOR_MATERIALS,
  LOG_ITEM_IDS,
  PLANK_ITEM_IDS,
  TOOL_MATERIALS,
  WOOL_ITEM_IDS,
  dyeItemId,
  requireItem,
} from './ItemRegistry';
import { createStack, type ItemStack } from './ItemStack';

/**
 * 物品标签：配方里写 `#planks` 表示"任意木板"，与 1.8.9 里木板不分种类的行为一致。
 * 标签内容在 ItemRegistry 加载后按变种展开。
 */
const TAG_PREFIX = '#';

/** 标签 → 可用物品 id 集合。 */
const ITEM_TAGS: Record<string, readonly string[]> = {
  planks: PLANK_ITEM_IDS,
  log: LOG_ITEM_IDS,
  wool: WOOL_ITEM_IDS,
};

/** 配方格与实际物品是否匹配（支持标签）。 */
function ingredientMatches(ingredient: string | null, itemId: string | null): boolean {
  if (ingredient === null || itemId === null) {
    return ingredient === itemId;
  }
  if (!ingredient.startsWith(TAG_PREFIX)) {
    return ingredient === itemId;
  }
  return ITEM_TAGS[ingredient.slice(TAG_PREFIX.length)]?.includes(itemId) === true;
}

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

/**
 * 染料：花能捣成染料、骨头能磨成骨粉，其余按 1.8.9 的配色混合。
 * 依赖墨囊 / 仙人掌绿 / 可可豆的那几种（黑 / 绿 / 棕 / 灰 / 青 / 黄绿）等对应内容做出来再补。
 */
function dyeRecipes(): Recipe[] {
  const dye = (color: string): string => dyeItemId(color);
  return [
    shapeless(['bone'], 'bone_meal', 3),
    shapeless(['poppy'], dye('red')),
    shapeless(['dandelion'], dye('yellow')),
    shapeless([dye('red'), dye('yellow')], dye('orange'), 2),
    shapeless([dye('red'), dye('white')], dye('pink'), 2),
    shapeless([dye('red'), dye('blue')], dye('purple'), 2),
    shapeless([dye('purple'), dye('pink')], dye('magenta'), 2),
    shapeless([dye('blue'), dye('white')], dye('light_blue'), 2),
    shapeless([dye('black'), dye('white')], dye('gray'), 2),
    shapeless([dye('gray'), dye('white')], dye('light_gray'), 2),
  ];
}

/** 任意羊毛 + 染料 → 对应颜色的羊毛。 */
function woolDyeRecipes(): Recipe[] {
  return COLOR_VARIANTS.map((c) =>
    shapeless(['#wool', dyeItemId(c.id)], c.id === 'white' ? 'wool' : `${c.id}_wool`),
  );
}

/** 三种石头变种各自能磨成磨制版（2×2 出 4 个）。 */
function polishedStoneRecipes(): Recipe[] {
  return ['granite', 'diorite', 'andesite'].map((id) => shaped(['SS', 'SS'], { S: id }, `polished_${id}`, 4));
}

/** 每种原木都能砍成同种木板。 */
function woodRecipes(): Recipe[] {
  return LOG_ITEM_IDS.map((logId, index) => shapeless([logId], PLANK_ITEM_IDS[index], 4));
}

function toolRecipes(): ShapedRecipe[] {
  const out: ShapedRecipe[] = [];
  for (const mat of TOOL_MATERIALS) {
    const key = { M: mat.material === 'planks' ? '#planks' : mat.material, S: 'stick' };
    out.push(shaped(['MMM', ' S ', ' S '], key, `${mat.id}_pickaxe`));
    out.push(shaped(['MM', 'MS', ' S'], key, `${mat.id}_axe`));
    out.push(shaped(['M', 'S', 'S'], key, `${mat.id}_shovel`));
    out.push(shaped(['M', 'M', 'S'], key, `${mat.id}_sword`));
    out.push(shaped(['MM', ' S', ' S'], key, `${mat.id}_hoe`));
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

/** 盔甲：四种材质各四件，图案与 1.8.9 一致。 */
const ARMOR_PATTERNS: Record<string, string[]> = {
  helmet: ['MMM', 'M M'],
  chestplate: ['M M', 'MMM', 'MMM'],
  leggings: ['MMM', 'M M', 'M M'],
  boots: ['M M', 'M M'],
};

function armorRecipes(): ShapedRecipe[] {
  const out: ShapedRecipe[] = [];
  for (const [tier, spec] of Object.entries(ARMOR_MATERIALS)) {
    for (const [piece, pattern] of Object.entries(ARMOR_PATTERNS)) {
      out.push(shaped(pattern, { M: spec.material }, `${tier}_${piece}`));
    }
  }
  return out;
}

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
  shaped(['P', 'P'], { P: '#planks' }, 'stick', 4),
  shaped(['PP', 'PP'], { P: '#planks' }, 'crafting_table'),
  shaped(['CCC', 'C C', 'CCC'], { C: 'cobblestone' }, 'furnace'),
  shaped(['PPP', 'P P', 'PPP'], { P: '#planks' }, 'chest'),
  shaped(['WWW', 'PPP'], { W: 'wool', P: '#planks' }, 'bed'),
  shaped(['S S', 'SSS', 'S S'], { S: 'stick' }, 'ladder', 3),
  shaped(['PP', 'PP', 'PP'], { P: '#planks' }, 'wooden_door'),
  shaped(['PSP', 'PSP'], { P: '#planks', S: 'stick' }, 'fence', 2),
  shaped(['SPS', 'SPS'], { P: '#planks', S: 'stick' }, 'fence_gate'),
  shaped(['C', 'S'], { C: 'coal', S: 'stick' }, 'torch', 4),
  shaped(['C', 'S'], { C: 'charcoal', S: 'stick' }, 'torch', 4),
  shaped(['SS', 'SS'], { S: 'sand' }, 'sandstone'),
  shaped(['SS', 'SS'], { S: 'stone' }, 'stone_bricks', 4),
  shaped(['SS', 'SS'], { S: 'snowball' }, 'snow'),
  shaped(['SSS', 'SSS', 'SSS'], { S: 'string' }, 'wool'),
  shaped(['PPP', 'BBB', 'PPP'], { P: '#planks', B: 'book' }, 'bookshelf'),
  shaped(['SSS'], { S: 'sugar_cane' }, 'paper', 3),
  shapeless(['paper', 'paper', 'paper', 'leather'], 'book'),
  shaped(['GGG', 'GGG', 'GGG'], { G: 'glowstone' }, 'glowstone'),
  shaped(['GSG', 'SGS', 'GSG'], { G: 'gunpowder', S: 'sand' }, 'tnt'),
  shaped([' SF', 'S F', ' SF'], { S: 'stick', F: 'string' }, 'bow'),
  shaped([' I', 'I '], { I: 'iron_ingot' }, 'shears'),
  shaped(['I I', ' I '], { I: 'iron_ingot' }, 'bucket'),
  shaped(['I ', ' F'], { I: 'iron_ingot', F: 'flint' }, 'flint_and_steel'),
  shaped(['F', 'S', 'E'], { F: 'cobblestone', S: 'stick', E: 'feather' }, 'arrow', 4),
  shaped(['WWW'], { W: 'wheat' }, 'bread'),
  shapeless(['sugar_cane'], 'sugar'),
  shaped(['GGG', 'GAG', 'GGG'], { G: 'gold_ingot', A: 'apple' }, 'golden_apple'),
  shaped(['GGG', 'GCG', 'GGG'], { G: 'gold_nugget', C: 'carrot' }, 'golden_carrot'),
  shaped(['GGG', 'GMG', 'GGG'], { G: 'gold_nugget', M: 'melon_slice' }, 'glistering_melon'),
  shaped(['GGG', 'GGG', 'GGG'], { G: 'gold_nugget' }, 'gold_ingot'),
  shapeless(['gold_ingot'], 'gold_nugget', 9),
  shaped(['G G', ' G '], { G: 'glass' }, 'glass_bottle', 3),
  shapeless(['blaze_rod'], 'blaze_powder', 2),
  shapeless(['blaze_powder', 'ender_pearl'], 'ender_eye'),
  shaped(['GGG', 'GSG', 'OOO'], { G: 'glass', S: 'nether_star', O: 'obsidian' }, 'beacon'),
  shaped(['RRR', 'RRR', 'RRR'], { R: 'redstone' }, 'redstone_block'),
  shapeless(['redstone_block'], 'redstone', 9),
  shaped(['R', 'S'], { R: 'redstone', S: 'stick' }, 'redstone_torch'),
  shaped(['S', 'C'], { S: 'stick', C: 'cobblestone' }, 'lever'),
  shapeless(['stone'], 'stone_button'),
  shaped(['SS'], { S: 'stone' }, 'stone_pressure_plate'),
  shaped([' R ', 'RGR', ' R '], { R: 'redstone', G: 'glowstone' }, 'redstone_lamp'),
  shaped(['TRT', 'SSS'], { T: 'redstone_torch', R: 'redstone', S: 'stone' }, 'repeater'),
  shaped(['PPP', 'PRP', 'PPP'], { P: '#planks', R: 'redstone' }, 'note_block'),
  shaped(['GGG', 'QQQ', 'SSS'], { G: 'glass', Q: 'quartz', S: 'oak_slab' }, 'daylight_sensor'),
  shaped([' T ', 'TQT', 'SSS'], { T: 'redstone_torch', Q: 'quartz', S: 'stone' }, 'comparator'),
  shaped(['I', 'S', 'P'], { I: 'iron_ingot', S: 'stick', P: '#planks' }, 'tripwire_hook'),
  shapeless(['chest', 'tripwire_hook'], 'trapped_chest'),
  shaped(['GGG', 'GGG'], { G: 'glass' }, 'glass_pane', 16),
  shaped(['III', 'III'], { I: 'iron_ingot' }, 'iron_bars', 16),
  shaped(['PPP', 'PPP'], { P: '#planks' }, 'trapdoor', 2),
  shaped(['PPP', 'CIC', 'CRC'], { P: '#planks', C: 'cobblestone', I: 'iron_ingot', R: 'redstone' }, 'piston'),
  shapeless(['piston', 'slimeball'], 'sticky_piston'),
  shaped(['I I', 'ICI', ' I '], { I: 'iron_ingot', C: 'chest' }, 'hopper'),
  shaped(['CCC', 'CBC', 'CRC'], { C: 'cobblestone', B: 'bow', R: 'redstone' }, 'dispenser'),
  shaped(['CCC', 'C C', 'CRC'], { C: 'cobblestone', R: 'redstone' }, 'dropper'),
  shaped(['I I', 'ISI', 'I I'], { I: 'iron_ingot', S: 'stick' }, 'rail', 16),
  shaped(['G G', 'GSG', 'GRG'], { G: 'gold_ingot', S: 'stick', R: 'redstone' }, 'powered_rail', 6),
  shaped(['I I', 'III'], { I: 'iron_ingot' }, 'minecart'),
  shaped(['QQ', 'QQ'], { Q: 'quartz' }, 'quartz_block'),
  shapeless(['blaze_powder', 'slimeball'], 'magma_cream'),
  // 1.8.9 还要一个棕色蘑菇；蘑菇没做之前先用蛛眼 + 糖
  shapeless(['spider_eye', 'sugar'], 'fermented_spider_eye'),
  shaped(['GG', 'GG'], { G: 'glowstone_dust' }, 'glowstone'),
  shaped([' B ', 'CCC'], { B: 'blaze_rod', C: 'cobblestone' }, 'brewing_stand'),
  shaped([' B ', 'DOD', 'OOO'], { B: 'book', D: 'diamond', O: 'obsidian' }, 'enchanting_table'),
  shaped(['III', 'III', 'III'], { I: 'iron_ingot' }, 'iron_block'),
  shaped(['GGG', 'GGG', 'GGG'], { G: 'gold_ingot' }, 'gold_block'),
  shaped(['DDD', 'DDD', 'DDD'], { D: 'diamond' }, 'diamond_block'),
  shapeless(['iron_block'], 'iron_ingot', 9),
  shapeless(['gold_block'], 'gold_ingot', 9),
  shapeless(['diamond_block'], 'diamond', 9),
  shaped(['BBB', ' I ', 'III'], { B: 'iron_block', I: 'iron_ingot' }, 'anvil'),
  shapeless(['pumpkin'], 'wheat_seeds', 4),
  shapeless(['melon_slice'], 'wheat_seeds'),
  shaped(['MMM', 'MMM', 'MMM'], { M: 'melon_slice' }, 'melon'),
  ...woodRecipes(),
  ...polishedStoneRecipes(),
  ...dyeRecipes(),
  ...woolDyeRecipes(),
  ...toolRecipes(),
  ...slabAndStairsRecipes(),
  ...armorRecipes(),
];

/** 校验配方引用的物品都存在（标签只校验标签本身有定义）。 */
function checkIngredient(ingredient: string): void {
  if (ingredient.startsWith(TAG_PREFIX)) {
    const tag = ingredient.slice(TAG_PREFIX.length);
    if (!ITEM_TAGS[tag]?.length) {
      throw new Error(`Unknown item tag: ${ingredient}`);
    }
    return;
  }
  requireItem(ingredient);
}

for (const recipe of RECIPES) {
  requireItem(recipe.result.id);
  if (recipe.type === 'shaped') {
    Object.values(recipe.key).forEach(checkIngredient);
  } else {
    recipe.ingredients.forEach(checkIngredient);
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
      if (!ingredientMatches(pat.cells[i], trimmed.cells[i])) {
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
    const idx = pool.findIndex((ingredient) => ingredientMatches(ingredient, id));
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
