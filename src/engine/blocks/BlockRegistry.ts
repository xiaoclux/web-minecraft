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
  };
}

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
    drops: [
      { item: 'sapling', min: 1, max: 1, chance: 0.05 },
      { item: 'apple', min: 1, max: 1, chance: 0.02 },
    ],
    flammable: true,
    variants: WOOD_VARIANTS.map((w) => ({
      name: w.id === 'oak' ? 'leaves' : `${w.id}_leaves`,
      label: `${w.label}树叶`,
      textures: same(`leaves_${w.id}`),
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
  cube(BlockId.WOOL, 'wool', '羊毛', same('wool'), 0.8, null, { flammable: true }),
  cross(BlockId.DANDELION, 'dandelion', '蒲公英', 'dandelion'),
  cross(BlockId.POPPY, 'poppy', '虞美人', 'poppy'),
  cube(BlockId.BRICKS, 'bricks', '砖块', same('bricks'), 2, ToolType.PICKAXE, { minTier: ToolTier.WOOD }),
  cube(BlockId.TNT, 'tnt', 'TNT', topSide('tnt_top', 'tnt_side', 'tnt_bottom'), 0, null, { interactive: true }),
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
  cube(BlockId.GLOWSTONE, 'glowstone', '萤石', same('glowstone'), 0.3, null, { light: 15 }),
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
