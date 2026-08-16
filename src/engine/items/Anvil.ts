/**
 * 铁砧：修复（同物品合并 / 用材料补耐久）、合并附魔（含附魔书）、重命名。
 * 规则取自 1.8.9 并做了简化：没有"累计使用惩罚"，等级消耗超过上限则视为太贵。
 */

import { ARMOR_MATERIALS, TOOL_MATERIALS, getItem, type ItemDef } from './ItemRegistry';
import type { ItemStack } from './ItemStack';
import {
  ENCHANTED_BOOK_ITEM_ID,
  ENCHANTMENT_DEFS,
  canEnchant,
  enchantsCompatible,
  isEnchantmentId,
  type EnchantmentId,
} from './enchantments';

/** 铁砧两个输入格的下标。 */
export const ANVIL_LEFT_SLOT = 0;
export const ANVIL_RIGHT_SLOT = 1;
export const ANVIL_SLOT_COUNT = 2;
/** 等级消耗超过这个数就"太贵了"（1.8.9 为 40）。 */
export const ANVIL_MAX_COST = 39;
/** 用材料修：每个材料补最大耐久的 25%。 */
const MATERIAL_REPAIR_RATIO = 0.25;
/** 两件同物品合并：在两者剩余耐久之和上再加最大耐久的 12%。 */
const COMBINE_REPAIR_BONUS = 0.12;
/** 每修一次（每个材料 / 一次合并耐久）的基础消耗。 */
const REPAIR_COST_PER_UNIT = 1;
/** 附魔转移的每级消耗：稀有的附魔更贵（按权重分档）。 */
const ENCHANT_COST_BY_WEIGHT: readonly [number, number][] = [
  [10, 1],
  [5, 2],
  [2, 4],
  [1, 8],
];
/** 重命名的消耗。 */
const RENAME_COST = 1;
/** 名字最长（1.8.9 为 30）。 */
export const MAX_ITEM_NAME_LENGTH = 30;

/** 铁砧的计算结果。 */
export interface AnvilResult {
  output: ItemStack;
  cost: number;
  /** 右格要消耗多少个（材料修复时可能只用一部分）。 */
  rightConsumed: number;
}

/** 物品的最大耐久（工具 / 盔甲 / 剪刀等）；没有返回 0。 */
export function maxDurabilityOf(def: ItemDef): number {
  return def.tool?.durability ?? def.armor?.durability ?? def.durability ?? 0;
}

/** 修这件物品要用的材料物品 id（铁镐 → 铁锭）；不能用材料修返回 null。 */
export function repairMaterialOf(def: ItemDef): string | null {
  const material = def.id.slice(0, def.id.indexOf('_'));
  if (def.tool) {
    return TOOL_MATERIALS.find((m) => m.id === material)?.material ?? null;
  }
  if (def.armor) {
    return ARMOR_MATERIALS[material]?.material ?? null;
  }
  return null;
}

function enchantCostPerLevel(id: EnchantmentId): number {
  const weight = ENCHANTMENT_DEFS[id].weight;
  for (const [minWeight, cost] of ENCHANT_COST_BY_WEIGHT) {
    if (weight >= minWeight) {
      return cost;
    }
  }
  return ENCHANT_COST_BY_WEIGHT[ENCHANT_COST_BY_WEIGHT.length - 1][1];
}

/**
 * 把 source 的附魔并到 target 上：同种取高等级、等级相同则 +1（不超过上限）、冲突的跳过。
 * @returns 合并后的附魔表与消耗
 */
function mergeEnchants(
  targetDef: ItemDef,
  target: Record<string, number>,
  source: Record<string, number>,
  targetIsBook: boolean,
): { enchants: Record<string, number>; cost: number } {
  const enchants = { ...target };
  let cost = 0;
  for (const [id, level] of Object.entries(source)) {
    if (!isEnchantmentId(id)) {
      continue;
    }
    const def = ENCHANTMENT_DEFS[id];
    if (!targetIsBook && !canEnchant(targetDef, def)) {
      continue;
    }
    const conflict = Object.keys(enchants).some(
      (existing) => existing !== id && isEnchantmentId(existing) && !enchantsCompatible(existing, id),
    );
    if (conflict) {
      cost += 1;
      continue;
    }
    const existing = enchants[id] ?? 0;
    const merged = existing === level ? Math.min(def.maxLevel, level + 1) : Math.max(existing, level);
    enchants[id] = merged;
    cost += merged * enchantCostPerLevel(id);
  }
  return { enchants, cost };
}

/**
 * 计算铁砧输出。left 为要处理的物品，right 为材料 / 同物品 / 附魔书（可空），name 为新名字（空串表示不改）。
 * 无法产出（什么都没变、或不合法）返回 null。
 */
export function anvilResult(left: ItemStack | null, right: ItemStack | null, name: string): AnvilResult | null {
  if (!left) {
    return null;
  }
  const leftDef = getItem(left.id);
  if (!leftDef) {
    return null;
  }
  const trimmed = name.trim().slice(0, MAX_ITEM_NAME_LENGTH);
  const renaming = trimmed !== '' && trimmed !== (left.name ?? '');
  let output: ItemStack = { ...left, enchants: left.enchants ? { ...left.enchants } : undefined };
  let cost = 0;
  let rightConsumed = 0;
  const maxDurability = maxDurabilityOf(leftDef);

  if (right) {
    const rightDef = getItem(right.id);
    if (!rightDef) {
      return null;
    }
    const isBook = right.id === ENCHANTED_BOOK_ITEM_ID && !!right.enchants;
    if (isBook || (right.id === left.id && left.id !== ENCHANTED_BOOK_ITEM_ID)) {
      // 同物品合并：先修耐久，再并附魔
      if (!isBook && maxDurability > 0) {
        const leftLeft = maxDurability - (left.damage ?? 0);
        const rightLeft = maxDurability - (right.damage ?? 0);
        const repaired = Math.min(
          maxDurability,
          leftLeft + rightLeft + Math.floor(maxDurability * COMBINE_REPAIR_BONUS),
        );
        if (repaired > leftLeft) {
          output.damage = maxDurability - repaired;
          cost += REPAIR_COST_PER_UNIT * 2;
        }
      }
      if (right.enchants) {
        const merged = mergeEnchants(
          leftDef,
          output.enchants ?? {},
          right.enchants,
          left.id === ENCHANTED_BOOK_ITEM_ID,
        );
        if (Object.keys(merged.enchants).length > 0) {
          output.enchants = merged.enchants;
        }
        cost += merged.cost;
      }
      rightConsumed = 1;
    } else if (repairMaterialOf(leftDef) === right.id && maxDurability > 0 && (left.damage ?? 0) > 0) {
      // 材料修复：每个材料补 25%，用到修满或材料用完为止
      const perUnit = Math.max(1, Math.floor(maxDurability * MATERIAL_REPAIR_RATIO));
      let damage = left.damage ?? 0;
      while (damage > 0 && rightConsumed < right.count) {
        damage = Math.max(0, damage - perUnit);
        rightConsumed++;
        cost += REPAIR_COST_PER_UNIT;
      }
      output.damage = damage;
    } else {
      return null;
    }
  }

  if (renaming) {
    output = { ...output, name: trimmed };
    cost += RENAME_COST;
  }
  if (cost === 0) {
    return null;
  }
  if (output.damage === 0) {
    delete output.damage;
  }
  return { output, cost, rightConsumed };
}
