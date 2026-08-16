import { TICKS_PER_SECOND } from '../constants/game';
import { getItem, type ToolProps } from '../items/ItemRegistry';
import type { ItemStack } from '../items/ItemStack';
import { blockVariant, type BlockDef, type BlockDrop } from './BlockRegistry';

const HARVEST_MULTIPLIER = 1.5;
const NO_HARVEST_MULTIPLIER = 5;
const MIN_BREAK_TICKS = 1;

function heldTool(held: ItemStack | null): ToolProps | undefined {
  return held ? getItem(held.id)?.tool : undefined;
}

/** 当前工具能否采集该方块（决定是否有掉落）。 */
export function canHarvest(def: BlockDef, held: ItemStack | null): boolean {
  if (def.minTier === undefined) {
    return true;
  }
  const tool = heldTool(held);
  return !!tool && tool.type === def.tool && tool.tier >= def.minTier;
}

/** 计算破坏所需 tick；不可破坏返回 Infinity。 */
export function breakTicks(def: BlockDef, held: ItemStack | null): number {
  if (def.hardness < 0) {
    return Infinity;
  }
  const tool = heldTool(held);
  const harvestable = canHarvest(def, held);
  let seconds = def.hardness * (harvestable ? HARVEST_MULTIPLIER : NO_HARVEST_MULTIPLIER);
  if (tool && def.tool === tool.type) {
    seconds /= tool.speed;
  }
  return Math.max(MIN_BREAK_TICKS, Math.ceil(seconds * TICKS_PER_SECOND));
}

/** 计算掉落物；meta 用来决定"掉自己"时掉的是哪个变种。 */
export function rollDrops(def: BlockDef, meta: number, held: ItemStack | null, random: () => number): ItemStack[] {
  if (!canHarvest(def, held)) {
    return [];
  }
  const variant = blockVariant(def, meta);
  const table: BlockDrop[] = variant.drops ?? def.drops ?? [{ item: variant.name, min: 1, max: 1 }];
  const out: ItemStack[] = [];
  for (const drop of table) {
    if (drop.chance !== undefined && random() > drop.chance) {
      continue;
    }
    const count = drop.min + Math.floor(random() * (drop.max - drop.min + 1));
    if (count > 0) {
      out.push({ id: drop.item, count });
    }
  }
  return out;
}

/** 掉落经验。 */
export function rollXp(def: BlockDef, held: ItemStack | null, random: () => number): number {
  if (!def.xp || !canHarvest(def, held)) {
    return 0;
  }
  const [min, max] = def.xp;
  return min + Math.floor(random() * (max - min + 1));
}
