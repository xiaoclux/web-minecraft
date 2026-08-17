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
/** 村民：褐色长袍 + 大鼻子（N 是鼻子的肤色块）。 */
const VILLAGER_SKIN = '#c69b7b';
const VILLAGER_ROBE = '#8a6a45';
const VILLAGER_FACE = ['........', '........', '.KK..KK.', '.KK..KK.', '..NNNN..', '..NNNN..', '...NN...', '........'];
const CREEPER_GREEN = '#4f9c3a';
const CREEPER_FACE = ['........', '.KK..KK.', '.KK..KK.', '...KK...', '..KKKK..', '..KKKK..', '..K..K..', '........'];

function humanoid(
  skin: string,
  shirt: string,
  pants: string,
  face: string[],
  armAnim: PartAnim,
  limbWidth = 4,
  facePalette: Record<string, string> = { K: '#101010' },
): MobModelSpec {
  const armOffset = 4 + limbWidth / 2;
  return {
    swingAmplitude: 0.7,
    parts: [
      HUMANOID_HEAD(skin, face, facePalette),
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
const ENDERMAN_BLACK = '#161320';
const ENDERMAN_FACE = ['........', '........', '........', '.MM..MM.', '.MM..MM.', '........', '........', '........'];
const SQUID_BLUE = '#2b5a8a';
const BAT_BROWN = '#4a3a2a';
const SLIME_GREEN = '#63c063';

/** 鱿鱼：一个大身子 + 一圈短触手。 */
const SQUID_MODEL: MobModelSpec = {
  swingAmplitude: 0.4,
  parts: [
    { name: 'body', size: [10, 10, 10], pivot: [0, 5, 0], offset: [0, 0, 0], color: SQUID_BLUE, anim: PartAnim.NONE },
    ...[
      [-3, -3],
      [3, -3],
      [-3, 3],
      [3, 3],
    ].map(([dx, dz], i) => ({
      name: `tentacle${i}`,
      size: [2, 8, 2] as [number, number, number],
      pivot: [dx, 0, dz] as [number, number, number],
      offset: [0, 0, 0] as [number, number, number],
      color: SQUID_BLUE,
      anim: i % 2 === 0 ? PartAnim.LEG_L : PartAnim.LEG_R,
    })),
  ],
};

/** 蝙蝠：小身子 + 两只扇动的翅膀。 */
const BAT_MODEL: MobModelSpec = {
  swingAmplitude: 0.9,
  parts: [
    { name: 'body', size: [5, 6, 4], pivot: [0, 6, 0], offset: [0, 0, 0], color: BAT_BROWN, anim: PartAnim.NONE },
    {
      name: 'head',
      size: [4, 4, 4],
      pivot: [0, 10, 0],
      offset: [0, 1, 0],
      color: BAT_BROWN,
      anim: PartAnim.HEAD,
    },
    { name: 'wingL', size: [8, 6, 1], pivot: [3, 8, 0], offset: [4, 0, 0], color: BAT_BROWN, anim: PartAnim.WING },
    { name: 'wingR', size: [8, 6, 1], pivot: [-3, 8, 0], offset: [-4, 0, 0], color: BAT_BROWN, anim: PartAnim.WING },
  ],
};

/** 史莱姆：一个半透明感的绿方块 + 里面的小核。 */
const SLIME_MODEL: MobModelSpec = {
  swingAmplitude: 0.2,
  parts: [
    {
      name: 'body',
      size: [14, 14, 14],
      pivot: [0, 7, 0],
      offset: [0, 0, 0],
      color: SLIME_GREEN,
      anim: PartAnim.NONE,
      noise: 0.12,
    },
    {
      name: 'core',
      size: [6, 6, 6],
      pivot: [0, 7, 0],
      offset: [0, 0, 0],
      color: '#4a9c4a',
      anim: PartAnim.NONE,
    },
  ],
};

const PIGMAN_SKIN = '#ea9393';
const PIGMAN_SHIRT = '#3f9c9c';
const PIGMAN_PANTS = '#3c3f8f';
const WITHER_BONE = '#3b3b3b';
const BLAZE_YELLOW = '#f6b201';
const BLAZE_CORE = '#fff87e';
const GHAST_WHITE = '#dedede';
const GHAST_FACE = ['........', '..KK.KK.', '..KK.KK.', '........', '.KKKKKK.', 'K......K', '........', '........'];
const MAGMA_DARK = '#341b16';
const MAGMA_HOT = '#f66d1f';

/** 恶魂：一个大白方块 + 九条垂下的触手。 */
const GHAST_MODEL: MobModelSpec = {
  swingAmplitude: 0.2,
  parts: [
    {
      name: 'body',
      size: [16, 16, 16],
      pivot: [0, 40, 0],
      offset: [0, 0, 0],
      color: GHAST_WHITE,
      face: GHAST_FACE,
      facePalette: { K: '#1b1b1b' },
      anim: PartAnim.NONE,
      noise: 0.05,
    },
    ...[
      [-5, -5],
      [0, -5],
      [5, -5],
      [-5, 0],
      [0, 0],
      [5, 0],
      [-5, 5],
      [0, 5],
      [5, 5],
    ].map(([tx, tz], i) => ({
      name: `tentacle${i}`,
      size: [2, 10, 2] as [number, number, number],
      pivot: [tx, 32, tz] as [number, number, number],
      offset: [0, -5, 0] as [number, number, number],
      color: GHAST_WHITE,
      anim: i % 2 === 0 ? PartAnim.LEG_L : PartAnim.LEG_R,
    })),
  ],
};

/** 烈焰人：核心 + 一圈旋转的焰条。 */
const BLAZE_MODEL: MobModelSpec = {
  swingAmplitude: 1.2,
  parts: [
    {
      name: 'head',
      size: [8, 8, 8],
      pivot: [0, 22, 0],
      offset: [0, 0, 0],
      color: BLAZE_YELLOW,
      face: ['........', '.KK..KK.', '.KK..KK.', '........', '..KKKK..', '........', '........', '........'],
      facePalette: { K: '#5a2f00' },
      anim: PartAnim.HEAD,
    },
    {
      name: 'core',
      size: [5, 10, 5],
      pivot: [0, 12, 0],
      offset: [0, 0, 0],
      color: BLAZE_CORE,
      anim: PartAnim.NONE,
    },
    ...[
      [5, 0],
      [-5, 0],
      [0, 5],
      [0, -5],
    ].map(([rx, rz], i) => ({
      name: `rod${i}`,
      size: [2, 8, 2] as [number, number, number],
      pivot: [rx, 12, rz] as [number, number, number],
      offset: [0, 0, 0] as [number, number, number],
      color: BLAZE_YELLOW,
      anim: i % 2 === 0 ? PartAnim.ARM_L : PartAnim.ARM_R,
    })),
  ],
};

/** 岩浆怪：外层暗壳 + 内层熔岩核。 */
const MAGMA_CUBE_MODEL: MobModelSpec = {
  swingAmplitude: 0.3,
  parts: [
    {
      name: 'body',
      size: [12, 12, 12],
      pivot: [0, 6, 0],
      offset: [0, 0, 0],
      color: MAGMA_DARK,
      anim: PartAnim.NONE,
      noise: 0.18,
    },
    {
      name: 'core',
      size: [8, 8, 8],
      pivot: [0, 6, 0],
      offset: [0, 0, 0],
      color: MAGMA_HOT,
      anim: PartAnim.NONE,
      noise: 0.1,
    },
  ],
};

export const MOB_MODELS: Record<MobType, MobModelSpec> = {
  zombie_pigman: humanoid(PIGMAN_SKIN, PIGMAN_SHIRT, PIGMAN_PANTS, ZOMBIE_FACE, PartAnim.ZOMBIE_ARM),
  wither_skeleton: humanoid(WITHER_BONE, '#2a2a2a', WITHER_BONE, SKELETON_FACE, PartAnim.ZOMBIE_ARM, 2),
  ghast: GHAST_MODEL,
  blaze: BLAZE_MODEL,
  magma_cube: MAGMA_CUBE_MODEL,
  enderman: humanoid(ENDERMAN_BLACK, ENDERMAN_BLACK, ENDERMAN_BLACK, ENDERMAN_FACE, PartAnim.ARM_L, 2, {
    M: '#c77ffb',
  }),
  squid: SQUID_MODEL,
  bat: BAT_MODEL,
  slime: SLIME_MODEL,
  villager: humanoid(VILLAGER_SKIN, VILLAGER_ROBE, VILLAGER_ROBE, VILLAGER_FACE, PartAnim.ARM_L, 4, {
    K: '#101010',
    N: '#a97b5c',
  }),
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
  cave_spider: SPIDER_MODEL,
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
