import { BlockId } from '../blocks/BlockRegistry';

/** 群系。 */
export const Biome = {
  OCEAN: 'ocean',
  PLAINS: 'plains',
  FOREST: 'forest',
  BIRCH_FOREST: 'birch_forest',
  ROOFED_FOREST: 'roofed_forest',
  TAIGA: 'taiga',
  SNOWY: 'snowy',
  DESERT: 'desert',
  SAVANNA: 'savanna',
  JUNGLE: 'jungle',
  SWAMP: 'swamp',
  MOUNTAINS: 'mountains',
} as const;
export type Biome = (typeof Biome)[keyof typeof Biome];

/** 木材变种序号（与 BlockRegistry 的 WOOD_VARIANTS 顺序一致）。 */
export const Wood = {
  OAK: 0,
  SPRUCE: 1,
  BIRCH: 2,
  JUNGLE: 3,
  ACACIA: 4,
  DARK_OAK: 5,
} as const;

/** 一个群系的地形与植被参数。 */
export interface BiomeDef {
  id: Biome;
  label: string;
  /** 地表方块（海面以下与山顶会被特殊规则覆盖）。 */
  surface: number;
  /** 地表往下几层的填充方块。 */
  filler: number;
  /** 地表方块的 meta（草方块不用，沙漠的砂岩层等用）。 */
  fillerDeep?: number;
  /** 每列长树的概率与木材种类。 */
  treeChance: number;
  treeWood: number;
  /** 树的基础高度与随机增量（丛林更高）。 */
  treeMinHeight?: number;
  treeHeightVariance?: number;
  /** 每列长草 / 花的概率。 */
  grassChance: number;
  flowerChance: number;
  /** 地形高度的额外偏移（沼泽更低、热带草原略高）。 */
  heightBias: number;
  /** 地表铺雪。 */
  snow?: boolean;
  /** 寒冷群系：下雨时落下的是雪花。 */
  snowfall?: boolean;
  /** 地表随机露出石头的概率（山地）。 */
  stoneSurfaceChance?: number;
  /** 每列长仙人掌 / 甘蔗的概率。 */
  cactusChance?: number;
  sugarCaneChance?: number;
}

const GRASS_FILLER = BlockId.DIRT;

/** 全部群系定义。 */
export const BIOME_DEFS: Record<Biome, BiomeDef> = {
  ocean: {
    id: Biome.OCEAN,
    label: '海洋',
    surface: BlockId.SAND,
    filler: BlockId.SAND,
    treeChance: 0,
    treeWood: Wood.OAK,
    grassChance: 0,
    flowerChance: 0,
    heightBias: 0,
  },
  plains: {
    id: Biome.PLAINS,
    label: '平原',
    surface: BlockId.GRASS,
    filler: GRASS_FILLER,
    treeChance: 0.003,
    treeWood: Wood.OAK,
    grassChance: 0.1,
    flowerChance: 0.014,
    heightBias: 0,
    sugarCaneChance: 0.02,
  },
  forest: {
    id: Biome.FOREST,
    label: '森林',
    surface: BlockId.GRASS,
    filler: GRASS_FILLER,
    treeChance: 0.05,
    treeWood: Wood.OAK,
    grassChance: 0.06,
    flowerChance: 0.01,
    heightBias: 0,
  },
  birch_forest: {
    id: Biome.BIRCH_FOREST,
    label: '桦木林',
    surface: BlockId.GRASS,
    filler: GRASS_FILLER,
    treeChance: 0.05,
    treeWood: Wood.BIRCH,
    grassChance: 0.06,
    flowerChance: 0.01,
    heightBias: 0,
  },
  roofed_forest: {
    id: Biome.ROOFED_FOREST,
    label: '黑森林',
    surface: BlockId.GRASS,
    filler: GRASS_FILLER,
    treeChance: 0.09,
    treeWood: Wood.DARK_OAK,
    grassChance: 0.04,
    flowerChance: 0.006,
    heightBias: 0,
  },
  taiga: {
    id: Biome.TAIGA,
    label: '针叶林',
    surface: BlockId.GRASS,
    filler: GRASS_FILLER,
    treeChance: 0.04,
    treeWood: Wood.SPRUCE,
    treeMinHeight: 5,
    treeHeightVariance: 4,
    grassChance: 0.03,
    flowerChance: 0.004,
    heightBias: 1,
    snowfall: true,
  },
  snowy: {
    id: Biome.SNOWY,
    label: '雪原',
    surface: BlockId.GRASS,
    filler: GRASS_FILLER,
    treeChance: 0.012,
    treeWood: Wood.SPRUCE,
    grassChance: 0,
    flowerChance: 0,
    heightBias: 0,
    snow: true,
    snowfall: true,
  },
  desert: {
    id: Biome.DESERT,
    label: '沙漠',
    surface: BlockId.SAND,
    filler: BlockId.SAND,
    fillerDeep: BlockId.SANDSTONE,
    treeChance: 0,
    treeWood: Wood.OAK,
    grassChance: 0,
    flowerChance: 0,
    heightBias: 0,
    cactusChance: 0.012,
    sugarCaneChance: 0.03,
  },
  savanna: {
    id: Biome.SAVANNA,
    label: '热带草原',
    surface: BlockId.GRASS,
    filler: GRASS_FILLER,
    treeChance: 0.006,
    treeWood: Wood.ACACIA,
    grassChance: 0.12,
    flowerChance: 0.002,
    heightBias: 1,
  },
  jungle: {
    id: Biome.JUNGLE,
    label: '丛林',
    surface: BlockId.GRASS,
    filler: GRASS_FILLER,
    treeChance: 0.09,
    treeWood: Wood.JUNGLE,
    treeMinHeight: 7,
    treeHeightVariance: 5,
    grassChance: 0.2,
    flowerChance: 0.006,
    heightBias: 1,
  },
  swamp: {
    id: Biome.SWAMP,
    label: '沼泽',
    surface: BlockId.GRASS,
    filler: GRASS_FILLER,
    treeChance: 0.02,
    treeWood: Wood.OAK,
    grassChance: 0.08,
    flowerChance: 0.004,
    // 沼泽地势低洼，容易积水
    heightBias: -3,
    sugarCaneChance: 0.04,
  },
  mountains: {
    id: Biome.MOUNTAINS,
    label: '山地',
    surface: BlockId.GRASS,
    filler: GRASS_FILLER,
    treeChance: 0.006,
    treeWood: Wood.SPRUCE,
    grassChance: 0.02,
    flowerChance: 0.003,
    heightBias: 0,
    stoneSurfaceChance: 0.35,
  },
};

/** 温度与湿度阈值（噪声值域 -1~1）。 */
const FREEZING = -0.5;
const COLD = -0.2;
const HOT = 0.45;
const WARM = 0.2;
const DRY = -0.25;
const WET = 0.25;
const VERY_WET = 0.5;

/**
 * 按温度与湿度选群系（山地与海洋由高度另行判断）。
 * 表的形状参考 1.8.9：冷 → 雪原 / 针叶林，热 → 沙漠 / 热带草原 / 丛林，温带按湿度分几种森林。
 */
export function biomeFor(temperature: number, humidity: number): Biome {
  if (temperature < FREEZING) {
    return Biome.SNOWY;
  }
  if (temperature < COLD) {
    return Biome.TAIGA;
  }
  if (temperature > HOT) {
    return humidity > WET ? Biome.JUNGLE : Biome.DESERT;
  }
  if (temperature > WARM) {
    return humidity < DRY ? Biome.SAVANNA : Biome.PLAINS;
  }
  if (humidity > VERY_WET) {
    return Biome.SWAMP;
  }
  if (humidity > WET) {
    return Biome.ROOFED_FOREST;
  }
  if (humidity > 0) {
    return Biome.BIRCH_FOREST;
  }
  if (humidity > DRY) {
    return Biome.FOREST;
  }
  return Biome.PLAINS;
}

/** 群系 id → 中文名；未知 id 原样返回（超平坦等生成器可能给别的字符串）。 */
export function biomeLabel(id: string): string {
  return BIOME_DEFS[id as Biome]?.label ?? id;
}

/** 该群系下雨时落的是不是雪（未知群系名如超平坦按下雨算）。 */
export function biomeHasSnowfall(id: string): boolean {
  return BIOME_DEFS[id as Biome]?.snowfall === true;
}
