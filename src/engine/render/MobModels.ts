import type { MobType } from '../entities/MobDefs';

/** 部件动画类型。 */
export const PartAnim = {
  NONE: 'none',
  LEG_L: 'legL',
  LEG_R: 'legR',
  ARM_L: 'armL',
  ARM_R: 'armR',
  ZOMBIE_ARM: 'zombieArm',
  HEAD: 'head',
  WING: 'wing',
} as const;
export type PartAnim = (typeof PartAnim)[keyof typeof PartAnim];

/** 一个盒子部件（单位：像素，1 px = 1/16 格；坐标以脚底中心为原点，y 向上，-z 为正面）。 */
export interface PartSpec {
  name: string;
  /** 宽高深。 */
  size: [number, number, number];
  /** 旋转轴心（世界像素坐标）。 */
  pivot: [number, number, number];
  /** 盒子中心相对轴心的偏移。 */
  offset: [number, number, number];
  color: string;
  /** 正面（-z）字符画。 */
  face?: string[];
  facePalette?: Record<string, string>;
  anim: PartAnim;
  /** 噪声强度。 */
  noise?: number;
}

/** 生物模型。 */
export interface MobModelSpec {
  parts: PartSpec[];
  /** 腿摆动幅度（弧度）。 */
  swingAmplitude: number;
}

const HUMANOID_HEAD = (color: string, face: string[], facePalette: Record<string, string>): PartSpec => ({
  name: 'head',
  size: [8, 8, 8],
  pivot: [0, 24, 0],
  offset: [0, 4, 0],
  color,
  face,
  facePalette,
  anim: PartAnim.HEAD,
});

const ZOMBIE_SKIN = '#5a8f4a';
const ZOMBIE_SHIRT = '#3f9c9c';
const ZOMBIE_PANTS = '#3c3f8f';
const ZOMBIE_FACE = ['........', '........', '.KK..KK.', '.KK..KK.', '........', '...KK...', '...KK...', '........'];
const SKELETON_BONE = '#c8c8c8';
const SKELETON_FACE = ['........', '........', '.KK..KK.', '.KK..KK.', '........', '..K..K..', '...KK...', '........'];
const CREEPER_GREEN = '#4f9c3a';
const CREEPER_FACE = ['........', '.KK..KK.', '.KK..KK.', '...KK...', '..KKKK..', '..KKKK..', '..K..K..', '........'];

function humanoid(
  skin: string,
  shirt: string,
  pants: string,
  face: string[],
  armAnim: PartAnim,
  limbWidth = 4,
): MobModelSpec {
  const armOffset = 4 + limbWidth / 2;
  return {
    swingAmplitude: 0.7,
    parts: [
      HUMANOID_HEAD(skin, face, { K: '#101010' }),
      { name: 'body', size: [8, 12, 4], pivot: [0, 24, 0], offset: [0, -6, 0], color: shirt, anim: PartAnim.NONE },
      {
        name: 'armR',
        size: [limbWidth, 12, limbWidth],
        pivot: [-armOffset, 22, 0],
        offset: [0, -4, 0],
        color: skin,
        anim: armAnim,
      },
      {
        name: 'armL',
        size: [limbWidth, 12, limbWidth],
        pivot: [armOffset, 22, 0],
        offset: [0, -4, 0],
        color: skin,
        anim: armAnim === PartAnim.ZOMBIE_ARM ? PartAnim.ZOMBIE_ARM : PartAnim.ARM_L,
      },
      {
        name: 'legR',
        size: [limbWidth, 12, limbWidth],
        pivot: [-2, 12, 0],
        offset: [0, -6, 0],
        color: pants,
        anim: PartAnim.LEG_R,
      },
      {
        name: 'legL',
        size: [limbWidth, 12, limbWidth],
        pivot: [2, 12, 0],
        offset: [0, -6, 0],
        color: pants,
        anim: PartAnim.LEG_L,
      },
    ],
  };
}

function quadruped(
  body: [number, number, number],
  bodyY: number,
  legHeight: number,
  legWidth: number,
  bodyColor: string,
  legColor: string,
  head: {
    size: [number, number, number];
    y: number;
    color: string;
    face?: string[];
    facePalette?: Record<string, string>;
  },
  extra: PartSpec[] = [],
): MobModelSpec {
  const [bw, bh, bd] = body;
  const legX = bw / 2 - legWidth / 2;
  const legZ = bd / 2 - legWidth / 2;
  return {
    swingAmplitude: 0.8,
    parts: [
      { name: 'body', size: body, pivot: [0, bodyY, 0], offset: [0, bh / 2, 0], color: bodyColor, anim: PartAnim.NONE },
      {
        name: 'head',
        size: head.size,
        pivot: [0, head.y, -bd / 2],
        offset: [0, head.size[1] / 2 - 2, -head.size[2] / 2],
        color: head.color,
        face: head.face,
        facePalette: head.facePalette,
        anim: PartAnim.HEAD,
      },
      {
        name: 'legFR',
        size: [legWidth, legHeight, legWidth],
        pivot: [-legX, legHeight, -legZ],
        offset: [0, -legHeight / 2, 0],
        color: legColor,
        anim: PartAnim.LEG_R,
      },
      {
        name: 'legFL',
        size: [legWidth, legHeight, legWidth],
        pivot: [legX, legHeight, -legZ],
        offset: [0, -legHeight / 2, 0],
        color: legColor,
        anim: PartAnim.LEG_L,
      },
      {
        name: 'legBR',
        size: [legWidth, legHeight, legWidth],
        pivot: [-legX, legHeight, legZ],
        offset: [0, -legHeight / 2, 0],
        color: legColor,
        anim: PartAnim.LEG_L,
      },
      {
        name: 'legBL',
        size: [legWidth, legHeight, legWidth],
        pivot: [legX, legHeight, legZ],
        offset: [0, -legHeight / 2, 0],
        color: legColor,
        anim: PartAnim.LEG_R,
      },
      ...extra,
    ],
  };
}

const PIG_FACE = ['........', '........', 'K......K', '........', '..PPPP..', '..PKPK..', '..PPPP..', '........'];
const COW_FACE = ['........', '.K....K.', '........', '........', '........', '..LLLL..', '..LKKL..', '..LLLL..'];
const SHEEP_FACE = ['......', '.K..K.', '......', '......', '......', '......'];
const CHICKEN_FACE = ['....', 'K..K', '.OO.', '.OO.', '.RR.', '....'];

const SPIDER_MODEL: MobModelSpec = {
  swingAmplitude: 0.5,
  parts: [
    {
      name: 'head',
      size: [8, 8, 8],
      pivot: [0, 4, -8],
      offset: [0, 0, 0],
      color: '#2a2020',
      face: ['........', '.RR..RR.', '.RR..RR.', '..R..R..', '........', '........', '........', '........'],
      facePalette: { R: '#c8102e' },
      anim: PartAnim.NONE,
    },
    { name: 'thorax', size: [6, 6, 6], pivot: [0, 4, -1], offset: [0, 0, 0], color: '#2a2020', anim: PartAnim.NONE },
    { name: 'abdomen', size: [10, 8, 12], pivot: [0, 4, 8], offset: [0, 0, 0], color: '#302424', anim: PartAnim.NONE },
    ...[-1, 1].flatMap((side) =>
      [-4, -1, 2, 5].map((z, i): PartSpec => ({
        name: `leg${side}${i}`,
        size: [16, 2, 2],
        pivot: [side * 3, 5, z],
        offset: [side * 8, 0, 0],
        color: '#2a2020',
        anim: i % 2 === 0 ? PartAnim.LEG_L : PartAnim.LEG_R,
      })),
    ),
  ],
};

const CHICKEN_MODEL: MobModelSpec = {
  swingAmplitude: 1,
  parts: [
    { name: 'body', size: [6, 6, 8], pivot: [0, 5, 0], offset: [0, 3, 0], color: '#f0f0f0', anim: PartAnim.NONE },
    {
      name: 'head',
      size: [4, 6, 3],
      pivot: [0, 11, -4],
      offset: [0, 1, -1],
      color: '#f0f0f0',
      face: CHICKEN_FACE,
      facePalette: { K: '#101010', O: '#e08a1e', R: '#c8102e' },
      anim: PartAnim.HEAD,
    },
    { name: 'legR', size: [1, 5, 3], pivot: [-2, 5, 1], offset: [0, -2.5, 0], color: '#e08a1e', anim: PartAnim.LEG_R },
    { name: 'legL', size: [1, 5, 3], pivot: [2, 5, 1], offset: [0, -2.5, 0], color: '#e08a1e', anim: PartAnim.LEG_L },
    { name: 'wingR', size: [1, 4, 6], pivot: [-3.5, 11, 0], offset: [0, -2, 0], color: '#e0e0e0', anim: PartAnim.WING },
    { name: 'wingL', size: [1, 4, 6], pivot: [3.5, 11, 0], offset: [0, -2, 0], color: '#e0e0e0', anim: PartAnim.WING },
  ],
};

/** 各生物模型。 */
export const MOB_MODELS: Record<MobType, MobModelSpec> = {
  zombie: humanoid(ZOMBIE_SKIN, ZOMBIE_SHIRT, ZOMBIE_PANTS, ZOMBIE_FACE, PartAnim.ZOMBIE_ARM),
  skeleton: humanoid(SKELETON_BONE, '#a8a8a8', SKELETON_BONE, SKELETON_FACE, PartAnim.ZOMBIE_ARM, 2),
  creeper: {
    swingAmplitude: 0.6,
    parts: [
      {
        name: 'head',
        size: [8, 8, 8],
        pivot: [0, 18, 0],
        offset: [0, 4, 0],
        color: CREEPER_GREEN,
        face: CREEPER_FACE,
        facePalette: { K: '#101010' },
        anim: PartAnim.HEAD,
        noise: 0.18,
      },
      {
        name: 'body',
        size: [8, 12, 4],
        pivot: [0, 18, 0],
        offset: [0, -6, 0],
        color: CREEPER_GREEN,
        anim: PartAnim.NONE,
        noise: 0.18,
      },
      {
        name: 'legFR',
        size: [4, 6, 4],
        pivot: [-2, 6, -2],
        offset: [0, -3, 0],
        color: CREEPER_GREEN,
        anim: PartAnim.LEG_R,
        noise: 0.18,
      },
      {
        name: 'legFL',
        size: [4, 6, 4],
        pivot: [2, 6, -2],
        offset: [0, -3, 0],
        color: CREEPER_GREEN,
        anim: PartAnim.LEG_L,
        noise: 0.18,
      },
      {
        name: 'legBR',
        size: [4, 6, 4],
        pivot: [-2, 6, 2],
        offset: [0, -3, 0],
        color: CREEPER_GREEN,
        anim: PartAnim.LEG_L,
        noise: 0.18,
      },
      {
        name: 'legBL',
        size: [4, 6, 4],
        pivot: [2, 6, 2],
        offset: [0, -3, 0],
        color: CREEPER_GREEN,
        anim: PartAnim.LEG_R,
        noise: 0.18,
      },
    ],
  },
  spider: SPIDER_MODEL,
  pig: quadruped([10, 8, 16], 6, 6, 4, '#f0a0a0', '#f0a0a0', {
    size: [8, 8, 8],
    y: 8,
    color: '#f0a0a0',
    face: PIG_FACE,
    facePalette: { K: '#101010', P: '#e07070' },
  }),
  cow: quadruped([12, 10, 18], 10, 12, 4, '#4a3020', '#4a3020', {
    size: [8, 8, 6],
    y: 12,
    color: '#4a3020',
    face: COW_FACE,
    facePalette: { K: '#101010', L: '#e8d8c8' },
  }),
  sheep: quadruped([10, 8, 16], 8, 12, 4, '#ececec', '#c8c8c8', {
    size: [6, 6, 8],
    y: 12,
    color: '#d8d0c8',
    face: SHEEP_FACE,
    facePalette: { K: '#101010' },
  }),
  chicken: CHICKEN_MODEL,
};
