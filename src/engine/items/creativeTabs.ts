/**
 * 创造模式物品栏的分页：按 1.8.9 的分类把物品分到各个标签页，另有"搜索"页。
 * 分类规则放在引擎侧，便于单测与以后的多人客户端复用。
 */

import { BlockId, getBlock } from '../blocks/BlockRegistry';
import { ItemKind, type ItemDef } from './ItemRegistry';

/** 标签页 id。 */
export const CreativeTab = {
  BUILDING: 'building',
  DECORATION: 'decoration',
  REDSTONE: 'redstone',
  TRANSPORT: 'transport',
  FOOD: 'food',
  TOOLS: 'tools',
  COMBAT: 'combat',
  BREWING: 'brewing',
  MATERIALS: 'materials',
  SEARCH: 'search',
} as const;
export type CreativeTab = (typeof CreativeTab)[keyof typeof CreativeTab];

/** 标签页定义。 */
export interface CreativeTabDef {
  id: CreativeTab;
  label: string;
}

export const CREATIVE_TAB_DEFS: readonly CreativeTabDef[] = [
  { id: CreativeTab.BUILDING, label: '建筑' },
  { id: CreativeTab.DECORATION, label: '装饰' },
  { id: CreativeTab.REDSTONE, label: '红石' },
  { id: CreativeTab.TRANSPORT, label: '交通' },
  { id: CreativeTab.FOOD, label: '食物' },
  { id: CreativeTab.TOOLS, label: '工具' },
  { id: CreativeTab.COMBAT, label: '战斗' },
  { id: CreativeTab.BREWING, label: '酿造' },
  { id: CreativeTab.MATERIALS, label: '材料' },
  { id: CreativeTab.SEARCH, label: '搜索' },
];

/** 装饰类方块的名字特征（花草、地毯、玻璃、羊毛等）。 */
const DECORATION_PATTERN =
  /wool|carpet|glass|flower|dandelion|poppy|sapling|leaves|torch|bookshelf|snow|ice|web|pumpkin|melon|cactus|sugar_cane|skull|beacon|dragon_egg|end_portal|quartz_block/;
/** 交通类。 */
const TRANSPORT_PATTERN = /rail|minecart|boat/;
/** 酿造类物品。 */
const BREWING_PATTERN = /potion|nether_wart|blaze|magma_cream|spider_eye|ghast_tear|glistering|glass_bottle|brewing/;
/** 战斗类（剑、弓、箭、盔甲）。 */
const COMBAT_PATTERN = /sword|bow|arrow|helmet|chestplate|leggings|boots/;

/** 红石相关的方块 id（有 redstone 定义的都算，另加几个手动项）。 */
const EXTRA_REDSTONE_BLOCKS: ReadonlySet<number> = new Set<number>([
  BlockId.TNT,
  BlockId.HOPPER,
  BlockId.PISTON,
  BlockId.STICKY_PISTON,
  BlockId.DISPENSER,
  BlockId.DROPPER,
]);

/** 某个物品属于哪一页（搜索页不参与分类）。 */
export function creativeTabOf(def: ItemDef): CreativeTab {
  if (def.kind === ItemKind.FOOD) {
    return CreativeTab.FOOD;
  }
  if (def.kind === ItemKind.ARMOR || COMBAT_PATTERN.test(def.id)) {
    return CreativeTab.COMBAT;
  }
  if (def.kind === ItemKind.TOOL) {
    return CreativeTab.TOOLS;
  }
  if (BREWING_PATTERN.test(def.id)) {
    return CreativeTab.BREWING;
  }
  if (TRANSPORT_PATTERN.test(def.id)) {
    return CreativeTab.TRANSPORT;
  }
  if (def.kind === ItemKind.BLOCK && def.blockId !== undefined) {
    const block = getBlock(def.blockId);
    if (block.redstone || EXTRA_REDSTONE_BLOCKS.has(def.blockId)) {
      return CreativeTab.REDSTONE;
    }
    return DECORATION_PATTERN.test(def.id) ? CreativeTab.DECORATION : CreativeTab.BUILDING;
  }
  if (/redstone|repeater|lever|button|pressure_plate/.test(def.id)) {
    return CreativeTab.REDSTONE;
  }
  return CreativeTab.MATERIALS;
}

/**
 * 某一页要显示的物品。
 * @param search 搜索页的关键词（按 id 与中文名匹配）
 */
export function creativeItems(items: readonly ItemDef[], tab: CreativeTab, search: string): ItemDef[] {
  if (tab === CreativeTab.SEARCH) {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return [...items];
    }
    return items.filter((d) => d.id.includes(keyword) || d.label.toLowerCase().includes(keyword));
  }
  return items.filter((d) => creativeTabOf(d) === tab);
}
