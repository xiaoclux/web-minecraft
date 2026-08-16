import type { ItemStack } from '../../items/ItemStack';

/** 战利品表中的一项。 */
interface LootEntry {
  item: string;
  /** 出现概率 0~1。 */
  chance: number;
  min: number;
  max: number;
}

/** 战利品表 id。 */
export const LootTable = {
  DUNGEON: 'dungeon',
  DESERT_TEMPLE: 'desert_temple',
  MINESHAFT: 'mineshaft',
} as const;
export type LootTable = (typeof LootTable)[keyof typeof LootTable];

/** 每个箱子最多放几种战利品。 */
const MAX_STACKS_PER_CHEST = 6;

/** 各结构的战利品（参考 1.8.9 的分布，做了简化）。 */
const LOOT_TABLES: Record<LootTable, readonly LootEntry[]> = {
  dungeon: [
    { item: 'bone', chance: 0.5, min: 1, max: 8 },
    { item: 'gunpowder', chance: 0.4, min: 1, max: 8 },
    { item: 'wheat', chance: 0.4, min: 1, max: 4 },
    { item: 'bread', chance: 0.3, min: 1, max: 3 },
    { item: 'iron_ingot', chance: 0.3, min: 1, max: 4 },
    { item: 'gold_ingot', chance: 0.15, min: 1, max: 4 },
    { item: 'bucket', chance: 0.1, min: 1, max: 1 },
    { item: 'golden_apple', chance: 0.05, min: 1, max: 1 },
    { item: 'diamond', chance: 0.03, min: 1, max: 1 },
    { item: 'wheat_seeds', chance: 0.3, min: 1, max: 4 },
    { item: 'carrot', chance: 0.2, min: 1, max: 4 },
    { item: 'potato', chance: 0.2, min: 1, max: 4 },
  ],
  desert_temple: [
    { item: 'bone', chance: 0.4, min: 1, max: 8 },
    { item: 'rotten_flesh', chance: 0.4, min: 1, max: 8 },
    { item: 'gold_ingot', chance: 0.35, min: 1, max: 6 },
    { item: 'iron_ingot', chance: 0.3, min: 1, max: 5 },
    { item: 'gunpowder', chance: 0.3, min: 1, max: 8 },
    { item: 'sand', chance: 0.3, min: 1, max: 8 },
    { item: 'diamond', chance: 0.08, min: 1, max: 3 },
    { item: 'golden_apple', chance: 0.06, min: 1, max: 1 },
    { item: 'lapis_lazuli', chance: 0.2, min: 1, max: 6 },
    { item: 'bone_meal', chance: 0.2, min: 1, max: 6 },
  ],
  mineshaft: [
    { item: 'coal', chance: 0.5, min: 1, max: 8 },
    { item: 'iron_ingot', chance: 0.35, min: 1, max: 5 },
    { item: 'gold_ingot', chance: 0.15, min: 1, max: 3 },
    { item: 'lapis_lazuli', chance: 0.2, min: 1, max: 6 },
    { item: 'diamond', chance: 0.04, min: 1, max: 2 },
    { item: 'bread', chance: 0.3, min: 1, max: 3 },
    { item: 'wheat_seeds', chance: 0.3, min: 1, max: 5 },
    { item: 'melon_slice', chance: 0.2, min: 1, max: 4 },
    { item: 'bone', chance: 0.3, min: 1, max: 6 },
  ],
};

/**
 * 掷一个箱子的战利品。
 * 逐项按概率决定是否出现，最多取 MAX_STACKS_PER_CHEST 种，保证箱子不会一次塞满。
 */
export function rollLoot(table: LootTable, random: () => number): ItemStack[] {
  const entries = LOOT_TABLES[table];
  const out: ItemStack[] = [];
  for (const entry of entries) {
    if (out.length >= MAX_STACKS_PER_CHEST) {
      break;
    }
    if (random() >= entry.chance) {
      continue;
    }
    const count = entry.min + Math.floor(random() * (entry.max - entry.min + 1));
    if (count > 0) {
      out.push({ id: entry.item, count });
    }
  }
  return out;
}
