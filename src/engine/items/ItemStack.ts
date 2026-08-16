import { getItem } from './ItemRegistry';

/** 物品堆。damage 仅工具使用（已消耗耐久）；enchants 为附魔 id → 等级。 */
export interface ItemStack {
  id: string;
  count: number;
  damage?: number;
  enchants?: Record<string, number>;
}

/** 创建物品堆。 */
export function createStack(id: string, count = 1, damage = 0): ItemStack {
  return damage > 0 ? { id, count, damage } : { id, count };
}

/** 两个堆是否可合并（同 id、无耐久损耗、无附魔）。 */
export function canMerge(a: ItemStack, b: ItemStack): boolean {
  return a.id === b.id && !a.damage && !b.damage && !a.enchants && !b.enchants;
}

/** 物品最大堆叠数。 */
export function maxStackOf(id: string): number {
  return getItem(id)?.maxStack ?? 1;
}

/** 复制物品堆。 */
export function cloneStack(stack: ItemStack): ItemStack {
  return stack.enchants ? { ...stack, enchants: { ...stack.enchants } } : { ...stack };
}
