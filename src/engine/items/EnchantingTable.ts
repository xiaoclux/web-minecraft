/**
 * 附魔台：书架加成 → 三档等级消耗 → 按附魔力随机抽出一组附魔。
 * 算法照 1.8.9：书架最多 15 个；三档消耗分别约为附魔力的 1/3、2/3、全额；
 * 抽附魔时先按物品的"可附魔性"随机抬高附魔力，再从满足最低附魔力的附魔里按权重抽。
 */

import { requireItem, TOOL_MATERIALS, type ItemDef } from './ItemRegistry';
import type { ItemStack } from './ItemStack';
import {
  BOOK_ITEM_ID,
  ENCHANTED_BOOK_ITEM_ID,
  ENCHANTMENT_DEFS,
  canEnchant,
  enchantsCompatible,
  type EnchantmentDef,
  type EnchantmentId,
} from './enchantments';

/** 附魔台生效的书架上限（1.8.9）。 */
export const MAX_BOOKSHELVES = 15;
/** 附魔台的三档选项。 */
export const ENCHANT_OPTION_COUNT = 3;
/** 每档消耗的青金石数与等级数（1.8 起都等于档位序号 + 1）。 */
export const LAPIS_PER_OPTION = [1, 2, 3] as const;
export const LEVELS_PER_OPTION = [1, 2, 3] as const;
export const LAPIS_ITEM_ID = 'lapis_lazuli';
/** 附魔台两个格子的下标。 */
export const ENCHANT_ITEM_SLOT = 0;
export const ENCHANT_LAPIS_SLOT = 1;
export const ENCHANTING_SLOT_COUNT = 2;
/** 最高档的等级消耗上限（1.8.9 为 30 级）。 */
const MAX_COST = 30;
/** 附魔台里最多同时抽到的附魔种数不设硬上限，但每多一个概率减半、附魔力也减半（1.8.9 同）。 */
const EXTRA_ENCHANT_DIVISOR = 50;

/** 一档附魔选项。 */
export interface EnchantOption {
  /** 需要的等级（未达到则不可选）。 */
  cost: number;
  /** 抽出的附魔（展示时只露第一项名字，与原版"看不全"的效果一致）。 */
  enchants: Record<string, number>;
}

/** 各材质的可附魔性（1.8.9）：金最好、石头最差。 */
const TOOL_ENCHANTABILITY: Readonly<Record<string, number>> = {
  wooden: 15,
  stone: 5,
  iron: 14,
  golden: 22,
  diamond: 10,
};
const ARMOR_ENCHANTABILITY: Readonly<Record<string, number>> = {
  leather: 15,
  iron: 9,
  golden: 25,
  diamond: 10,
};
const BOOK_ENCHANTABILITY = 1;

/** 物品的可附魔性；不能附魔返回 0。 */
export function enchantabilityOf(def: ItemDef): number {
  if (def.id === BOOK_ITEM_ID) {
    return BOOK_ENCHANTABILITY;
  }
  const material = def.id.slice(0, def.id.indexOf('_'));
  if (def.tool && TOOL_MATERIALS.some((m) => m.id === material)) {
    return TOOL_ENCHANTABILITY[material] ?? 0;
  }
  if (def.armor) {
    return ARMOR_ENCHANTABILITY[material] ?? 0;
  }
  return 0;
}

/**
 * 三档的等级消耗（1.8.9 的公式）。
 * @param shelves 附魔台周围生效的书架数（0~15）
 */
export function enchantCosts(shelves: number, random: () => number): number[] {
  const n = Math.min(MAX_BOOKSHELVES, shelves);
  const base = Math.floor(random() * 8) + 1 + (n >> 1) + Math.floor(random() * (n + 1));
  const costs = [Math.max(Math.floor(base / 3), 1), Math.floor((base * 2) / 3) + 1, Math.max(base, n * 2)];
  return costs.map((c) => Math.min(MAX_COST, c));
}

/**
 * 按等级消耗抽一组附魔（1.8.9 的 buildEnchantmentList）。
 * @returns 附魔 id → 等级；抽不到任何附魔返回空对象
 */
export function rollEnchantments(def: ItemDef, cost: number, random: () => number): Record<string, number> {
  const enchantability = enchantabilityOf(def);
  if (enchantability <= 0) {
    return {};
  }
  const bonus = Math.floor(enchantability / 4) + 1;
  let power = cost + 1 + Math.floor(random() * bonus) + Math.floor(random() * bonus);
  const spread = (random() + random() - 1) * 0.15;
  power = Math.max(1, Math.round(power + power * spread));
  const result: Record<string, number> = {};
  let candidates = availableEnchants(def, power);
  while (candidates.length > 0) {
    const pick = weightedPick(candidates, random);
    result[pick.def.id] = pick.level;
    // 每多抽一个：概率减半、附魔力减半，并去掉冲突项
    if (random() * EXTRA_ENCHANT_DIVISOR > power + 1) {
      break;
    }
    power = Math.floor(power / 2);
    candidates = availableEnchants(def, power).filter((c) =>
      Object.keys(result).every((id) => enchantsCompatible(id as EnchantmentId, c.def.id)),
    );
  }
  return result;
}

interface Candidate {
  def: EnchantmentDef;
  level: number;
}

/** 该附魔力下每种适用附魔能到的最高等级。 */
function availableEnchants(def: ItemDef, power: number): Candidate[] {
  const out: Candidate[] = [];
  for (const enchant of Object.values(ENCHANTMENT_DEFS)) {
    if (def.id !== BOOK_ITEM_ID && !canEnchant(def, enchant)) {
      continue;
    }
    let level = 0;
    for (let i = 0; i < enchant.maxLevel; i++) {
      if (power >= enchant.minPower[i]) {
        level = i + 1;
      }
    }
    if (level > 0) {
      out.push({ def: enchant, level });
    }
  }
  return out;
}

function weightedPick(candidates: Candidate[], random: () => number): Candidate {
  const total = candidates.reduce((sum, c) => sum + c.def.weight, 0);
  let roll = random() * total;
  for (const c of candidates) {
    roll -= c.def.weight;
    if (roll < 0) {
      return c;
    }
  }
  return candidates[candidates.length - 1];
}

/** 把附魔加到物品上：书变附魔书，其它物品原地带上附魔。 */
export function applyEnchants(stack: ItemStack, enchants: Record<string, number>): ItemStack {
  const id = stack.id === BOOK_ITEM_ID ? ENCHANTED_BOOK_ITEM_ID : stack.id;
  return { ...stack, id, enchants: { ...(stack.enchants ?? {}), ...enchants } };
}

/** 三档选项一次算好（同一个种子下同一件物品结果固定，换物品或附魔过一次后重掷）。 */
export function rollOptions(stack: ItemStack | null, shelves: number, random: () => number): EnchantOption[] | null {
  if (!stack || stack.enchants || enchantabilityOf(requireItem(stack.id)) <= 0) {
    return null;
  }
  const def = requireItem(stack.id);
  const costs = enchantCosts(shelves, random);
  return costs.map((cost) => ({ cost, enchants: rollEnchantments(def, cost, random) }));
}
