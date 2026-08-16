/**
 * 附魔：物品堆上的 `enchants` 字段（id → 等级）。
 * 这里只放数据与"该附魔对某物品适不适用"的判断；各附魔的效果由挖掘 / 战斗 / 护甲代码各自读取等级实现。
 */

import { ToolType } from '../blocks/BlockRegistry';
import { getItem, type ItemDef } from './ItemRegistry';
import type { ItemStack } from './ItemStack';

/** 附魔 id（与 1.8.9 名称对应）。 */
export const EnchantmentId = {
  PROTECTION: 'protection',
  FIRE_PROTECTION: 'fire_protection',
  FEATHER_FALLING: 'feather_falling',
  RESPIRATION: 'respiration',
  SHARPNESS: 'sharpness',
  KNOCKBACK: 'knockback',
  FIRE_ASPECT: 'fire_aspect',
  LOOTING: 'looting',
  EFFICIENCY: 'efficiency',
  SILK_TOUCH: 'silk_touch',
  UNBREAKING: 'unbreaking',
  FORTUNE: 'fortune',
} as const;
export type EnchantmentId = (typeof EnchantmentId)[keyof typeof EnchantmentId];

/** 附魔适用的物品类别。 */
export const EnchantTarget = {
  ARMOR: 'armor',
  SWORD: 'sword',
  TOOL: 'tool',
  BREAKABLE: 'breakable',
} as const;
export type EnchantTarget = (typeof EnchantTarget)[keyof typeof EnchantTarget];

/** 附魔定义。 */
export interface EnchantmentDef {
  id: EnchantmentId;
  label: string;
  maxLevel: number;
  target: EnchantTarget;
  /** 附魔台抽取时的权重：越常见越大（1.8.9 的 rarity）。 */
  weight: number;
  /** 各等级需要的最低附魔力（附魔台按此挑选可出的附魔）；下标 = 等级 - 1。 */
  minPower: readonly number[];
  /** 不能与之共存的附魔。 */
  conflicts?: readonly EnchantmentId[];
}

/** 1.8.9 各附魔的最低附魔力：base + (level-1) * perLevel。 */
const powers = (base: number, perLevel: number, maxLevel: number): number[] =>
  Array.from({ length: maxLevel }, (_, i) => base + i * perLevel);

export const ENCHANTMENT_DEFS: Readonly<Record<EnchantmentId, EnchantmentDef>> = {
  protection: {
    id: EnchantmentId.PROTECTION,
    label: '保护',
    maxLevel: 4,
    target: EnchantTarget.ARMOR,
    weight: 10,
    minPower: powers(1, 11, 4),
    conflicts: [EnchantmentId.FIRE_PROTECTION],
  },
  fire_protection: {
    id: EnchantmentId.FIRE_PROTECTION,
    label: '火焰保护',
    maxLevel: 4,
    target: EnchantTarget.ARMOR,
    weight: 5,
    minPower: powers(10, 8, 4),
    conflicts: [EnchantmentId.PROTECTION],
  },
  feather_falling: {
    id: EnchantmentId.FEATHER_FALLING,
    label: '摔落保护',
    maxLevel: 4,
    target: EnchantTarget.ARMOR,
    weight: 5,
    minPower: powers(5, 6, 4),
  },
  respiration: {
    id: EnchantmentId.RESPIRATION,
    label: '水下呼吸',
    maxLevel: 3,
    target: EnchantTarget.ARMOR,
    weight: 2,
    minPower: powers(10, 10, 3),
  },
  sharpness: {
    id: EnchantmentId.SHARPNESS,
    label: '锋利',
    maxLevel: 5,
    target: EnchantTarget.SWORD,
    weight: 10,
    minPower: powers(1, 11, 5),
  },
  knockback: {
    id: EnchantmentId.KNOCKBACK,
    label: '击退',
    maxLevel: 2,
    target: EnchantTarget.SWORD,
    weight: 5,
    minPower: powers(5, 20, 2),
  },
  fire_aspect: {
    id: EnchantmentId.FIRE_ASPECT,
    label: '火焰附加',
    maxLevel: 2,
    target: EnchantTarget.SWORD,
    weight: 2,
    minPower: powers(10, 20, 2),
  },
  looting: {
    id: EnchantmentId.LOOTING,
    label: '抢夺',
    maxLevel: 3,
    target: EnchantTarget.SWORD,
    weight: 2,
    minPower: powers(15, 9, 3),
  },
  efficiency: {
    id: EnchantmentId.EFFICIENCY,
    label: '效率',
    maxLevel: 5,
    target: EnchantTarget.TOOL,
    weight: 10,
    minPower: powers(1, 10, 5),
  },
  silk_touch: {
    id: EnchantmentId.SILK_TOUCH,
    label: '精准采集',
    maxLevel: 1,
    target: EnchantTarget.TOOL,
    weight: 1,
    minPower: powers(15, 0, 1),
    conflicts: [EnchantmentId.FORTUNE],
  },
  unbreaking: {
    id: EnchantmentId.UNBREAKING,
    label: '耐久',
    maxLevel: 3,
    target: EnchantTarget.BREAKABLE,
    weight: 5,
    minPower: powers(5, 8, 3),
  },
  fortune: {
    id: EnchantmentId.FORTUNE,
    label: '时运',
    maxLevel: 3,
    target: EnchantTarget.TOOL,
    weight: 2,
    minPower: powers(15, 9, 3),
    conflicts: [EnchantmentId.SILK_TOUCH],
  },
};

/** 效率：挖掘速度加成 = level² + 1（1.8.9）。 */
export function efficiencyBonus(level: number): number {
  return level > 0 ? level * level + 1 : 0;
}
/** 锋利：每级 +1.25 伤害。 */
export const SHARPNESS_DAMAGE_PER_LEVEL = 1.25;
/** 击退：每级额外击退强度（在基础击退之上）。 */
export const KNOCKBACK_PER_LEVEL = 3;
/** 火焰附加：每级点燃 4 秒。 */
export const FIRE_ASPECT_TICKS_PER_LEVEL = 80;
/** 保护类附魔的减伤点数：保护每级 1、火焰保护每级 2、摔落保护每级 3；总点数上限 20，每点减伤 4%。 */
export const PROTECTION_POINTS_PER_LEVEL = 1;
export const FIRE_PROTECTION_POINTS_PER_LEVEL = 2;
export const FEATHER_FALLING_POINTS_PER_LEVEL = 3;
export const PROTECTION_MAX_POINTS = 20;
export const PROTECTION_REDUCTION_PER_POINT = 0.04;

/**
 * 耐久附魔：这次磨损要不要跳过。工具每级多 1/(level+1) 的概率免损；
 * 盔甲只在 40% 的情况下受耐久附魔影响（1.8.9 同）。
 */
export function unbreakingSkips(level: number, isArmor: boolean, random: () => number): boolean {
  if (level <= 0) {
    return false;
  }
  if (isArmor && random() < 0.6) {
    return false;
  }
  return random() < level / (level + 1);
}

/** 判断是不是已知附魔 id。 */
export function isEnchantmentId(id: string): id is EnchantmentId {
  return id in ENCHANTMENT_DEFS;
}

/** 物品堆上某附魔的等级（没有为 0）。 */
export function enchantLevel(stack: ItemStack | null | undefined, id: EnchantmentId): number {
  return stack?.enchants?.[id] ?? 0;
}

/** 物品堆是否带附魔。 */
export function isEnchanted(stack: ItemStack | null | undefined): boolean {
  return !!stack?.enchants && Object.keys(stack.enchants).length > 0;
}

/** 该附魔能否加在这种物品上（不看已有附魔的冲突）。 */
export function canEnchant(def: ItemDef, enchant: EnchantmentDef): boolean {
  switch (enchant.target) {
    case EnchantTarget.ARMOR:
      return def.armor !== undefined;
    case EnchantTarget.SWORD:
      return def.tool?.type === ToolType.SWORD;
    case EnchantTarget.TOOL:
      return def.tool !== undefined && def.tool.type !== ToolType.SWORD;
    case EnchantTarget.BREAKABLE:
      return def.tool !== undefined || def.armor !== undefined || def.durability !== undefined;
    default:
      return false;
  }
}

/** 物品本身能不能拿去附魔（工具 / 剑 / 盔甲 / 书）。 */
export function isEnchantable(itemId: string): boolean {
  const def = getItem(itemId);
  if (!def) {
    return false;
  }
  return def.id === BOOK_ITEM_ID || Object.values(ENCHANTMENT_DEFS).some((e) => canEnchant(def, e));
}

/** 书与附魔书的物品 id。 */
export const BOOK_ITEM_ID = 'book';
export const ENCHANTED_BOOK_ITEM_ID = 'enchanted_book';

/** 两个附魔能否同时存在于一件物品上。 */
export function enchantsCompatible(a: EnchantmentId, b: EnchantmentId): boolean {
  if (a === b) {
    return false;
  }
  return !ENCHANTMENT_DEFS[a].conflicts?.includes(b) && !ENCHANTMENT_DEFS[b].conflicts?.includes(a);
}

/** 罗马数字等级（I~X 够用）。 */
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/** 附魔列表的可读文本，如"锋利 III、耐久 I"。 */
export function describeEnchants(stack: ItemStack): string {
  if (!stack.enchants) {
    return '';
  }
  return Object.entries(stack.enchants)
    .filter(([id]) => isEnchantmentId(id))
    .map(([id, level]) => `${ENCHANTMENT_DEFS[id as EnchantmentId].label} ${ROMAN[level - 1] ?? level}`)
    .join('、');
}
