/**
 * 药水与酿造：药水种类是纯数据，每种对应一个状态效果 + 时长 + 等级；
 * 酿造规则是"（基础药水, 原料）→ 目标药水"的查表，外加红石 / 萤石 / 火药三种通用改性。
 * 1.8.9 里药水靠 damage 值区分，这里每种药水（含喷溅版）各占一个物品 id，进背包 / 存档更直白。
 */

import { TICKS_PER_SECOND } from '../constants/game';
import { EFFECT_DEFS, EffectId } from '../entities/effects';

/** 药水时长按 1.8.9 的秒数写，读起来直观。 */
const seconds = (n: number): number => n * TICKS_PER_SECOND;

/** 药水种类。 */
export interface PotionDef {
  id: string;
  label: string;
  /** 瓶中液体颜色（图标 / 粒子）。 */
  color: string;
  /** 附带的效果；水瓶与粗制药水没有。 */
  effect?: EffectId;
  amplifier: number;
  /** 持续 tick；瞬间效果为 0。 */
  ticks: number;
  /** 红石延长后的种类 id（没有则不能延长）。 */
  longer?: string;
  /** 萤石增强后的种类 id（没有则不能增强）。 */
  stronger?: string;
}

/** 无效果的两种基础药水。 */
export const PotionBase = {
  WATER: 'water',
  AWKWARD: 'awkward',
} as const;

const WATER_COLOR = '#385dc6';

/**
 * 效果药水的三档写法：普通 / 延长（红石）/ 增强（萤石）。
 * 时长取 1.8.9 数值；瞬间类没有时长与延长档。
 */
interface EffectPotionSpec {
  effect: EffectId;
  label: string;
  base: number;
  long?: number;
  /** 增强档的时长（等级 II）；未给出则没有增强档。 */
  strong?: number;
}

const EFFECT_POTIONS: readonly EffectPotionSpec[] = [
  { effect: EffectId.SPEED, label: '迅捷药水', base: seconds(180), long: seconds(480), strong: seconds(90) },
  { effect: EffectId.SLOWNESS, label: '迟缓药水', base: seconds(90), long: seconds(240) },
  { effect: EffectId.STRENGTH, label: '力量药水', base: seconds(180), long: seconds(480), strong: seconds(90) },
  { effect: EffectId.WEAKNESS, label: '虚弱药水', base: seconds(90), long: seconds(240) },
  { effect: EffectId.INSTANT_HEALTH, label: '治疗药水', base: 0, strong: 0 },
  { effect: EffectId.INSTANT_DAMAGE, label: '伤害药水', base: 0, strong: 0 },
  { effect: EffectId.REGENERATION, label: '再生药水', base: seconds(45), long: seconds(120), strong: seconds(22) },
  { effect: EffectId.POISON, label: '剧毒药水', base: seconds(45), long: seconds(120), strong: seconds(22) },
  { effect: EffectId.JUMP_BOOST, label: '跳跃药水', base: seconds(180), long: seconds(480), strong: seconds(90) },
  { effect: EffectId.FIRE_RESISTANCE, label: '抗火药水', base: seconds(180), long: seconds(480) },
  { effect: EffectId.WATER_BREATHING, label: '水肺药水', base: seconds(180), long: seconds(480) },
  { effect: EffectId.NIGHT_VISION, label: '夜视药水', base: seconds(180), long: seconds(480) },
  { effect: EffectId.INVISIBILITY, label: '隐身药水', base: seconds(180), long: seconds(480) },
];

const LONG_SUFFIX = '_long';
const STRONG_SUFFIX = '_strong';

function buildPotionDefs(): Record<string, PotionDef> {
  const out: Record<string, PotionDef> = {
    water: { id: PotionBase.WATER, label: '水瓶', color: WATER_COLOR, amplifier: 0, ticks: 0 },
    awkward: { id: PotionBase.AWKWARD, label: '粗制的药水', color: WATER_COLOR, amplifier: 0, ticks: 0 },
  };
  for (const spec of EFFECT_POTIONS) {
    const color = EFFECT_DEFS[spec.effect].color;
    const id = spec.effect;
    const longer = spec.long !== undefined ? `${id}${LONG_SUFFIX}` : undefined;
    const stronger = spec.strong !== undefined ? `${id}${STRONG_SUFFIX}` : undefined;
    out[id] = { id, label: spec.label, color, effect: spec.effect, amplifier: 0, ticks: spec.base, longer, stronger };
    if (longer && spec.long !== undefined) {
      out[longer] = { id: longer, label: spec.label, color, effect: spec.effect, amplifier: 0, ticks: spec.long };
    }
    if (stronger && spec.strong !== undefined) {
      out[stronger] = { id: stronger, label: spec.label, color, effect: spec.effect, amplifier: 1, ticks: spec.strong };
    }
  }
  return out;
}

/** 全部药水种类。 */
export const POTION_DEFS: Readonly<Record<string, PotionDef>> = buildPotionDefs();

/** 药水物品 id 前缀。 */
export const POTION_ITEM_PREFIX = 'potion_';
export const SPLASH_POTION_ITEM_PREFIX = 'splash_potion_';

/** 药水种类 → 物品 id。 */
export function potionItemId(potionId: string, splash = false): string {
  return `${splash ? SPLASH_POTION_ITEM_PREFIX : POTION_ITEM_PREFIX}${potionId}`;
}

/** 一个药水物品：种类 + 是否喷溅。 */
export interface PotionItem {
  potion: PotionDef;
  splash: boolean;
}

/** 物品 id → 药水（不是药水返回 null）。 */
export function potionOfItem(itemId: string): PotionItem | null {
  if (itemId.startsWith(SPLASH_POTION_ITEM_PREFIX)) {
    const potion = POTION_DEFS[itemId.slice(SPLASH_POTION_ITEM_PREFIX.length)];
    return potion ? { potion, splash: true } : null;
  }
  if (itemId.startsWith(POTION_ITEM_PREFIX)) {
    const potion = POTION_DEFS[itemId.slice(POTION_ITEM_PREFIX.length)];
    return potion ? { potion, splash: false } : null;
  }
  return null;
}

// ---------------------------------------------------------------- 酿造规则

/** 原料物品 id。 */
export const BrewingIngredient = {
  NETHER_WART: 'nether_wart',
  SUGAR: 'sugar',
  GLISTERING_MELON: 'glistering_melon',
  SPIDER_EYE: 'spider_eye',
  GHAST_TEAR: 'ghast_tear',
  BLAZE_POWDER: 'blaze_powder',
  MAGMA_CREAM: 'magma_cream',
  GOLDEN_CARROT: 'golden_carrot',
  RABBIT_FOOT: 'rabbit_foot',
  FERMENTED_SPIDER_EYE: 'fermented_spider_eye',
  REDSTONE: 'redstone',
  GLOWSTONE_DUST: 'glowstone_dust',
  GUNPOWDER: 'gunpowder',
} as const;

/** 在粗制药水上加原料得到的效果药水。 */
const AWKWARD_RECIPES: Readonly<Record<string, string>> = {
  [BrewingIngredient.SUGAR]: EffectId.SPEED,
  [BrewingIngredient.GLISTERING_MELON]: EffectId.INSTANT_HEALTH,
  [BrewingIngredient.SPIDER_EYE]: EffectId.POISON,
  [BrewingIngredient.GHAST_TEAR]: EffectId.REGENERATION,
  [BrewingIngredient.BLAZE_POWDER]: EffectId.STRENGTH,
  [BrewingIngredient.MAGMA_CREAM]: EffectId.FIRE_RESISTANCE,
  [BrewingIngredient.GOLDEN_CARROT]: EffectId.NIGHT_VISION,
  [BrewingIngredient.RABBIT_FOOT]: EffectId.JUMP_BOOST,
};

/**
 * 发酵蛛眼的"反转"表：正面效果变成对应的负面效果（1.8.9 同）。
 * 延长 / 增强档跟着基础档一起映射到目标的同一档（目标没有该档时退回基础档）。
 */
const CORRUPTIONS: Readonly<Record<string, string>> = {
  [PotionBase.WATER]: EffectId.WEAKNESS,
  [EffectId.SPEED]: EffectId.SLOWNESS,
  [EffectId.JUMP_BOOST]: EffectId.SLOWNESS,
  [EffectId.INSTANT_HEALTH]: EffectId.INSTANT_DAMAGE,
  [EffectId.POISON]: EffectId.INSTANT_DAMAGE,
  [EffectId.NIGHT_VISION]: EffectId.INVISIBILITY,
  [EffectId.STRENGTH]: EffectId.WEAKNESS,
};

/** 一次酿造需要的 tick（1.8.9 为 400 = 20 秒）。 */
export const BREW_TICKS = 400;

/** 拆出药水 id 的"档位"（普通 / 延长 / 增强）。 */
function tierOf(potionId: string): { base: string; suffix: string } {
  if (potionId.endsWith(LONG_SUFFIX)) {
    return { base: potionId.slice(0, -LONG_SUFFIX.length), suffix: LONG_SUFFIX };
  }
  if (potionId.endsWith(STRONG_SUFFIX)) {
    return { base: potionId.slice(0, -STRONG_SUFFIX.length), suffix: STRONG_SUFFIX };
  }
  return { base: potionId, suffix: '' };
}

/**
 * 计算酿造结果：给定瓶里的药水与原料，返回酿出的药水物品 id；不能酿返回 null。
 * 喷溅药水保持喷溅；火药把普通药水变喷溅。
 */
export function brewResult(bottleItemId: string, ingredientId: string): string | null {
  const item = potionOfItem(bottleItemId);
  if (!item) {
    return null;
  }
  const { potion, splash } = item;
  if (ingredientId === BrewingIngredient.GUNPOWDER) {
    return splash ? null : potionItemId(potion.id, true);
  }
  if (ingredientId === BrewingIngredient.NETHER_WART) {
    return potion.id === PotionBase.WATER ? potionItemId(PotionBase.AWKWARD, splash) : null;
  }
  if (ingredientId === BrewingIngredient.REDSTONE) {
    return potion.longer ? potionItemId(potion.longer, splash) : null;
  }
  if (ingredientId === BrewingIngredient.GLOWSTONE_DUST) {
    return potion.stronger ? potionItemId(potion.stronger, splash) : null;
  }
  if (ingredientId === BrewingIngredient.FERMENTED_SPIDER_EYE) {
    const { base, suffix } = tierOf(potion.id);
    const target = CORRUPTIONS[base];
    if (!target) {
      return null;
    }
    const tiered = `${target}${suffix}`;
    return potionItemId(POTION_DEFS[tiered] ? tiered : target, splash);
  }
  if (potion.id === PotionBase.AWKWARD) {
    const target = AWKWARD_RECIPES[ingredientId];
    return target ? potionItemId(target, splash) : null;
  }
  return null;
}

const INGREDIENT_IDS: ReadonlySet<string> = new Set(Object.values(BrewingIngredient));

/** 某个物品能不能当酿造原料（放进原料格的前置判断）。 */
export function isBrewingIngredient(itemId: string): boolean {
  return INGREDIENT_IDS.has(itemId);
}
