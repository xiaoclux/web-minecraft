import { BLOCK_DEFS, BlockId, COLOR_VARIANTS, ToolTier, ToolType, type BlockDef } from '../blocks/BlockRegistry';
import { FLINT_AND_STEEL_DURABILITY, MAX_STACK } from '../constants/game';
import { POTION_DEFS, potionItemId } from './potions';

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
  /** 放置时写入的 meta（方块变种，如木材种类 / 羊毛颜色）。 */
  blockMeta?: number;
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
  /** 药水种类 id（仅药水物品）。 */
  potion?: string;
  /** 喷溅药水：扔出去而不是喝。 */
  splash?: boolean;
}

/** 工具材质：挖掘等级、速度、耐久与攻击加成都取自 1.8.9（金的挖掘等级同木、但快而脆）。 */
interface ToolMaterialSpec {
  /** 物品 id 前缀。 */
  id: string;
  label: string;
  /** 挖掘等级（决定能不能挖到掉落）。 */
  tier: ToolTier;
  speed: number;
  durability: number;
  /** 在工具类型基础伤害之上的加成。 */
  attackBonus: number;
  /** 合成材料的物品 id。 */
  material: string;
}

export const TOOL_MATERIALS: readonly ToolMaterialSpec[] = [
  { id: 'wooden', label: '木', tier: ToolTier.WOOD, speed: 2, durability: 59, attackBonus: 0, material: 'planks' },
  { id: 'stone', label: '石', tier: ToolTier.STONE, speed: 4, durability: 131, attackBonus: 1, material: 'cobblestone' },
  { id: 'iron', label: '铁', tier: ToolTier.IRON, speed: 6, durability: 250, attackBonus: 2, material: 'iron_ingot' },
  { id: 'golden', label: '金', tier: ToolTier.WOOD, speed: 12, durability: 32, attackBonus: 0, material: 'gold_ingot' },
  { id: 'diamond', label: '钻石', tier: ToolTier.DIAMOND, speed: 8, durability: 1561, attackBonus: 3, material: 'diamond' },
];

const TOOL_LABEL: Record<ToolType, string> = { pickaxe: '镐', axe: '斧', shovel: '锹', sword: '剑', hoe: '锄' };
/** 各工具类型的基础伤害（在材质加成之上）。 */
const TOOL_ATTACK: Record<ToolType, number> = { sword: 4, axe: 3, pickaxe: 2, shovel: 1, hoe: 1 };
const HAND_ATTACK_DAMAGE = 1;
const FURNACE_ITEM_BURN_TICKS = 1600;
const LOG_BURN_TICKS = 300;
const PLANKS_BURN_TICKS = 300;
const STICK_BURN_TICKS = 100;
/** 烈焰棒在熔炉里能烧 2400 tick（1.8.9 同）。 */
const BLAZE_ROD_BURN_TICKS = 2400;

const tool = (type: ToolType, mat: ToolMaterialSpec): ItemDef => ({
  id: `${mat.id}_${type}`,
  label: `${mat.label}${TOOL_LABEL[type]}`,
  kind: ItemKind.TOOL,
  maxStack: 1,
  icon: `${mat.id}_${type}`,
  tool: {
    type,
    tier: mat.tier,
    attackDamage: TOOL_ATTACK[type] + mat.attackBonus,
    speed: mat.speed,
    durability: mat.durability,
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

/**
 * 染料：白色是骨粉、蓝色直接用青金石（与 1.8.9 一致），其余各有独立物品。
 * 目前能做出来的有白 / 红 / 黄 / 蓝 与它们的混色，其余等墨囊、仙人掌绿、可可豆。
 */
const DYE_ITEM_IDS: Record<string, string> = Object.fromEntries(
  COLOR_VARIANTS.map((c) => [
    c.id,
    c.id === 'white' ? 'bone_meal' : c.id === 'blue' ? 'lapis_lazuli' : c.id === 'black' ? 'ink_sac' : `${c.id}_dye`,
  ]),
);

/** 某个颜色对应的染料物品 id。 */
export function dyeItemId(colorId: string): string {
  return DYE_ITEM_IDS[colorId];
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

/** 一个方块（含其所有变种）对应的物品。 */
function blockItems(def: BlockDef): ItemDef[] {
  const variants = def.variants ?? [def];
  return variants.map((variant, index) => ({
    id: variant.name,
    label: variant.label,
    kind: ItemKind.BLOCK,
    maxStack: MAX_STACK,
    blockId: def.id,
    blockMeta: def.variants ? index : undefined,
    ...BLOCK_ITEM_EXTRAS[variant.name],
  }));
}

const TOOL_TYPES: ToolType[] = [ToolType.SWORD, ToolType.PICKAXE, ToolType.AXE, ToolType.SHOVEL, ToolType.HOE];

/** 药水物品：每种药水一个普通版 + 一个喷溅版，只能单个堆叠（1.8.9 同）。 */
const POTION_LABEL_LONG = '（延长）';
const POTION_LABEL_STRONG = ' II';
const SPLASH_LABEL_PREFIX = '喷溅型';
function potionItems(): ItemDef[] {
  const out: ItemDef[] = [];
  for (const potion of Object.values(POTION_DEFS)) {
    const tier = potion.amplifier > 0 ? POTION_LABEL_STRONG : potion.id.endsWith('_long') ? POTION_LABEL_LONG : '';
    for (const splash of [false, true]) {
      const id = potionItemId(potion.id, splash);
      out.push({
        id,
        label: `${splash ? SPLASH_LABEL_PREFIX : ''}${potion.label}${tier}`,
        kind: ItemKind.MATERIAL,
        maxStack: 1,
        icon: id,
        potion: potion.id,
        splash: splash || undefined,
      });
    }
  }
  return out;
}

/** 除骨粉与青金石之外的 14 种染料物品。 */
const DYE_ITEMS: ItemDef[] = COLOR_VARIANTS.filter(
  (c) => c.id !== 'white' && c.id !== 'blue' && c.id !== 'black',
).map((c) => ({
  id: DYE_ITEM_IDS[c.id],
  label: `${c.label}染料`,
  kind: ItemKind.MATERIAL,
  maxStack: MAX_STACK,
  icon: DYE_ITEM_IDS[c.id],
}));

/** 全部物品定义。 */
export const ITEM_DEFS: ItemDef[] = [
  ...BLOCK_DEFS.filter((b) => b.name !== 'air' && b.name !== 'water' && !b.noItem).flatMap(blockItems),
  ...TOOL_MATERIALS.flatMap((mat) => TOOL_TYPES.map((type) => tool(type, mat))),
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
  material('ender_pearl', '末影珍珠', { maxStack: 16 }),
  material('ink_sac', '墨囊'),
  material('slimeball', '粘液球'),
  material('bone_meal', '骨粉'),
  material('gunpowder', '火药'),
  material('arrow', '箭'),
  material('snowball', '雪球', { maxStack: 16 }),
  material('bow', '弓', { maxStack: 1 }),
  material('shears', '剪刀', { maxStack: 1, durability: SHEARS_DURABILITY }),
  material('flint', '燧石'),
  material('lapis_lazuli', '青金石'),
  material('sugar', '糖'),
  material('gold_nugget', '金粒'),
  material('book', '书'),
  material('enchanted_book', '附魔书', { maxStack: 1 }),
  material('paper', '纸'),
  material('glass_bottle', '玻璃瓶'),
  material('nether_wart', '下界疣'),
  material('spider_eye', '蜘蛛眼'),
  material('fermented_spider_eye', '发酵蛛眼'),
  material('glistering_melon', '闪烁的西瓜'),
  material('ghast_tear', '恶魂之泪'),
  material('blaze_rod', '烈焰棒', { burnTicks: BLAZE_ROD_BURN_TICKS }),
  material('blaze_powder', '烈焰粉'),
  material('magma_cream', '岩浆膏'),
  material('rabbit_foot', '兔子脚'),
  material('redstone', '红石'),
  material('glowstone_dust', '萤石粉'),
  ...potionItems(),
  ...DYE_ITEMS,
  material('flint_and_steel', '打火石', { maxStack: 1, durability: FLINT_AND_STEEL_DURABILITY }),
  material('bucket', '桶', { maxStack: 1 }),
  material('water_bucket', '水桶', { maxStack: 1 }),
  material('lava_bucket', '岩浆桶', { maxStack: 1 }),
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
  food('carrot', '胡萝卜', 3, 3.6),
  food('potato', '土豆', 1, 0.6, { smeltsInto: 'baked_potato' }),
  food('baked_potato', '烤土豆', 5, 6),
  food('golden_apple', '金苹果', 4, 9.6),
  food('golden_carrot', '金胡萝卜', 6, 14.4),
  food('melon_slice', '西瓜片', 2, 1.2),
  food('rotten_flesh', '腐肉', 4, 0.8),
];

const ITEMS_BY_ID = new Map<string, ItemDef>(ITEM_DEFS.map((d) => [d.id, d]));

/** 某个方块 id 的全部变种物品 id（按 meta 顺序）。 */
function variantItemIds(blockId: number): string[] {
  return ITEM_DEFS.filter((d) => d.blockId === blockId).map((d) => d.id);
}

/** 六种木板与六种原木的物品 id（配方里的 #planks / #log 标签用）。 */
export const PLANK_ITEM_IDS: readonly string[] = variantItemIds(BlockId.PLANKS);
export const LOG_ITEM_IDS: readonly string[] = variantItemIds(BlockId.LOG);
export const WOOL_ITEM_IDS: readonly string[] = variantItemIds(BlockId.WOOL);

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
