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
    drops: [{ item: 'string', min: 0, max: 2 }],
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
  },
};

/** 判断字符串是否为生物类型。 */
export function isMobType(type: string): type is MobType {
  return type in MOB_DEFS;
}
