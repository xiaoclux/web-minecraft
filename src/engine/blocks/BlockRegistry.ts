/**
 * 方块注册表：数值 id（存入世界数组）→ 方块属性。
 * 数值 id 尽量沿用 1.8.9 的编号，方便对照。
 */

/** 工具类型。 */
export const ToolType = {
  PICKAXE: 'pickaxe',
  AXE: 'axe',
  SHOVEL: 'shovel',
  SWORD: 'sword',
  HOE: 'hoe',
} as const;
export type ToolType = (typeof ToolType)[keyof typeof ToolType];

/** 工具材质等级：手 -1、木 0、石 1、铁 2、钻石 3。 */
export const ToolTier = {
  HAND: -1,
  WOOD: 0,
  STONE: 1,
  IRON: 2,
  DIAMOND: 3,
} as const;
export type ToolTier = (typeof ToolTier)[keyof typeof ToolTier];

/** 方块渲染类型。 */
export const RenderType = {
  /** 不透明立方体。 */
  OPAQUE: 'opaque',
  /** 镂空立方体（树叶/玻璃），使用 alphaTest。 */
  CUTOUT: 'cutout',
  /** 半透明（水）。 */
  TRANSLUCENT: 'translucent',
  /** 十字交叉面片（花草/火把）。 */
  CROSS: 'cross',
  /** 不渲染。 */
  NONE: 'none',
} as const;
export type RenderType = (typeof RenderType)[keyof typeof RenderType];

import { SoundGroup } from './blockSounds';
import { LIQUID_LIGHT_ATTENUATION } from '../constants/world';
import { RAIL_SHAPE_MASK, REDSTONE_MAX_POWER, REDSTONE_POWERED_BIT, RailShape } from '../constants/redstone';
import { BED_HEAD_BIT, BlockShape, CROP_MAX_STAGE, DOOR_UPPER_BIT } from './blockShapes';

/** 六个面各自的贴图 key。 */
export interface BlockFaceTextures {
  top: string;
  bottom: string;
  north: string;
  south: string;
  east: string;
  west: string;
}

/** 掉落描述：物品 id 与数量区间。 */
export interface BlockDrop {
  item: string;
  min: number;
  max: number;
  /** 掉落概率 0~1，默认 1。 */
  chance?: number;
}

/** 方块的一个变种（同一个 id 下按 meta 区分）。 */
export interface BlockVariant {
  /** 物品 id / 英文名。 */
  name: string;
  label: string;
  textures: BlockFaceTextures;
  /** 掉落表；不填则掉自己（石头变种里只有原版石头掉圆石）。 */
  drops?: BlockDrop[];
}

/** 变种序号的默认掩码（meta 低 4 位）。 */
export const DEFAULT_VARIANT_MASK = 0xf;

/** 方块定义。 */
export interface BlockDef {
  id: number;
  /** 物品 id / 英文名。 */
  name: string;
  label: string;
  textures: BlockFaceTextures;
  render: RenderType;
  /** 是否阻挡实体。 */
  solid: boolean;
  /** 是否完全遮光（用于面剔除与光照传播）。 */
  opaque: boolean;
  /** 硬度（秒基准）；-1 表示不可破坏。 */
  hardness: number;
  /** 最有效工具，null 表示任何方式速度相同。 */
  tool: ToolType | null;
  /** 需要至少此等级的正确工具才有掉落；undefined 表示徒手也可掉落。 */
  minTier?: ToolTier;
  /** 掉落表；未指定则掉自身。 */
  drops?: BlockDrop[];
  /** 发光等级 0~15。 */
  light: number;
  /** 受重力影响（沙子/砂砾）。 */
  hasGravity?: boolean;
  /** 是否为液体。 */
  isLiquid?: boolean;
  /** 需要放置在实心方块上（花草/火把）。 */
  needsSupport?: boolean;
  /** 挖掘经验区间。 */
  xp?: [number, number];
  /** 是否可被玩家右键交互（工作台等）。 */
  interactive?: boolean;
  /** 是否可燃烧/被爆炸摧毁（基岩为 false）。 */
  isBlastResistant?: boolean;
  /** 形状；缺省为完整立方体。 */
  shape?: BlockShape;
  /** 不生成对应物品（如双层半砖，只能由半砖合并得到）。 */
  noItem?: boolean;
  /** 半砖专用：两块合并后变成的双层方块 id。 */
  doubleSlabId?: number;
  /**
   * 有正面朝向：meta 低 2 位记录正面朝哪，放置时正面朝向玩家。
   * 贴图上用 north 表示正面、south 表示其余侧面。
   */
  hasFacing?: boolean;
  /** 按 meta 换整套贴图（床头/床尾、作物生长阶段等）；不设则一直用 textures。 */
  texturesForMeta?: (meta: number) => BlockFaceTextures;
  /** 可攀爬（梯子）：实体在其中可以上下爬且不会摔落。 */
  climbable?: boolean;
  /** 连接组：同组的连接型方块（栅栏、玻璃板等）之间会连成一片。 */
  connectGroup?: string;
  /** 可燃：会被相邻的火点着并烧掉。 */
  flammable?: boolean;
  /** 材质音效组；不写时由 blockSounds 按名字与工具推断。 */
  soundGroup?: SoundGroup;
  /** 红石属性：电源强度、通电位、是否是用电器。 */
  redstone?: {
    /** 作为电源时的输出强度；不填表示不是电源。 */
    source?: number;
    /** meta 里表示"通电"的位（拉杆 / 按钮 / 压力板）；不填表示恒定输出。 */
    poweredBit?: number;
    /** 模拟电源（日光传感器）：输出强度直接读 meta 的低 4 位。 */
    analogFromMeta?: boolean;
    /** 用电器：被充能时换成这个"通电态"方块 id（红石灯灭 → 亮）。 */
    litBlockId?: number;
    /** 用电器：断电时换回这个"断电态"方块 id（红石灯亮 → 灭）。 */
    unlitBlockId?: number;
    /** 用电器：被充能时开门 / 开活板门。 */
    opensWhenPowered?: boolean;
    /** 反相器（红石火把）：脚下被充能时切到这个"熄灭"方块 id。 */
    invertedOffId?: number;
    /** 反相器的熄灭态：脚下不再被充能时切回这个"点亮"方块 id。 */
    invertedOnId?: number;
    /** 中继器：只吃背后的信号、延迟后向正面输出满强度。 */
    repeater?: boolean;
    /** 比较器：读背后的信号 / 容器充盈度，减去两侧信号后向正面输出（强度存 meta 高 4 位）。 */
    comparator?: boolean;
    /** 活塞：通电伸出、断电缩回。 */
    piston?: boolean;
    /** 粘性活塞：缩回时把前面那格拉回来。 */
    sticky?: boolean;
    /** 发射器 / 投掷器：通电时吐出一样东西。 */
    dispenser?: boolean;
    /** 投掷器：只把物品丢出来，不发射（箭 / 药水也当普通物品丢）。 */
    dropper?: boolean;
    /** 音符盒：上升沿响一声（音高存在 meta 里）。 */
    noteBlock?: boolean;
    /** TNT：被充能就点着。 */
    ignitesWhenPowered?: boolean;
    /** 动力铁轨：被充能时给矿车加速。 */
    poweredRail?: boolean;
  };
  /**
   * 变种：同一个方块 id 下按 meta 区分的若干种（木材、羊毛颜色、石头变种等），与 1.8.9 一致。
   * 有变种时，方块的物品、标签与贴图都按 meta 取对应变种。
   */
  variants?: BlockVariant[];
  /** meta 中用来存变种序号的位（默认 0xF）；半砖这类还要用高位存别的信息时缩小它。 */
  variantMask?: number;
  /** 作物：种子物品、成熟产物与额外掉落的种子数。 */
  crop?: {
    /** 用来播种的物品 id（也是未成熟时的掉落）。 */
    seedItem: string;
    /** 成熟时的主要产物。 */
    produce: { item: string; min: number; max: number };
    /** 成熟时额外掉的种子数量区间。 */
    extraSeeds?: { min: number; max: number };
    /** 种在什么方块上；默认耕地。 */
    soil?: number;
    /** 成熟阶段（meta 的最大值）；默认与小麦一致。 */
    maxStage?: number;
    /** 是否需要光照才能生长；默认需要（下界疣不需要）。 */
    needsLight?: boolean;
  };
}

/** 动力铁轨 meta 里"通电"的位（与矿车代码共用）。 */
export const POWERED_RAIL_LIT_BIT = 8;

/** 末地传送门框架 meta 里"已镶末影之眼"的位。 */
export const END_PORTAL_FRAME_EYE_BIT = 4;

/** 下界疣的最大生长阶段（1.8.9 是 3 段）。 */
export const NETHER_WART_MAX_STAGE = 2;

export const BlockId = {
  AIR: 0,
  STONE: 1,
  GRASS: 2,
  DIRT: 3,
  COBBLESTONE: 4,
  PLANKS: 5,
  SAPLING: 6,
  BEDROCK: 7,
  WATER: 9,
  LAVA: 11,
  SAND: 12,
  GRAVEL: 13,
  GOLD_ORE: 14,
  IRON_ORE: 15,
  COAL_ORE: 16,
  LAPIS_ORE: 21,
  LOG: 17,
  LEAVES: 18,
  GLASS: 20,
  SANDSTONE: 24,
  TALL_GRASS: 31,
  WOOL: 35,
  DANDELION: 37,
  POPPY: 38,
  BRICKS: 45,
  TNT: 46,
  BOOKSHELF: 47,
  MOSSY_COBBLESTONE: 48,
  OBSIDIAN: 49,
  MOB_SPAWNER: 52,
  COBWEB: 30,
  TORCH: 50,
  FIRE: 51,
  DIAMOND_ORE: 56,
  BED: 26,
  WHEAT: 59,
  CARROTS: 141,
  POTATOES: 142,
  FARMLAND: 60,
  FENCE: 85,
  FENCE_GATE: 107,
  WOODEN_DOOR: 64,
  LADDER: 65,
  CHEST: 54,
  CRAFTING_TABLE: 58,
  FURNACE: 61,
  SNOW: 80,
  CACTUS: 81,
  BREWING_STAND: 117,
  ENCHANTING_TABLE: 116,
  GOLD_BLOCK: 41,
  IRON_BLOCK: 42,
  DIAMOND_BLOCK: 57,
  ANVIL: 145,
  NETHERRACK: 87,
  SOUL_SAND: 88,
  QUARTZ_ORE: 153,
  NETHER_BRICKS: 112,
  NETHER_PORTAL: 90,
  END_STONE: 121,
  NETHER_WART: 115,
  END_PORTAL: 119,
  END_PORTAL_FRAME: 120,
  DRAGON_EGG: 122,
  QUARTZ_BLOCK: 155,
  WITHER_SKULL: 144,
  BEACON: 138,
  REDSTONE_WIRE: 55,
  REDSTONE_ORE: 73,
  REDSTONE_BLOCK: 152,
  REDSTONE_TORCH: 76,
  REDSTONE_TORCH_OFF: 75,
  REPEATER: 93,
  REPEATER_ON: 94,
  PISTON: 33,
  STICKY_PISTON: 29,
  PISTON_HEAD: 34,
  HOPPER: 154,
  RAIL: 66,
  POWERED_RAIL: 27,
  DISPENSER: 23,
  DROPPER: 158,
  NOTE_BLOCK: 159,
  DAYLIGHT_SENSOR: 160,
  COMPARATOR: 161,
  TRAPPED_CHEST: 162,
  TRIPWIRE_HOOK: 163,
  TRIPWIRE: 164,
  GLASS_PANE: 165,
  IRON_BARS: 166,
  TRAPDOOR: 167,
  BROWN_MUSHROOM: 168,
  RED_MUSHROOM: 169,
  LEVER: 69,
  STONE_BUTTON: 77,
  STONE_PRESSURE_PLATE: 70,
  REDSTONE_LAMP: 123,
  REDSTONE_LAMP_LIT: 124,
  SUGAR_CANE: 83,
  GLOWSTONE: 89,
  STONE_BRICKS: 98,
  MELON: 103,
  PUMPKIN: 86,
  DOUBLE_STONE_SLAB: 43,
  STONE_SLAB: 44,
  DOUBLE_OAK_SLAB: 125,
  OAK_SLAB: 126,
  OAK_STAIRS: 53,
  COBBLESTONE_STAIRS: 67,
  BRICK_STAIRS: 108,
  STONE_BRICK_STAIRS: 109,
  SANDSTONE_STAIRS: 128,
} as const;
export type BlockId = (typeof BlockId)[keyof typeof BlockId];

/** 16 种颜色的 id 与中文名（与 blockTextures.DYE_COLORS 顺序一致，即 1.8.9 的 meta 顺序）。 */
export const COLOR_VARIANTS: readonly { id: string; label: string }[] = [
  { id: 'white', label: '白色' },
  { id: 'orange', label: '橙色' },
  { id: 'magenta', label: '品红色' },
  { id: 'light_blue', label: '淡蓝色' },
  { id: 'yellow', label: '黄色' },
  { id: 'lime', label: '黄绿色' },
  { id: 'pink', label: '粉红色' },
  { id: 'gray', label: '灰色' },
  { id: 'light_gray', label: '淡灰色' },
  { id: 'cyan', label: '青色' },
  { id: 'purple', label: '紫色' },
  { id: 'blue', label: '蓝色' },
  { id: 'brown', label: '棕色' },
  { id: 'green', label: '绿色' },
  { id: 'red', label: '红色' },
  { id: 'black', label: '黑色' },
];

/** 三种石头变种的 id 与中文名（贴图在 blockTextures 里按同样的 id 生成）。 */
const STONE_VARIANTS: readonly { id: string; label: string }[] = [
  { id: 'granite', label: '花岗岩' },
  { id: 'diorite', label: '闪长岩' },
  { id: 'andesite', label: '安山岩' },
];

/** 六种木材的 id 与中文名（贴图在 blockTextures.WOOD_TYPES 里按同样的 id 生成）。 */
const WOOD_VARIANTS: readonly { id: string; label: string }[] = [
  { id: 'oak', label: '橡木' },
  { id: 'spruce', label: '云杉' },
  { id: 'birch', label: '白桦' },
  { id: 'jungle', label: '丛林木' },
  { id: 'acacia', label: '金合欢' },
  { id: 'dark_oak', label: '深色橡木' },
];

/** meta 的取值个数（4 位）：收集按 meta 变化的贴图时全部枚举一遍。 */
const META_VARIANT_COUNT = 16;

const same = (t: string): BlockFaceTextures => ({ top: t, bottom: t, north: t, south: t, east: t, west: t });
const topSide = (top: string, side: string, bottom = top): BlockFaceTextures => ({
  top,
  bottom,
  north: side,
  south: side,
  east: side,
  west: side,
});

const cube = (
  id: number,
  name: string,
  label: string,
  textures: BlockFaceTextures,
  hardness: number,
  tool: ToolType | null,
  extra: Partial<BlockDef> = {},
): BlockDef => ({
  id,
  name,
  label,
  textures,
  render: RenderType.OPAQUE,
  solid: true,
  opaque: true,
  hardness,
  tool,
  light: 0,
  ...extra,
});

const cross = (id: number, name: string, label: string, texture: string, extra: Partial<BlockDef> = {}): BlockDef => ({
  id,
  name,
  label,
  textures: same(texture),
  render: RenderType.CROSS,
  shape: BlockShape.CROSS,
  solid: false,
  opaque: false,
  hardness: 0,
  tool: null,
  light: 0,
  needsSupport: true,
  ...extra,
});

/** 半砖：占半格，可与同种半砖合并成双层砖。 */
const slab = (
  id: number,
  name: string,
  label: string,
  textures: BlockFaceTextures,
  hardness: number,
  tool: ToolType | null,
  extra: Partial<BlockDef> = {},
): BlockDef => ({
  ...cube(id, name, label, textures, hardness, tool, extra),
  shape: BlockShape.SLAB,
  opaque: false,
});

/** 楼梯：一层半砖 + 半格台阶，朝向与上下由 meta 决定。 */
const stairs = (
  id: number,
  name: string,
  label: string,
  textures: BlockFaceTextures,
  hardness: number,
  tool: ToolType | null,
  extra: Partial<BlockDef> = {},
): BlockDef => ({
  ...cube(id, name, label, textures, hardness, tool, extra),
  shape: BlockShape.STAIRS,
  opaque: false,
});

/** 全部方块定义列表。 */
export const BLOCK_DEFS: BlockDef[] = [
  {
    id: BlockId.AIR,
    name: 'air',
    label: '空气',
    textures: same('none'),
    render: RenderType.NONE,
    solid: false,
    opaque: false,
    hardness: 0,
    tool: null,
    light: 0,
  },
  cube(BlockId.STONE, 'stone', '石头', same('stone'), 1.5, ToolType.PICKAXE, {
    minTier: ToolTier.WOOD,
    // 只有原版石头掉圆石，三种变种及其磨制版都掉自己
    variants: [
      { name: 'stone', label: '石头', textures: same('stone'), drops: [{ item: 'cobblestone', min: 1, max: 1 }] },
      ...STONE_VARIANTS.flatMap((v) => [
        { name: v.id, label: v.label, textures: same(v.id) },
        { name: `polished_${v.id}`, label: `磨制${v.label}`, textures: same(`polished_${v.id}`) },
      ]),
    ],
  }),
  cube(BlockId.GRASS, 'grass_block', '草方块', topSide('grass_top', 'grass_side', 'dirt'), 0.6, ToolType.SHOVEL, {
    drops: [{ item: 'dirt', min: 1, max: 1 }],
  }),
  cube(BlockId.DIRT, 'dirt', '泥土', same('dirt'), 0.5, ToolType.SHOVEL),
  cube(BlockId.COBBLESTONE, 'cobblestone', '圆石', same('cobblestone'), 2, ToolType.PICKAXE, {
    minTier: ToolTier.WOOD,
  }),
  cube(BlockId.PLANKS, 'planks', '橡木木板', same('planks'), 2, ToolType.AXE, {
    flammable: true,
    variants: WOOD_VARIANTS.map((w) => ({
      name: w.id === 'oak' ? 'planks' : `${w.id}_planks`,
      label: `${w.label}木板`,
      textures: same(`planks_${w.id}`),
    })),
  }),
  cross(BlockId.SAPLING, 'sapling', '橡树树苗', 'sapling', {
    variants: WOOD_VARIANTS.map((w) => ({
      name: w.id === 'oak' ? 'sapling' : `${w.id}_sapling`,
      label: `${w.label}树苗`,
      textures: same(`sapling_${w.id}`),
    })),
  }),
  cube(BlockId.BEDROCK, 'bedrock', '基岩', same('bedrock'), -1, null, { isBlastResistant: true }),
  {
    id: BlockId.WATER,
    name: 'water',
    label: '水',
    textures: same('water'),
    render: RenderType.TRANSLUCENT,
    solid: false,
    opaque: false,
    hardness: 100,
    tool: null,
    light: 0,
    isLiquid: true,
    drops: [],
  },
  {
    id: BlockId.LAVA,
    name: 'lava',
    label: '岩浆',
    textures: same('lava'),
    render: RenderType.OPAQUE,
    solid: false,
    opaque: false,
    hardness: -1,
    tool: null,
    light: 15,
    isLiquid: true,
    noItem: true,
  },
  cube(BlockId.SAND, 'sand', '沙子', same('sand'), 0.5, ToolType.SHOVEL, { hasGravity: true }),
  cube(BlockId.GRAVEL, 'gravel', '砂砾', same('gravel'), 0.6, ToolType.SHOVEL, {
    hasGravity: true,
    // 原版是"要么砂砾要么燧石"，这里简化成额外 10% 掉燧石
    drops: [
      { item: 'gravel', min: 1, max: 1 },
      { item: 'flint', min: 1, max: 1, chance: 0.1 },
    ],
  }),
  cube(BlockId.GOLD_ORE, 'gold_ore', '金矿石', same('gold_ore'), 3, ToolType.PICKAXE, { minTier: ToolTier.IRON }),
  cube(BlockId.IRON_ORE, 'iron_ore', '铁矿石', same('iron_ore'), 3, ToolType.PICKAXE, { minTier: ToolTier.STONE }),
  cube(BlockId.REDSTONE_ORE, 'redstone_ore', '红石矿石', same('redstone_ore'), 3, ToolType.PICKAXE, {
    minTier: ToolTier.IRON,
    drops: [{ item: 'redstone', min: 4, max: 5 }],
    xp: [1, 5],
  }),
  cube(BlockId.LAPIS_ORE, 'lapis_ore', '青金石矿石', same('lapis_ore'), 3, ToolType.PICKAXE, {
    minTier: ToolTier.STONE,
    drops: [{ item: 'lapis_lazuli', min: 4, max: 8 }],
    xp: [2, 5],
  }),
  cube(BlockId.COAL_ORE, 'coal_ore', '煤矿石', same('coal_ore'), 3, ToolType.PICKAXE, {
    minTier: ToolTier.WOOD,
    drops: [{ item: 'coal', min: 1, max: 1 }],
    xp: [0, 2],
  }),
  cube(BlockId.LOG, 'log', '橡木原木', topSide('log_top', 'log_side'), 2, ToolType.AXE, {
    flammable: true,
    variants: WOOD_VARIANTS.map((w) => ({
      name: w.id === 'oak' ? 'log' : `${w.id}_log`,
      label: `${w.label}原木`,
      textures: topSide(`log_top_${w.id}`, `log_side_${w.id}`),
    })),
  }),
  {
    id: BlockId.LEAVES,
    name: 'leaves',
    label: '橡树树叶',
    textures: same('leaves'),
    render: RenderType.CUTOUT,
    solid: true,
    opaque: false,
    hardness: 0.2,
    tool: null,
    light: 0,
    flammable: true,
    // 每种树叶掉自己那种树苗；只有橡木与深色橡木会掉苹果（与 1.8.9 一致）
    variants: WOOD_VARIANTS.map((w) => ({
      name: w.id === 'oak' ? 'leaves' : `${w.id}_leaves`,
      label: `${w.label}树叶`,
      textures: same(`leaves_${w.id}`),
      drops: [
        { item: w.id === 'oak' ? 'sapling' : `${w.id}_sapling`, min: 1, max: 1, chance: 0.05 },
        ...(w.id === 'oak' || w.id === 'dark_oak' ? [{ item: 'apple', min: 1, max: 1, chance: 0.02 }] : []),
      ],
    })),
  },
  {
    id: BlockId.GLASS,
    name: 'glass',
    label: '玻璃',
    textures: same('glass'),
    render: RenderType.CUTOUT,
    solid: true,
    opaque: false,
    hardness: 0.3,
    tool: null,
    light: 0,
    drops: [],
  },
  cube(BlockId.SANDSTONE, 'sandstone', '砂岩', topSide('sandstone_top', 'sandstone_side'), 0.8, ToolType.PICKAXE, {
    minTier: ToolTier.WOOD,
  }),
  cross(BlockId.TALL_GRASS, 'tall_grass', '草丛', 'tall_grass', {
    drops: [{ item: 'wheat_seeds', min: 1, max: 1, chance: 0.125 }],
  }),
  cube(BlockId.WOOL, 'wool', '白色羊毛', same('wool_white'), 0.8, null, {
    flammable: true,
    variants: COLOR_VARIANTS.map((c) => ({
      name: c.id === 'white' ? 'wool' : `${c.id}_wool`,
      label: `${c.label}羊毛`,
      textures: same(`wool_${c.id}`),
    })),
  }),
  cross(BlockId.DANDELION, 'dandelion', '蒲公英', 'dandelion'),
  // 蘑菇：只长在暗处，随机 tick 会向四周蔓延
  cross(BlockId.BROWN_MUSHROOM, 'brown_mushroom', '棕色蘑菇', 'brown_mushroom'),
  cross(BlockId.RED_MUSHROOM, 'red_mushroom', '红色蘑菇', 'red_mushroom'),
  cross(BlockId.POPPY, 'poppy', '虞美人', 'poppy'),
  cube(BlockId.BRICKS, 'bricks', '砖块', same('bricks'), 2, ToolType.PICKAXE, { minTier: ToolTier.WOOD }),
  cube(BlockId.TNT, 'tnt', 'TNT', topSide('tnt_top', 'tnt_side', 'tnt_bottom'), 0, null, {
    interactive: true,
    // 被红石充能就点着
    redstone: { ignitesWhenPowered: true },
  }),
  cube(BlockId.BOOKSHELF, 'bookshelf', '书架', topSide('planks', 'bookshelf'), 1.5, ToolType.AXE, {
    flammable: true,
  }),
  cube(BlockId.MOSSY_COBBLESTONE, 'mossy_cobblestone', '苔石', same('mossy_cobblestone'), 2, ToolType.PICKAXE, {
    minTier: ToolTier.WOOD,
  }),
  cube(BlockId.OBSIDIAN, 'obsidian', '黑曜石', same('obsidian'), 50, ToolType.PICKAXE, {
    minTier: ToolTier.DIAMOND,
    isBlastResistant: true,
  }),
  cube(BlockId.MOB_SPAWNER, 'mob_spawner', '刷怪笼', same('mob_spawner'), 5, ToolType.PICKAXE, {
    render: RenderType.CUTOUT,
    opaque: false,
    minTier: ToolTier.WOOD,
    drops: [],
    noItem: true,
    xp: [15, 43],
  }),
  cross(BlockId.COBWEB, 'cobweb', '蜘蛛网', 'cobweb', {
    needsSupport: false,
    hardness: 4,
    tool: ToolType.SWORD,
    drops: [{ item: 'string', min: 1, max: 1 }],
  }),
  {
    id: BlockId.FIRE,
    name: 'fire',
    label: '火',
    textures: same('fire'),
    render: RenderType.CROSS,
    shape: BlockShape.CROSS,
    solid: false,
    opaque: false,
    hardness: 0,
    tool: null,
    light: 15,
    drops: [],
    noItem: true,
  },
  {
    id: BlockId.TORCH,
    name: 'torch',
    label: '火把',
    textures: same('torch'),
    render: RenderType.CROSS,
    solid: false,
    opaque: false,
    hardness: 0,
    tool: null,
    light: 14,
    needsSupport: true,
  },
  cube(BlockId.DIAMOND_ORE, 'diamond_ore', '钻石矿石', same('diamond_ore'), 3, ToolType.PICKAXE, {
    minTier: ToolTier.IRON,
    drops: [{ item: 'diamond', min: 1, max: 1 }],
    xp: [3, 7],
  }),
  cube(
    BlockId.CRAFTING_TABLE,
    'crafting_table',
    '工作台',
    {
      top: 'crafting_table_top',
      bottom: 'planks',
      north: 'crafting_table_front',
      south: 'crafting_table_side',
      east: 'crafting_table_side',
      west: 'crafting_table_front',
    },
    2.5,
    ToolType.AXE,
    { interactive: true },
  ),
  cube(
    BlockId.FURNACE,
    'furnace',
    '熔炉',
    {
      top: 'furnace_top',
      bottom: 'furnace_top',
      north: 'furnace_front',
      south: 'furnace_side',
      east: 'furnace_side',
      west: 'furnace_side',
    },
    3.5,
    ToolType.PICKAXE,
    { minTier: ToolTier.WOOD, interactive: true },
  ),
  cube(BlockId.SNOW, 'snow', '雪块', same('snow'), 0.2, ToolType.SHOVEL, {
    drops: [{ item: 'snowball', min: 4, max: 4 }],
  }),
  cube(BlockId.GLOWSTONE, 'glowstone', '萤石', same('glowstone'), 0.3, null, {
    light: 15,
    drops: [{ item: 'glowstone_dust', min: 2, max: 4 }],
  }),
  cube(BlockId.STONE_BRICKS, 'stone_bricks', '石砖', same('stone_bricks'), 1.5, ToolType.PICKAXE, {
    minTier: ToolTier.WOOD,
  }),
  cube(
    BlockId.PUMPKIN,
    'pumpkin',
    '南瓜',
    {
      top: 'pumpkin_top',
      bottom: 'pumpkin_top',
      north: 'pumpkin_face',
      south: 'pumpkin_side',
      east: 'pumpkin_side',
      west: 'pumpkin_side',
    },
    1,
    ToolType.AXE,
  ),
  cube(BlockId.MELON, 'melon', '西瓜', topSide('melon_top', 'melon_side'), 1, ToolType.AXE, {
    drops: [{ item: 'melon_slice', min: 3, max: 7 }],
  }),
  {
    ...cube(BlockId.CACTUS, 'cactus', '仙人掌', topSide('cactus_top', 'cactus_side'), 0.4, null, {
      opaque: false,
      needsSupport: true,
    }),
    shape: BlockShape.CACTUS,
  },
  {
    ...cube(BlockId.BREWING_STAND, 'brewing_stand', '酿造台', same('brewing_stand'), 0.5, ToolType.PICKAXE, {
      opaque: false,
      interactive: true,
      light: 1,
    }),
    shape: BlockShape.BREWING_STAND,
  },
  {
    ...cube(
      BlockId.ENCHANTING_TABLE,
      'enchanting_table',
      '附魔台',
      topSide('enchanting_table_top', 'enchanting_table_side', 'obsidian'),
      5,
      ToolType.PICKAXE,
      { opaque: false, interactive: true, minTier: ToolTier.WOOD },
    ),
    shape: BlockShape.ENCHANTING_TABLE,
  },
  cube(BlockId.GOLD_BLOCK, 'gold_block', '金块', same('gold_block'), 3, ToolType.PICKAXE, {
    minTier: ToolTier.IRON,
  }),
  cube(BlockId.IRON_BLOCK, 'iron_block', '铁块', same('iron_block'), 5, ToolType.PICKAXE, {
    minTier: ToolTier.STONE,
  }),
  cube(BlockId.DIAMOND_BLOCK, 'diamond_block', '钻石块', same('diamond_block'), 5, ToolType.PICKAXE, {
    minTier: ToolTier.IRON,
  }),
  {
    ...cube(BlockId.ANVIL, 'anvil', '铁砧', topSide('anvil_top', 'anvil'), 5, ToolType.PICKAXE, {
      opaque: false,
      interactive: true,
      minTier: ToolTier.WOOD,
    }),
    shape: BlockShape.ANVIL,
  },
  cube(BlockId.NETHERRACK, 'netherrack', '地狱岩', same('netherrack'), 0.4, ToolType.PICKAXE),
  {
    ...cross(BlockId.NETHER_WART, 'nether_wart_block', '下界疣', 'nether_wart_0', {
      needsSupport: true,
      noItem: true,
      texturesForMeta: (meta: number) => same(`nether_wart_${Math.min(NETHER_WART_MAX_STAGE, meta)}`),
      crop: {
        seedItem: 'nether_wart',
        produce: { item: 'nether_wart', min: 2, max: 4 },
        soil: BlockId.SOUL_SAND,
        maxStage: NETHER_WART_MAX_STAGE,
        needsLight: false,
      },
    }),
  },
  cube(BlockId.END_STONE, 'end_stone', '末地石', same('end_stone'), 3, ToolType.PICKAXE, {
    minTier: ToolTier.WOOD,
  }),
  // 末地传送门：踩上去就传送，不挡人、自带亮光
  cube(BlockId.END_PORTAL, 'end_portal', '末地传送门', same('end_portal'), -1, null, {
    solid: false,
    opaque: false,
    light: 15,
    noItem: true,
    render: RenderType.TRANSLUCENT,
    isBlastResistant: false,
  }),
  cube(
    BlockId.END_PORTAL_FRAME,
    'end_portal_frame',
    '末地传送门框架',
    topSide('end_portal_frame_top', 'end_portal_frame_side'),
    -1,
    null,
    {
      noItem: true,
      isBlastResistant: false,
      // meta 的第 3 位表示镶了末影之眼，顶面换一张
      texturesForMeta: (meta: number) =>
        topSide((meta & END_PORTAL_FRAME_EYE_BIT) !== 0 ? 'end_portal_frame_eye' : 'end_portal_frame_top', 'end_portal_frame_side'),
    },
  ),
  cube(BlockId.DRAGON_EGG, 'dragon_egg', '龙蛋', same('dragon_egg'), 3, null, {
    opaque: false,
    light: 1,
  }),
  cube(BlockId.SOUL_SAND, 'soul_sand', '灵魂沙', same('soul_sand'), 0.5, ToolType.SHOVEL, {
    soundGroup: SoundGroup.SAND,
  }),
  cube(BlockId.QUARTZ_ORE, 'quartz_ore', '下界石英矿', same('quartz_ore'), 3, ToolType.PICKAXE, {
    drops: [{ item: 'quartz', min: 1, max: 1 }],
    xp: [2, 5],
  }),
  cube(BlockId.NETHER_BRICKS, 'nether_bricks', '下界砖块', same('nether_bricks'), 2, ToolType.PICKAXE, {
    minTier: ToolTier.WOOD,
  }),
  cube(BlockId.QUARTZ_BLOCK, 'quartz_block', '石英块', same('quartz_block'), 0.8, ToolType.PICKAXE, {
    minTier: ToolTier.WOOD,
  }),
  {
    ...cube(
      BlockId.WITHER_SKULL,
      'wither_skeleton_skull',
      '凋灵骷髅头',
      topSide('wither_skull_top', 'wither_skull_side'),
      1,
      null,
      { opaque: false },
    ),
    shape: BlockShape.SKULL,
  },
  // 红石粉：贴地的十字面片，meta 存 0~15 的信号强度
  {
    ...cross(BlockId.REDSTONE_WIRE, 'redstone_wire', '红石粉', 'redstone_dust', {
      needsSupport: true,
      noItem: true,
      texturesForMeta: (meta: number) => same(meta > 0 ? 'redstone_dust_on' : 'redstone_dust'),
      redstone: {},
    }),
    shape: BlockShape.WIRE,
  },
  cube(BlockId.REDSTONE_BLOCK, 'redstone_block', '红石块', same('redstone_block'), 5, ToolType.PICKAXE, {
    minTier: ToolTier.WOOD,
    redstone: { source: REDSTONE_MAX_POWER },
  }),
  {
    ...cross(BlockId.REDSTONE_TORCH, 'redstone_torch', '红石火把', 'redstone_torch', {
      needsSupport: true,
      light: 7,
      // 火把是反相器：脚下方块通电时它自己灭掉（切到熄灭态那个 id）
      redstone: { source: REDSTONE_MAX_POWER, invertedOffId: BlockId.REDSTONE_TORCH_OFF },
    }),
  },
  {
    ...cross(BlockId.REDSTONE_TORCH_OFF, 'redstone_torch_off', '红石火把（熄灭）', 'redstone_torch_off', {
      needsSupport: true,
      noItem: true,
      drops: [{ item: 'redstone_torch', min: 1, max: 1 }],
      redstone: { invertedOnId: BlockId.REDSTONE_TORCH },
    }),
  },
  {
    ...cube(BlockId.REPEATER, 'repeater', '红石中继器', same('repeater'), 0.5, null, {
      solid: false,
      opaque: false,
      needsSupport: true,
      interactive: true,
      hasFacing: true,
      redstone: { repeater: true, litBlockId: BlockId.REPEATER_ON },
    }),
    shape: BlockShape.PRESSURE_PLATE,
  },
  {
    ...cube(BlockId.REPEATER_ON, 'repeater_on', '红石中继器（通电）', same('repeater_on'), 0.5, null, {
      solid: false,
      opaque: false,
      needsSupport: true,
      interactive: true,
      hasFacing: true,
      noItem: true,
      drops: [{ item: 'repeater', min: 1, max: 1 }],
      redstone: { repeater: true, source: REDSTONE_MAX_POWER, unlitBlockId: BlockId.REPEATER },
    }),
    shape: BlockShape.PRESSURE_PLATE,
  },
  {
    ...cube(BlockId.GLASS_PANE, 'glass_pane', '玻璃板', same('glass'), 0.3, null, {
      render: RenderType.CUTOUT,
      opaque: false,
      connectGroup: 'pane',
    }),
    shape: BlockShape.PANE,
  },
  {
    ...cube(BlockId.IRON_BARS, 'iron_bars', '铁栏杆', same('iron_bars'), 5, ToolType.PICKAXE, {
      render: RenderType.CUTOUT,
      opaque: false,
      minTier: ToolTier.WOOD,
      connectGroup: 'pane',
    }),
    shape: BlockShape.PANE,
  },
  {
    ...cube(BlockId.TRAPDOOR, 'trapdoor', '活板门', same('trapdoor'), 3, ToolType.AXE, {
      render: RenderType.CUTOUT,
      opaque: false,
      interactive: true,
      hasFacing: true,
      redstone: { opensWhenPowered: true },
    }),
    shape: BlockShape.TRAPDOOR,
  },
  {
    ...cube(BlockId.TRIPWIRE_HOOK, 'tripwire_hook', '绊线钩', same('tripwire_hook'), 0.5, null, {
      solid: false,
      opaque: false,
      needsSupport: true,
      hasFacing: true,
      redstone: { source: REDSTONE_MAX_POWER, poweredBit: REDSTONE_POWERED_BIT },
    }),
    shape: BlockShape.PRESSURE_PLATE,
  },
  {
    ...cube(BlockId.TRIPWIRE, 'tripwire', '绊线', same('tripwire'), 0, null, {
      solid: false,
      opaque: false,
      needsSupport: true,
      noItem: true,
      drops: [{ item: 'string', min: 1, max: 1 }],
    }),
    shape: BlockShape.PRESSURE_PLATE,
  },
  {
    ...cube(BlockId.COMPARATOR, 'comparator', '红石比较器', same('comparator'), 0.5, null, {
      solid: false,
      opaque: false,
      needsSupport: true,
      interactive: true,
      hasFacing: true,
      redstone: { comparator: true },
    }),
    shape: BlockShape.PRESSURE_PLATE,
  },
  {
    ...cube(BlockId.LEVER, 'lever', '拉杆', same('lever'), 0.5, null, {
      solid: false,
      opaque: false,
      needsSupport: true,
      interactive: true,
      redstone: { source: REDSTONE_MAX_POWER, poweredBit: REDSTONE_POWERED_BIT },
    }),
    shape: BlockShape.LEVER,
  },
  {
    ...cube(BlockId.STONE_BUTTON, 'stone_button', '石头按钮', same('stone_button'), 0.5, ToolType.PICKAXE, {
      solid: false,
      opaque: false,
      needsSupport: true,
      interactive: true,
      redstone: { source: REDSTONE_MAX_POWER, poweredBit: REDSTONE_POWERED_BIT },
    }),
    shape: BlockShape.BUTTON,
  },
  {
    ...cube(
      BlockId.STONE_PRESSURE_PLATE,
      'stone_pressure_plate',
      '石头压力板',
      same('stone_pressure_plate'),
      0.5,
      ToolType.PICKAXE,
      {
        solid: false,
        opaque: false,
        needsSupport: true,
        redstone: { source: REDSTONE_MAX_POWER, poweredBit: REDSTONE_POWERED_BIT },
      },
    ),
    shape: BlockShape.PRESSURE_PLATE,
  },
  cube(BlockId.REDSTONE_LAMP, 'redstone_lamp', '红石灯', same('redstone_lamp'), 0.3, null, {
    redstone: { litBlockId: BlockId.REDSTONE_LAMP_LIT },
  }),
  cube(BlockId.REDSTONE_LAMP_LIT, 'redstone_lamp_lit', '红石灯（亮）', same('redstone_lamp_on'), 0.3, null, {
    light: 15,
    noItem: true,
    drops: [{ item: 'redstone_lamp', min: 1, max: 1 }],
    redstone: { unlitBlockId: BlockId.REDSTONE_LAMP },
  }),
  {
    ...cube(BlockId.RAIL, 'rail', '铁轨', same('rail'), 0.7, ToolType.PICKAXE, {
      solid: false,
      opaque: false,
      needsSupport: true,
      render: RenderType.CUTOUT,
      texturesForMeta: (meta: number) => same((meta & RAIL_SHAPE_MASK) === RailShape.NORTH_SOUTH ? 'rail_ns' : 'rail'),
    }),
    shape: BlockShape.WIRE,
  },
  {
    ...cube(BlockId.POWERED_RAIL, 'powered_rail', '动力铁轨', same('powered_rail'), 0.7, ToolType.PICKAXE, {
      solid: false,
      opaque: false,
      needsSupport: true,
      render: RenderType.CUTOUT,
      texturesForMeta: (meta: number) => {
        const ns = (meta & RAIL_SHAPE_MASK) === RailShape.NORTH_SOUTH;
        const on = (meta & POWERED_RAIL_LIT_BIT) !== 0;
        return same(`powered_rail${on ? '_on' : ''}${ns ? '_ns' : ''}`);
      },
      redstone: { poweredRail: true },
    }),
    shape: BlockShape.WIRE,
  },
  cube(BlockId.HOPPER, 'hopper', '漏斗', topSide('hopper_top', 'hopper_side'), 3, ToolType.PICKAXE, {
    minTier: ToolTier.WOOD,
    opaque: false,
    interactive: true,
    hasFacing: true,
  }),
  cube(BlockId.DISPENSER, 'dispenser', '发射器', topSide('furnace_top', 'dispenser_front'), 3.5, ToolType.PICKAXE, {
    minTier: ToolTier.WOOD,
    interactive: true,
    hasFacing: true,
    redstone: { dispenser: true },
  }),
  cube(BlockId.DROPPER, 'dropper', '投掷器', topSide('furnace_top', 'dropper_front'), 3.5, ToolType.PICKAXE, {
    minTier: ToolTier.WOOD,
    interactive: true,
    hasFacing: true,
    redstone: { dispenser: true, dropper: true },
  }),
  cube(BlockId.NOTE_BLOCK, 'note_block', '音符盒', same('note_block'), 0.8, ToolType.AXE, {
    interactive: true,
    redstone: { noteBlock: true },
  }),
  {
    ...cube(
      BlockId.DAYLIGHT_SENSOR,
      'daylight_sensor',
      '阳光传感器',
      topSide('daylight_sensor_top', 'daylight_sensor_side'),
      0.2,
      ToolType.AXE,
      {
        solid: false,
        opaque: false,
        redstone: { source: REDSTONE_MAX_POWER, analogFromMeta: true },
      },
    ),
    // 只有半格高，和压力板 / 中继器同一类扁平形状
    shape: BlockShape.PRESSURE_PLATE,
  },
  cube(BlockId.PISTON, 'piston', '活塞', topSide('piston_top', 'piston_side'), 0.5, null, {
    hasFacing: true,
    redstone: { piston: true },
  }),
  cube(BlockId.STICKY_PISTON, 'sticky_piston', '粘性活塞', topSide('sticky_piston_top', 'piston_side'), 0.5, null, {
    hasFacing: true,
    redstone: { piston: true, sticky: true },
  }),
  cube(BlockId.PISTON_HEAD, 'piston_head', '活塞臂', same('piston_top'), -1, null, {
    noItem: true,
    opaque: false,
    isBlastResistant: false,
  }),
  cube(BlockId.BEACON, 'beacon', '信标', same('beacon'), 3, null, {
    opaque: false,
    interactive: true,
    light: 15,
  }),
  // 传送门：站进去会被传送，本身不挡人、自带微光
  {
    ...cube(BlockId.NETHER_PORTAL, 'nether_portal', '下界传送门', same('nether_portal'), -1, null, {
      solid: false,
      opaque: false,
      light: 11,
      noItem: true,
      render: RenderType.TRANSLUCENT,
      isBlastResistant: false,
    }),
  },
  cross(BlockId.SUGAR_CANE, 'sugar_cane', '甘蔗', 'sugar_cane', {
    drops: [{ item: 'sugar_cane', min: 1, max: 1 }],
  }),
  {
    ...cube(BlockId.FARMLAND, 'farmland', '耕地', topSide('farmland_dry', 'dirt'), 0.6, ToolType.SHOVEL, {
      drops: [{ item: 'dirt', min: 1, max: 1 }],
      noItem: true,
    }),
    shape: BlockShape.FARMLAND,
    texturesForMeta: (meta: number) => topSide(meta > 0 ? 'farmland_wet' : 'farmland_dry', 'dirt'),
  },
  {
    ...cross(BlockId.WHEAT, 'wheat_crop', '小麦', 'wheat_stage_0', {
      noItem: true,
      drops: [],
      crop: {
        seedItem: 'wheat_seeds',
        produce: { item: 'wheat', min: 1, max: 1 },
        extraSeeds: { min: 0, max: 3 },
      },
    }),
    texturesForMeta: (meta: number) => same(`wheat_stage_${Math.min(CROP_MAX_STAGE, meta)}`),
  },
  {
    ...cross(BlockId.CARROTS, 'carrots', '胡萝卜', 'carrots_stage_0', {
      noItem: true,
      drops: [],
      crop: { seedItem: 'carrot', produce: { item: 'carrot', min: 1, max: 4 } },
    }),
    texturesForMeta: (meta: number) => same(`carrots_stage_${Math.min(CROP_MAX_STAGE, meta)}`),
  },
  {
    ...cross(BlockId.POTATOES, 'potatoes', '土豆', 'potatoes_stage_0', {
      noItem: true,
      drops: [],
      crop: { seedItem: 'potato', produce: { item: 'potato', min: 1, max: 4 } },
    }),
    texturesForMeta: (meta: number) => same(`potatoes_stage_${Math.min(CROP_MAX_STAGE, meta)}`),
  },
  {
    ...cube(BlockId.FENCE, 'fence', '橡木栅栏', same('planks'), 2, ToolType.AXE, {
      render: RenderType.CUTOUT,
      opaque: false,
    }),
    shape: BlockShape.FENCE,
    connectGroup: 'fence',
  },
  {
    ...cube(BlockId.FENCE_GATE, 'fence_gate', '橡木栅栏门', same('planks'), 2, ToolType.AXE, {
      render: RenderType.CUTOUT,
      opaque: false,
      interactive: true,
      redstone: { opensWhenPowered: true },
    }),
    shape: BlockShape.FENCE_GATE,
    connectGroup: 'fence',
  },
  {
    ...cube(BlockId.WOODEN_DOOR, 'wooden_door', '木门', same('door_lower'), 3, ToolType.AXE, {
      render: RenderType.CUTOUT,
      opaque: false,
      interactive: true,
      drops: [{ item: 'wooden_door', min: 1, max: 1 }],
      redstone: { opensWhenPowered: true },
    }),
    shape: BlockShape.DOOR,
    hasFacing: true,
    texturesForMeta: (meta: number) => same((meta & DOOR_UPPER_BIT) === 0 ? 'door_lower' : 'door_upper'),
  },
  {
    ...cube(BlockId.LADDER, 'ladder', '梯子', same('ladder'), 0.4, ToolType.AXE, {
      render: RenderType.CUTOUT,
      solid: false,
      opaque: false,
      climbable: true,
    }),
    shape: BlockShape.LADDER,
    hasFacing: true,
  },
  {
    ...cube(BlockId.BED, 'bed', '床', same('bed_foot_top'), 0.2, null, {
      opaque: false,
      interactive: true,
      drops: [{ item: 'bed', min: 1, max: 1 }],
    }),
    shape: BlockShape.BED,
    hasFacing: true,
    // north = 朝向那一端、south = 另一端、east/west = 两侧
    texturesForMeta: (meta: number) =>
      (meta & BED_HEAD_BIT) === 0
        ? {
            top: 'bed_foot_top',
            bottom: 'bed_foot_top',
            north: 'bed_foot_side',
            south: 'bed_foot_end',
            east: 'bed_foot_side',
            west: 'bed_foot_side',
          }
        : {
            top: 'bed_head_top',
            bottom: 'bed_head_top',
            north: 'bed_head_end',
            south: 'bed_head_side',
            east: 'bed_head_side',
            west: 'bed_head_side',
          },
  },
  {
    ...cube(
      BlockId.CHEST,
      'chest',
      '箱子',
      {
        top: 'chest_top',
        bottom: 'chest_top',
        north: 'chest_front',
        south: 'chest_side',
        east: 'chest_side',
        west: 'chest_side',
      },
      2.5,
      ToolType.AXE,
      { interactive: true },
    ),
    hasFacing: true,
  },
  {
    ...cube(
      BlockId.TRAPPED_CHEST,
      'trapped_chest',
      '陷阱箱',
      {
        top: 'chest_top',
        bottom: 'chest_top',
        north: 'trapped_chest_front',
        south: 'chest_side',
        east: 'chest_side',
        west: 'chest_side',
      },
      2.5,
      ToolType.AXE,
      {
        interactive: true,
        // 有人打开着就通电（1.8.9 按查看人数给强度，这里只有本地玩家，开着即满强度）
        redstone: { source: REDSTONE_MAX_POWER, poweredBit: REDSTONE_POWERED_BIT },
      },
    ),
    hasFacing: true,
  },
  slab(BlockId.STONE_SLAB, 'stone_slab', '石半砖', same('stone'), 2, ToolType.PICKAXE, {
    minTier: ToolTier.WOOD,
    doubleSlabId: BlockId.DOUBLE_STONE_SLAB,
  }),
  cube(BlockId.DOUBLE_STONE_SLAB, 'double_stone_slab', '双层石半砖', same('stone'), 2, ToolType.PICKAXE, {
    minTier: ToolTier.WOOD,
    drops: [{ item: 'stone_slab', min: 2, max: 2 }],
    noItem: true,
  }),
  slab(BlockId.OAK_SLAB, 'oak_slab', '橡木半砖', same('planks'), 2, ToolType.AXE, {
    doubleSlabId: BlockId.DOUBLE_OAK_SLAB,
  }),
  cube(BlockId.DOUBLE_OAK_SLAB, 'double_oak_slab', '双层橡木半砖', same('planks'), 2, ToolType.AXE, {
    drops: [{ item: 'oak_slab', min: 2, max: 2 }],
    noItem: true,
  }),
  stairs(BlockId.OAK_STAIRS, 'oak_stairs', '橡木楼梯', same('planks'), 2, ToolType.AXE),
  stairs(BlockId.COBBLESTONE_STAIRS, 'cobblestone_stairs', '圆石楼梯', same('cobblestone'), 2, ToolType.PICKAXE, {
    minTier: ToolTier.WOOD,
  }),
  stairs(BlockId.BRICK_STAIRS, 'brick_stairs', '砖块楼梯', same('bricks'), 2, ToolType.PICKAXE, {
    minTier: ToolTier.WOOD,
  }),
  stairs(BlockId.STONE_BRICK_STAIRS, 'stone_brick_stairs', '石砖楼梯', same('stone_bricks'), 1.5, ToolType.PICKAXE, {
    minTier: ToolTier.WOOD,
  }),
  stairs(
    BlockId.SANDSTONE_STAIRS,
    'sandstone_stairs',
    '砂岩楼梯',
    topSide('sandstone_top', 'sandstone_side'),
    0.8,
    ToolType.PICKAXE,
    { minTier: ToolTier.WOOD },
  ),
];

const BLOCKS_BY_ID: (BlockDef | undefined)[] = [];
const BLOCKS_BY_NAME = new Map<string, BlockDef>();
/** 播种物品 id → 作物方块 id。 */
const CROP_BY_SEED = new Map<string, number>();
for (const def of BLOCK_DEFS) {
  BLOCKS_BY_ID[def.id] = def;
  BLOCKS_BY_NAME.set(def.name, def);
  if (def.crop) {
    CROP_BY_SEED.set(def.crop.seedItem, def.id);
  }
}

/** 取某方块在给定 meta 下的变种序号。 */
export function variantIndex(def: BlockDef, meta: number): number {
  if (!def.variants) {
    return 0;
  }
  return Math.min(def.variants.length - 1, meta & (def.variantMask ?? DEFAULT_VARIANT_MASK));
}

/** 取某方块在给定 meta 下的变种信息；没有变种时用方块自身的名字 / 标签 / 贴图。 */
export function blockVariant(def: BlockDef, meta: number): BlockVariant {
  return def.variants ? def.variants[variantIndex(def, meta)] : def;
}

/** 变种物品 id → { 方块 id, meta }。 */
const VARIANT_BY_NAME = new Map<string, { block: number; meta: number }>();
for (const def of BLOCK_DEFS) {
  def.variants?.forEach((variant, index) => {
    VARIANT_BY_NAME.set(variant.name, { block: def.id, meta: index });
  });
}

/** 按变种物品 id 查它对应的方块与 meta。 */
export function blockForVariantName(name: string): { block: number; meta: number } | undefined {
  return VARIANT_BY_NAME.get(name);
}

/** 该物品能种出哪种作物；不能播种返回 null。 */
export function cropBlockForSeed(itemId: string): number | null {
  return CROP_BY_SEED.get(itemId) ?? null;
}
const AIR_DEF = BLOCKS_BY_ID[BlockId.AIR] as BlockDef;

/** 按数值 id 获取方块定义；未知 id 返回空气。 */
export function getBlock(id: number): BlockDef {
  return BLOCKS_BY_ID[id] ?? AIR_DEF;
}

/** 方块 id 上限（id 存在 Uint8Array 里）。 */
const BLOCK_ID_LIMIT = 256;
/** 光穿过某方块时额外衰减多少级；LIGHT_BLOCKED 表示完全不透光。供光照 BFS 查表用，省掉逐格读 def 属性。 */
export const LIGHT_BLOCKED = 255;
export const LIGHT_ATTENUATION_BY_ID: Uint8Array = new Uint8Array(BLOCK_ID_LIMIT);
/** 各方块自身发光强度表。 */
export const LIGHT_EMISSION_BY_ID: Uint8Array = new Uint8Array(BLOCK_ID_LIMIT);
for (let id = 0; id < BLOCK_ID_LIMIT; id++) {
  const def = getBlock(id);
  LIGHT_ATTENUATION_BY_ID[id] = def.opaque ? LIGHT_BLOCKED : def.isLiquid ? LIQUID_LIGHT_ATTENUATION : 0;
  LIGHT_EMISSION_BY_ID[id] = def.light;
}

/** 按名称获取方块定义。 */
export function getBlockByName(name: string): BlockDef | undefined {
  return BLOCKS_BY_NAME.get(name);
}

/** 判断方块是否遮光（用于面剔除）。 */
export function isOpaque(id: number): boolean {
  return getBlock(id).opaque;
}

/** 判断方块是否有碰撞体。 */
export function isSolid(id: number): boolean {
  return getBlock(id).solid;
}

/** 收集所有贴图 key（去重），供图集生成。 */
export function collectBlockTextureKeys(): string[] {
  const keys = new Set<string>();
  const add = (textures: BlockFaceTextures): void => {
    for (const key of Object.values(textures)) {
      if (key !== 'none') {
        keys.add(key);
      }
    }
  };
  for (const def of BLOCK_DEFS) {
    add(def.textures);
    for (const variant of def.variants ?? []) {
      add(variant.textures);
    }
    // 按 meta 换图的方块要把所有变体都收进图集
    for (let meta = 0; def.texturesForMeta && meta < META_VARIANT_COUNT; meta++) {
      add(def.texturesForMeta(meta));
    }
  }
  return [...keys];
}
