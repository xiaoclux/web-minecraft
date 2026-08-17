import type { BlockDrop } from '../blocks/BlockRegistry';

/** 生物类型。 */
export const MobType = {
  ZOMBIE: 'zombie',
  SKELETON: 'skeleton',
  CREEPER: 'creeper',
  SPIDER: 'spider',
  PIG: 'pig',
  COW: 'cow',
  SHEEP: 'sheep',
  CHICKEN: 'chicken',
  ENDERMAN: 'enderman',
  SQUID: 'squid',
  BAT: 'bat',
  SLIME: 'slime',
  ZOMBIE_PIGMAN: 'zombie_pigman',
  GHAST: 'ghast',
  BLAZE: 'blaze',
  MAGMA_CUBE: 'magma_cube',
  WITHER_SKELETON: 'wither_skeleton',
  VILLAGER: 'villager',
  CAVE_SPIDER: 'cave_spider',
} as const;
export type MobType = (typeof MobType)[keyof typeof MobType];

/** 生物属性定义。 */
export interface MobDef {
  type: MobType;
  label: string;
  width: number;
  height: number;
  maxHealth: number;
  /** 行走速度（格/秒）。 */
  speed: number;
  hostile: boolean;
  /** 近战伤害（普通难度）。 */
  attackDamage: number;
  drops: BlockDrop[];
  xp: number;
  /** 阳光下燃烧。 */
  burnsInSunlight: boolean;
  /** 仅在夜间/低光敌对（蜘蛛）。 */
  neutralInDaylight?: boolean;
  /** 免疫摔落伤害。 */
  noFallDamage?: boolean;
  /** 可以用这些物品喂食并进入繁殖状态；不填表示不可繁殖。 */
  breedingItems?: readonly string[];
  /** 只在水里生成 / 活动（鱿鱼）。 */
  aquatic?: boolean;
  /** 会飞（蝙蝠）：不受重力、可以在空中乱飞。 */
  flying?: boolean;
  /** 受伤时随机传送（末影人）。 */
  teleports?: boolean;
  /** 死亡时分裂成几只更小的同类（史莱姆）。 */
  splits?: boolean;
  /**
   * 中立：平时不主动攻击，被打了才还手；且同族会一起被激怒（僵尸猪人）。
   */
  neutral?: boolean;
  /** 远程攻击方式；不填表示只有近战。 */
  ranged?: 'arrow' | 'fireball' | 'small_fireball';
  /** 免疫火与岩浆（下界生物）。 */
  fireImmune?: boolean;
  /** 攻击时附带的着火 tick（烈焰人 / 凋灵骷髅）。 */
  igniteTicks?: number;
  /** 攻击时附带的凋零效果时长（凋灵骷髅）。 */
  witherTicks?: number;
  /** 攻击时附带的中毒时长（洞穴蜘蛛）。 */
  poisonTicks?: number;
  /** 只在这些维度里自然生成；不填表示只在主世界。 */
  dimensions?: readonly string[];
}

/** 僵尸猪人掉落金剑的概率（1.8.9 为 8.5%）。 */
const PIGMAN_SWORD_DROP_CHANCE = 0.085;

export const MOB_DEFS: Record<MobType, MobDef> = {
  villager: {
    type: 'villager',
    label: '村民',
    width: 0.6,
    height: 1.95,
    maxHealth: 20,
    speed: 2.4,
    hostile: false,
    attackDamage: 0,
    drops: [],
    xp: 0,
    burnsInSunlight: false,
  },
  zombie: {
    type: 'zombie',
    label: '僵尸',
    width: 0.6,
    height: 1.95,
    maxHealth: 20,
    speed: 2.3,
    hostile: true,
    attackDamage: 3,
    drops: [{ item: 'rotten_flesh', min: 0, max: 2 }],
    xp: 5,
    burnsInSunlight: true,
  },
  skeleton: {
    type: 'skeleton',
    label: '骷髅',
    width: 0.6,
    height: 1.99,
    maxHealth: 20,
    speed: 2.5,
    hostile: true,
    attackDamage: 2,
    drops: [
      { item: 'bone', min: 0, max: 2 },
      { item: 'arrow', min: 0, max: 2 },
    ],
    xp: 5,
    burnsInSunlight: true,
  },
  creeper: {
    type: 'creeper',
    label: '苦力怕',
    width: 0.6,
    height: 1.7,
    maxHealth: 20,
    speed: 2.5,
    hostile: true,
    attackDamage: 0,
    drops: [{ item: 'gunpowder', min: 0, max: 2 }],
    xp: 5,
    burnsInSunlight: false,
  },
  cave_spider: {
    type: 'cave_spider',
    label: '洞穴蜘蛛',
    // 比普通蜘蛛小一圈，能钻进矿井的缝里
    width: 0.7,
    height: 0.5,
    maxHealth: 12,
    speed: 3.2,
    hostile: true,
    attackDamage: 2,
    drops: [
      { item: 'string', min: 0, max: 2 },
      { item: 'spider_eye', min: 1, max: 1, chance: 1 / 3 },
    ],
    xp: 5,
    burnsInSunlight: false,
    neutralInDaylight: true,
    noFallDamage: true,
    // 1.8.9 普通难度下咬一口中毒 7 秒
    poisonTicks: 140,
  },
  spider: {
    type: 'spider',
    label: '蜘蛛',
    width: 1.4,
    height: 0.9,
    maxHealth: 16,
    speed: 3,
    hostile: true,
    attackDamage: 2,
    drops: [
      { item: 'string', min: 0, max: 2 },
      { item: 'spider_eye', min: 1, max: 1, chance: 1 / 3 },
    ],
    xp: 5,
    burnsInSunlight: false,
    neutralInDaylight: true,
    noFallDamage: true,
  },
  pig: {
    type: 'pig',
    label: '猪',
    width: 0.9,
    height: 0.9,
    maxHealth: 10,
    speed: 1.6,
    hostile: false,
    attackDamage: 0,
    drops: [{ item: 'porkchop', min: 1, max: 3 }],
    xp: 2,
    burnsInSunlight: false,
    // 原版猪吃胡萝卜 / 土豆 / 甜菜根，这些作物还没做，暂时也吃小麦
    breedingItems: ['wheat'],
  },
  cow: {
    type: 'cow',
    label: '牛',
    width: 0.9,
    height: 1.4,
    maxHealth: 10,
    speed: 1.6,
    hostile: false,
    attackDamage: 0,
    drops: [
      { item: 'beef', min: 1, max: 3 },
      { item: 'leather', min: 0, max: 2 },
    ],
    xp: 2,
    burnsInSunlight: false,
    breedingItems: ['wheat'],
  },
  sheep: {
    type: 'sheep',
    label: '羊',
    width: 0.9,
    height: 1.3,
    maxHealth: 8,
    speed: 1.6,
    hostile: false,
    attackDamage: 0,
    drops: [
      { item: 'mutton', min: 1, max: 2 },
      { item: 'wool', min: 1, max: 1 },
    ],
    xp: 2,
    burnsInSunlight: false,
    breedingItems: ['wheat'],
  },
  chicken: {
    type: 'chicken',
    label: '鸡',
    width: 0.4,
    height: 0.7,
    maxHealth: 4,
    speed: 1.6,
    hostile: false,
    attackDamage: 0,
    drops: [
      { item: 'chicken', min: 1, max: 1 },
      { item: 'feather', min: 0, max: 2 },
    ],
    xp: 2,
    burnsInSunlight: false,
    noFallDamage: true,
    breedingItems: ['wheat_seeds'],
  },
  enderman: {
    type: 'enderman',
    label: '末影人',
    width: 0.6,
    height: 2.9,
    maxHealth: 40,
    speed: 3.2,
    hostile: true,
    attackDamage: 7,
    drops: [{ item: 'ender_pearl', min: 0, max: 1 }],
    xp: 5,
    burnsInSunlight: false,
    // 原版是"被盯着看才发怒"，视线判定还没做，先按夜里主动敌对处理
    neutralInDaylight: true,
    teleports: true,
  },
  squid: {
    type: 'squid',
    label: '鱿鱼',
    width: 0.8,
    height: 0.8,
    maxHealth: 10,
    speed: 1.2,
    hostile: false,
    attackDamage: 0,
    drops: [{ item: 'ink_sac', min: 1, max: 3 }],
    xp: 2,
    burnsInSunlight: false,
    aquatic: true,
    noFallDamage: true,
  },
  bat: {
    type: 'bat',
    label: '蝙蝠',
    width: 0.5,
    height: 0.9,
    maxHealth: 6,
    speed: 2.4,
    hostile: false,
    attackDamage: 0,
    drops: [],
    xp: 0,
    burnsInSunlight: false,
    flying: true,
    noFallDamage: true,
  },
  zombie_pigman: {
    type: 'zombie_pigman',
    label: '僵尸猪人',
    width: 0.6,
    height: 1.95,
    maxHealth: 20,
    speed: 2.3,
    hostile: true,
    neutral: true,
    attackDamage: 5,
    drops: [
      { item: 'rotten_flesh', min: 0, max: 1 },
      { item: 'gold_nugget', min: 0, max: 1 },
      // 原版猪人手持金剑，死时按 8.5% 掉出来
      { item: 'golden_sword', min: 1, max: 1, chance: PIGMAN_SWORD_DROP_CHANCE },
    ],
    xp: 5,
    burnsInSunlight: false,
    fireImmune: true,
    dimensions: ['nether'],
  },
  ghast: {
    type: 'ghast',
    label: '恶魂',
    width: 4,
    height: 4,
    maxHealth: 10,
    speed: 1.6,
    hostile: true,
    attackDamage: 0,
    ranged: 'fireball',
    drops: [
      { item: 'gunpowder', min: 0, max: 2 },
      { item: 'ghast_tear', min: 0, max: 1 },
    ],
    xp: 5,
    burnsInSunlight: false,
    flying: true,
    noFallDamage: true,
    fireImmune: true,
    dimensions: ['nether'],
  },
  blaze: {
    type: 'blaze',
    label: '烈焰人',
    width: 0.6,
    height: 1.8,
    maxHealth: 20,
    speed: 1.8,
    hostile: true,
    attackDamage: 6,
    ranged: 'small_fireball',
    igniteTicks: 100,
    drops: [{ item: 'blaze_rod', min: 0, max: 1 }],
    xp: 10,
    burnsInSunlight: false,
    flying: true,
    noFallDamage: true,
    fireImmune: true,
    dimensions: ['nether'],
  },
  magma_cube: {
    type: 'magma_cube',
    label: '岩浆怪',
    width: 1.0,
    height: 1.0,
    maxHealth: 16,
    speed: 1.6,
    hostile: true,
    attackDamage: 4,
    drops: [{ item: 'magma_cream', min: 0, max: 1 }],
    xp: 4,
    burnsInSunlight: false,
    splits: true,
    fireImmune: true,
    dimensions: ['nether'],
  },
  wither_skeleton: {
    type: 'wither_skeleton',
    label: '凋灵骷髅',
    width: 0.7,
    height: 2.4,
    maxHealth: 20,
    speed: 2.4,
    hostile: true,
    attackDamage: 5,
    witherTicks: 200,
    drops: [
      { item: 'coal', min: 0, max: 1 },
      { item: 'bone', min: 0, max: 2 },
      { item: 'wither_skeleton_skull', min: 1, max: 1, chance: 0.025 },
    ],
    xp: 5,
    burnsInSunlight: false,
    fireImmune: true,
    dimensions: ['nether'],
  },
  slime: {
    type: 'slime',
    label: '史莱姆',
    width: 1.0,
    height: 1.0,
    maxHealth: 16,
    speed: 1.4,
    hostile: true,
    attackDamage: 2,
    drops: [{ item: 'slimeball', min: 0, max: 2 }],
    xp: 4,
    burnsInSunlight: false,
    splits: true,
  },
};

/** 判断字符串是否为生物类型。 */
export function isMobType(type: string): type is MobType {
  return type in MOB_DEFS;
}
