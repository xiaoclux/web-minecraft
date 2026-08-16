import { BLOCK_DEFS, ToolTier, ToolType, type BlockDef } from '../blocks/BlockRegistry';
import { FLINT_AND_STEEL_DURABILITY, MAX_STACK } from '../constants/game';

/** 物品种类。 */
export const ItemKind = {
  BLOCK: 'block',
  TOOL: 'tool',
  FOOD: 'food',
  ARMOR: 'armor',
  MATERIAL: 'material',
} as const;
export type ItemKind = (typeof ItemKind)[keyof typeof ItemKind];

/** 剪刀耐久（1.8.9 为 238）。 */
export const SHEARS_DURABILITY = 238;

/** 工具属性。 */
export interface ToolProps {
  type: ToolType;
  tier: ToolTier;
  /** 对生物的攻击伤害（半心为 1）。 */
  attackDamage: number;
  /** 挖掘速度倍率。 */
  speed: number;
  durability: number;
}

/** 盔甲部位（同时也是装备栏的顺序：头、胸、腿、脚）。 */
export const ArmorSlot = {
  HELMET: 0,
  CHESTPLATE: 1,
  LEGGINGS: 2,
  BOOTS: 3,
} as const;
export type ArmorSlot = (typeof ArmorSlot)[keyof typeof ArmorSlot];
/** 装备栏格子数。 */
export const ARMOR_SLOT_COUNT = 4;

/** 盔甲属性。 */
export interface ArmorProps {
  slot: ArmorSlot;
  /** 护甲点数（每点减伤 4%）。 */
  defense: number;
  durability: number;
}

/** 食物属性。 */
export interface FoodProps {
  hunger: number;
  saturation: number;
}

/** 物品定义。 */
export interface ItemDef {
  id: string;
  label: string;
  kind: ItemKind;
  maxStack: number;
  /** 对应方块 id（仅方块物品）。 */
  blockId?: number;
  tool?: ToolProps;
  food?: FoodProps;
  armor?: ArmorProps;
  /** 图标贴图 key（非方块物品）。 */
  icon?: string;
  /** 燃料燃烧 tick（用于熔炉）。 */
  burnTicks?: number;
  /** 烧炼产物。 */
  smeltsInto?: string;
  /** 非工具类物品的耐久（剪刀等）；工具的耐久在 tool.durability。 */
  durability?: number;
}

const TIER_SPEED: Record<number, number> = { 0: 2, 1: 4, 2: 6, 3: 8 };
const TIER_DURABILITY: Record<number, number> = { 0: 59, 1: 131, 2: 250, 3: 1561 };
const TIER_ATTACK_BASE: Record<number, number> = { 0: 0, 1: 1, 2: 2, 3: 3 };
const TIER_LABEL: Record<number, string> = { 0: '木', 1: '石', 2: '铁', 3: '钻石' };
const TIER_NAME: Record<number, string> = { 0: 'wooden', 1: 'stone', 2: 'iron', 3: 'diamond' };
const TOOL_LABEL: Record<ToolType, string> = { pickaxe: '镐', axe: '斧', shovel: '锹', sword: '剑', hoe: '锄' };
/** 各工具类型的基础伤害（在材质加成之上）。 */
const TOOL_ATTACK: Record<ToolType, number> = { sword: 4, axe: 3, pickaxe: 2, shovel: 1, hoe: 1 };
const HAND_ATTACK_DAMAGE = 1;
const FURNACE_ITEM_BURN_TICKS = 1600;
const LOG_BURN_TICKS = 300;
const PLANKS_BURN_TICKS = 300;
const STICK_BURN_TICKS = 100;

const tool = (type: ToolType, tier: ToolTier): ItemDef => ({
  id: `${TIER_NAME[tier]}_${type}`,
  label: `${TIER_LABEL[tier]}${TOOL_LABEL[type]}`,
  kind: ItemKind.TOOL,
  maxStack: 1,
  icon: `${TIER_NAME[tier]}_${type}`,
  tool: {
    type,
    tier,
    attackDamage: TOOL_ATTACK[type] + TIER_ATTACK_BASE[tier],
    speed: TIER_SPEED[tier],
    durability: TIER_DURABILITY[tier],
  },
});

/** 盔甲材质：护甲点数与耐久都取自 1.8.9（顺序为头/胸/腿/脚）。 */
const ARMOR_MATERIALS: Record<string, { label: string; defense: number[]; durability: number[] }> = {
  leather: { label: '皮革', defense: [1, 3, 2, 1], durability: [55, 80, 75, 65] },
  iron: { label: '铁', defense: [2, 6, 5, 2], durability: [165, 240, 225, 195] },
  golden: { label: '金', defense: [2, 5, 3, 1], durability: [77, 112, 105, 91] },
  diamond: { label: '钻石', defense: [3, 8, 6, 3], durability: [363, 528, 495, 429] },
};
const ARMOR_PIECES = ['helmet', 'chestplate', 'leggings', 'boots'] as const;
const ARMOR_PIECE_LABEL: Record<(typeof ARMOR_PIECES)[number], string> = {
  helmet: '头盔',
  chestplate: '胸甲',
  leggings: '护腿',
  boots: '靴子',
};

function armorItems(): ItemDef[] {
  const out: ItemDef[] = [];
  for (const [tier, spec] of Object.entries(ARMOR_MATERIALS)) {
    ARMOR_PIECES.forEach((piece, index) => {
      out.push({
        id: `${tier}_${piece}`,
        label: `${spec.label}${ARMOR_PIECE_LABEL[piece]}`,
        kind: ItemKind.ARMOR,
        maxStack: 1,
        icon: `${tier}_${piece}`,
        armor: { slot: index as ArmorSlot, defense: spec.defense[index], durability: spec.durability[index] },
      });
    });
  }
  return out;
}

const material = (id: string, label: string, extra: Partial<ItemDef> = {}): ItemDef => ({
  id,
  label,
  kind: ItemKind.MATERIAL,
  maxStack: MAX_STACK,
  icon: id,
  ...extra,
});

const food = (
  id: string,
  label: string,
  hunger: number,
  saturation: number,
  extra: Partial<ItemDef> = {},
): ItemDef => ({
  id,
  label,
  kind: ItemKind.FOOD,
  maxStack: MAX_STACK,
  icon: id,
  food: { hunger, saturation },
  ...extra,
});

const BLOCK_ITEM_EXTRAS: Record<string, Partial<ItemDef>> = {
  log: { burnTicks: LOG_BURN_TICKS, smeltsInto: 'charcoal' },
  planks: { burnTicks: PLANKS_BURN_TICKS },
  crafting_table: { burnTicks: PLANKS_BURN_TICKS },
  bookshelf: { burnTicks: PLANKS_BURN_TICKS },
  cobblestone: { smeltsInto: 'stone' },
  sand: { smeltsInto: 'glass' },
  iron_ore: { smeltsInto: 'iron_ingot' },
  gold_ore: { smeltsInto: 'gold_ingot' },
};

function blockItem(def: BlockDef): ItemDef {
  return {
    id: def.name,
    label: def.label,
    kind: ItemKind.BLOCK,
    maxStack: MAX_STACK,
    blockId: def.id,
    ...BLOCK_ITEM_EXTRAS[def.name],
  };
}

const TOOL_TYPES: ToolType[] = [ToolType.SWORD, ToolType.PICKAXE, ToolType.AXE, ToolType.SHOVEL, ToolType.HOE];
const TIERS: ToolTier[] = [ToolTier.WOOD, ToolTier.STONE, ToolTier.IRON, ToolTier.DIAMOND];

/** 全部物品定义。 */
export const ITEM_DEFS: ItemDef[] = [
  ...BLOCK_DEFS.filter((b) => b.name !== 'air' && b.name !== 'water' && !b.noItem).map(blockItem),
  ...TIERS.flatMap((tier) => TOOL_TYPES.map((type) => tool(type, tier))),
  ...armorItems(),
  material('stick', '木棍', { burnTicks: STICK_BURN_TICKS }),
  material('coal', '煤炭', { burnTicks: FURNACE_ITEM_BURN_TICKS }),
  material('charcoal', '木炭', { burnTicks: FURNACE_ITEM_BURN_TICKS }),
  material('iron_ingot', '铁锭'),
  material('gold_ingot', '金锭'),
  material('diamond', '钻石'),
  material('wheat_seeds', '小麦种子'),
  material('wheat', '小麦'),
  material('string', '线'),
  material('feather', '羽毛'),
  material('leather', '皮革'),
  material('bone', '骨头'),
  material('gunpowder', '火药'),
  material('arrow', '箭'),
  material('snowball', '雪球', { maxStack: 16 }),
  material('bow', '弓', { maxStack: 1 }),
  material('shears', '剪刀', { maxStack: 1, durability: SHEARS_DURABILITY }),
  material('flint', '燧石'),
  material('flint_and_steel', '打火石', { maxStack: 1, durability: FLINT_AND_STEEL_DURABILITY }),
  material('bucket', '桶', { maxStack: 1 }),
  material('water_bucket', '水桶', { maxStack: 1 }),
  material('lava_bucket', '岩浆桶', { maxStack: 1 }),
  // 原版喝牛奶是清除状态效果，状态效果还没做，先只当作喝完变空桶
  material('milk_bucket', '牛奶桶', { maxStack: 1 }),
  food('apple', '苹果', 4, 2.4),
  food('bread', '面包', 5, 6),
  food('porkchop', '生猪排', 3, 1.8, { smeltsInto: 'cooked_porkchop' }),
  food('cooked_porkchop', '熟猪排', 8, 12.8),
  food('beef', '生牛肉', 3, 1.8, { smeltsInto: 'cooked_beef' }),
  food('cooked_beef', '牛排', 8, 12.8),
  food('chicken', '生鸡肉', 2, 1.2, { smeltsInto: 'cooked_chicken' }),
  food('cooked_chicken', '熟鸡肉', 6, 7.2),
  food('mutton', '生羊肉', 2, 1.2, { smeltsInto: 'cooked_mutton' }),
  food('cooked_mutton', '熟羊肉', 6, 9.6),
  food('melon_slice', '西瓜片', 2, 1.2),
  food('rotten_flesh', '腐肉', 4, 0.8),
];

const ITEMS_BY_ID = new Map<string, ItemDef>(ITEM_DEFS.map((d) => [d.id, d]));

/** 按 id 获取物品定义。 */
export function getItem(id: string): ItemDef | undefined {
  return ITEMS_BY_ID.get(id);
}

/** 按 id 获取物品定义，不存在则抛错（用于配方等静态数据校验）。 */
export function requireItem(id: string): ItemDef {
  const def = ITEMS_BY_ID.get(id);
  if (!def) {
    throw new Error(`Unknown item id: ${id}`);
  }
  return def;
}

/** 徒手攻击伤害。 */
export function getAttackDamage(itemId: string | null): number {
  if (!itemId) {
    return HAND_ATTACK_DAMAGE;
  }
  return getItem(itemId)?.tool?.attackDamage ?? HAND_ATTACK_DAMAGE;
}

/** 收集所有非方块物品的图标 key。 */
export function collectItemIconKeys(): string[] {
  return ITEM_DEFS.filter((d) => d.icon).map((d) => d.icon as string);
}
