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
}

export const MOB_DEFS: Record<MobType, MobDef> = {
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
