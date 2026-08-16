import { PixelCanvas, TEXTURE_SIZE, createRng, hashString, hex, shade, type Rgba } from './PixelCanvas';

type Painter = (c: PixelCanvas, rng: () => number) => void;

const STONE = hex('#7f7f7f');
const DIRT = hex('#866043');
const GRASS = hex('#5d9c3a');
const SAND = hex('#dbd3a0');
const GRAVEL = hex('#84807b');
const WOOD = hex('#9c7f4e');
const BARK = hex('#6b5231');
const LEAF = hex('#3d7a24');
const WATER = hex('#3f60d6b4');
const BEDROCK = hex('#555555');
const OBSIDIAN = hex('#14121f');
const SNOW = hex('#f4fbfb');
const GLOW = hex('#c9a054');
const TRANSPARENT: Rgba = [0, 0, 0, 0];

function noiseBase(base: Rgba, variance = 0.08): Painter {
  return (c, rng) => c.noise(base, variance, rng);
}

/** 石头基底 + 彩色矿点。 */
function ore(color: Rgba, spots = 8): Painter {
  return (c, rng) => {
    c.noise(STONE, 0.08, rng);
    const dark = shade(color, 0.7);
    for (let i = 0; i < spots; i++) {
      const x = Math.floor(rng() * 14);
      const y = Math.floor(rng() * 14);
      c.set(x, y, color);
      c.set(x + 1, y, color);
      c.set(x, y + 1, dark);
      c.set(x + 1, y + 1, color);
    }
  };
}

function cobble(base: Rgba, mossy = false): Painter {
  return (c, rng) => {
    c.noise(shade(base, 0.85), 0.1, rng);
    const stones: [number, number, number, number][] = [
      [0, 0, 5, 4],
      [6, 0, 5, 3],
      [12, 0, 4, 5],
      [0, 5, 4, 5],
      [5, 4, 6, 5],
      [12, 6, 4, 4],
      [0, 11, 6, 5],
      [7, 10, 4, 6],
      [12, 11, 4, 5],
    ];
    for (const [x, y, w, h] of stones) {
      const light = shade(base, 1.0 + rng() * 0.3);
      c.rect(x, y, w - 1, h - 1, light);
    }
    if (mossy) {
      const moss = hex('#5f7c3b');
      c.speckle(moss, 60, rng);
    }
  };
}

function planksOf(color: Rgba): Painter {
  return (c, rng) => {
    c.noise(color, 0.06, rng);
    const line = shade(color, 0.55);
    for (const y of [3, 7, 11, 15]) {
      c.rect(0, y, 16, 1, line);
    }
    c.rect(4, 0, 1, 3, line);
    c.rect(12, 4, 1, 3, line);
    c.rect(7, 8, 1, 3, line);
    c.rect(2, 12, 1, 3, line);
  };
}
const planks: Painter = planksOf(WOOD);

const grassTop: Painter = (c, rng) => {
  c.noise(GRASS, 0.12, rng);
};

const grassSide: Painter = (c, rng) => {
  c.noise(DIRT, 0.1, rng);
  for (let x = 0; x < 16; x++) {
    const depth = 2 + Math.floor(rng() * 3);
    for (let y = 0; y < depth; y++) {
      c.set(x, y, shade(GRASS, 0.9 + rng() * 0.2));
    }
  }
};

function logSideOf(bark: Rgba): Painter {
  return (c, rng) => {
    c.noise(bark, 0.1, rng);
    const dark = shade(bark, 0.6);
    for (let x = 1; x < 16; x += 4) {
      for (let y = 0; y < 16; y++) {
        if (rng() > 0.3) {
          c.set(x, y, dark);
        }
      }
    }
  };
}
const logSide: Painter = logSideOf(BARK);

function logTopOf(bark: Rgba, wood: Rgba): Painter {
  return (c, rng) => {
    c.noise(bark, 0.08, rng);
    const inner = shade(wood, 1.05);
    c.rect(2, 2, 12, 12, inner);
    const ring = shade(wood, 0.75);
    c.rect(4, 4, 8, 8, ring);
    c.rect(5, 5, 6, 6, inner);
    c.rect(7, 7, 2, 2, ring);
  };
}
const logTop: Painter = logTopOf(BARK, WOOD);

function leavesOf(color: Rgba): Painter {
  return (c, rng) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const r = rng();
        if (r < 0.18) {
          c.set(x, y, TRANSPARENT);
        } else {
          c.set(x, y, shade(color, 0.7 + r * 0.6));
        }
      }
    }
  };
}
const leaves: Painter = leavesOf(LEAF);

const glass: Painter = (c) => {
  c.fill(TRANSPARENT);
  const frame = hex('#e6f2f5cc');
  const glare = hex('#ffffff88');
  c.rect(0, 0, 16, 1, frame);
  c.rect(0, 15, 16, 1, frame);
  c.rect(0, 0, 1, 16, frame);
  c.rect(15, 0, 1, 16, frame);
  c.rect(2, 2, 1, 4, glare);
  c.rect(3, 2, 2, 1, glare);
  c.rect(12, 9, 1, 4, glare);
};

const water: Painter = (c, rng) => {
  c.noise(WATER, 0.06, rng);
};

const bedrock: Painter = (c, rng) => {
  c.noise(BEDROCK, 0.35, rng);
};

const sandstoneSide: Painter = (c, rng) => {
  c.noise(SAND, 0.05, rng);
  const line = shade(SAND, 0.8);
  c.rect(0, 0, 16, 1, line);
  c.rect(0, 15, 16, 1, line);
  c.rect(0, 5, 16, 1, line);
  c.rect(0, 10, 16, 1, line);
};

const bricks: Painter = (c, rng) => {
  const brick = hex('#9b5b47');
  const mortar = hex('#b8b0a5');
  c.noise(mortar, 0.05, rng);
  for (let row = 0; row < 4; row++) {
    const y = row * 4;
    const offset = row % 2 === 0 ? 0 : 4;
    for (let bx = -1; bx < 3; bx++) {
      const x = bx * 8 + offset;
      c.rect(x + 1, y + 1, 7, 3, shade(brick, 0.9 + rng() * 0.2));
    }
  }
};

const stoneBricks: Painter = (c, rng) => {
  const mortar = shade(STONE, 0.6);
  c.noise(mortar, 0.05, rng);
  for (let row = 0; row < 2; row++) {
    const y = row * 8;
    const offset = row === 0 ? 0 : 8;
    for (let bx = -1; bx < 2; bx++) {
      const x = bx * 16 + offset;
      c.rect(x + 1, y + 1, 7, 7, shade(STONE, 0.9 + rng() * 0.15));
      c.rect(x + 9, y + 1, 7, 7, shade(STONE, 0.9 + rng() * 0.15));
    }
  }
};

const tnt =
  (variant: 'top' | 'side' | 'bottom'): Painter =>
  (c, rng) => {
    const red = hex('#d0362c');
    const white = hex('#e0dcd0');
    if (variant === 'top') {
      c.noise(shade(red, 0.9), 0.05, rng);
      c.rect(4, 4, 8, 8, white);
      c.rect(6, 6, 4, 4, shade(red, 0.7));
      return;
    }
    if (variant === 'bottom') {
      c.noise(shade(red, 0.9), 0.05, rng);
      return;
    }
    c.noise(red, 0.05, rng);
    c.rect(0, 5, 16, 6, white);
    const letters = ['XX.X.XXX', 'X..XX.X.', 'X..X.X.X'];
    c.draw(letters, { X: hex('#222222') }, 4, 6);
  };

const bookshelf: Painter = (c, rng) => {
  planks(c, rng);
  const colors = [hex('#a83232'), hex('#3264a8'), hex('#3a9c3a'), hex('#c9a227'), hex('#7a3d9c')];
  for (const y0 of [1, 9]) {
    c.rect(0, y0, 16, 6, hex('#3a2a18'));
    let x = 1;
    while (x < 15) {
      const w = 1 + Math.floor(rng() * 2);
      const color = colors[Math.floor(rng() * colors.length)];
      c.rect(x, y0 + 1, w, 5, color);
      x += w + 1;
    }
  }
};

const obsidian: Painter = (c, rng) => {
  c.noise(OBSIDIAN, 0.5, rng);
  c.speckle(hex('#4a3d7a'), 20, rng);
};

const torch: Painter = (c) => {
  c.fill(TRANSPARENT);
  c.rect(7, 6, 2, 10, hex('#8f6b3a'));
  c.rect(7, 4, 2, 2, hex('#ffe15a'));
  c.rect(7, 3, 2, 1, hex('#ffb027'));
  c.rect(7, 2, 2, 1, hex('#ff7f27aa'));
};

const craftingTop: Painter = (c, rng) => {
  planks(c, rng);
  const dark = shade(WOOD, 0.5);
  c.rect(0, 0, 16, 1, dark);
  c.rect(0, 15, 16, 1, dark);
  c.rect(0, 0, 1, 16, dark);
  c.rect(15, 0, 1, 16, dark);
  c.rect(5, 0, 1, 16, dark);
  c.rect(10, 0, 1, 16, dark);
  c.rect(0, 5, 16, 1, dark);
  c.rect(0, 10, 16, 1, dark);
};

const craftingFront: Painter = (c, rng) => {
  planks(c, rng);
  c.rect(0, 0, 16, 1, shade(WOOD, 1.2));
  const tool = hex('#8a8a8a');
  const handle = hex('#5b4326');
  c.rect(3, 4, 4, 2, tool);
  c.rect(4, 6, 2, 6, handle);
  c.rect(10, 4, 3, 3, tool);
  c.rect(11, 7, 1, 5, handle);
};

const craftingSide: Painter = (c, rng) => {
  planks(c, rng);
  c.rect(0, 0, 16, 1, shade(WOOD, 1.2));
  c.rect(4, 4, 8, 7, hex('#f0dfc0'));
  c.rect(5, 5, 6, 1, hex('#c8b090'));
  c.rect(5, 7, 6, 1, hex('#c8b090'));
  c.rect(5, 9, 6, 1, hex('#c8b090'));
};

const furnaceSide: Painter = (c, rng) => cobble(STONE)(c, rng);
const furnaceTop: Painter = (c, rng) => {
  cobble(STONE)(c, rng);
  c.darken(0.85);
};
const furnaceFront: Painter = (c, rng) => {
  cobble(STONE)(c, rng);
  c.rect(4, 6, 8, 5, hex('#222222'));
  c.rect(4, 12, 8, 3, hex('#222222'));
  c.rect(5, 7, 6, 3, hex('#ff8f1f'));
  c.rect(6, 8, 4, 2, hex('#ffd24a'));
};

/** 箱子：木板底 + 深色包边、金属锁扣。 */
const CHEST_WOOD = hex('#a3762f');
const CHEST_EDGE = hex('#5d4218');
const CHEST_LATCH = hex('#4c4c4c');

const chestBase: Painter = (c, rng) => {
  c.noise(CHEST_WOOD, 0.08, rng);
  c.rect(0, 0, 16, 1, CHEST_EDGE);
  c.rect(0, 15, 16, 1, CHEST_EDGE);
  c.rect(0, 0, 1, 16, CHEST_EDGE);
  c.rect(15, 0, 1, 16, CHEST_EDGE);
};

const chestTop: Painter = (c, rng) => {
  chestBase(c, rng);
  c.rect(0, 7, 16, 1, CHEST_EDGE);
};

const chestSide: Painter = (c, rng) => {
  chestBase(c, rng);
  // 上方是箱盖，与箱身之间留一道缝
  c.rect(0, 4, 16, 1, CHEST_EDGE);
};

const chestFront: Painter = (c, rng) => {
  chestSide(c, rng);
  c.rect(7, 3, 2, 4, CHEST_LATCH);
  c.rect(7, 4, 2, 1, shade(CHEST_LATCH, 1.6));
};

/** 床：红色被面 + 白枕头，侧面下沿是木头床架。 */
const BED_CLOTH = hex('#a02b2b');
const BED_PILLOW = hex('#e4e4e4');
const BED_FRAME = hex('#6b4c2a');

const bedFootTop: Painter = (c, rng) => {
  c.noise(BED_CLOTH, 0.06, rng);
};
const bedHeadTop: Painter = (c, rng) => {
  c.noise(BED_CLOTH, 0.06, rng);
  c.rect(2, 2, 12, 9, BED_PILLOW);
  c.rect(2, 2, 12, 1, shade(BED_PILLOW, 0.9));
};
const bedSideBase: Painter = (c, rng) => {
  c.noise(BED_CLOTH, 0.06, rng);
  c.rect(0, 13, 16, 3, BED_FRAME);
};
const bedFootSide: Painter = (c, rng) => bedSideBase(c, rng);
const bedHeadSide: Painter = (c, rng) => {
  bedSideBase(c, rng);
  c.rect(2, 2, 12, 5, BED_PILLOW);
};
const bedFootEnd: Painter = (c, rng) => {
  bedSideBase(c, rng);
  c.rect(0, 0, 16, 2, shade(BED_CLOTH, 0.8));
};
const bedHeadEnd: Painter = (c, rng) => {
  bedSideBase(c, rng);
  c.rect(1, 2, 14, 8, BED_PILLOW);
};

/** 不挂在任何方块上、但需要进图集的贴图（粒子等）。 */
export const EXTRA_TEXTURE_KEYS = ['particle_heart', 'particle_rain', 'particle_snow'] as const;

/** 火：底部亮、顶部窄的橙黄火苗，其余透明。 */
const fire: Painter = (c, rng) => {
  c.fill(TRANSPARENT);
  const outer = hex('#e05a12');
  const inner = hex('#ffc24a');
  for (let x = 0; x < 16; x++) {
    const h = 6 + Math.round(Math.abs(Math.sin((x + 1) * 1.7)) * 9);
    c.rect(x, 16 - h, 1, h, outer);
    if (h > 8) {
      c.rect(x, 16 - h + 4, 1, h - 4, inner);
    }
  }
  c.speckle(hex('#ffe9a8'), 12, rng, 8, 16);
};

/** 岩浆：橙红底 + 亮黄斑块。 */
const LAVA = hex('#d45a12');
const lava: Painter = (c, rng) => {
  c.noise(LAVA, 0.18, rng);
  c.speckle(hex('#ffc24a'), 26, rng);
  c.speckle(hex('#8a2b06'), 18, rng);
};

/** 爱心粒子：粒子系统只取 2×2 像素，所以纯色即可。 */
const particleHeart: Painter = (c, rng) => {
  c.noise(hex('#f04a6a'), 0.1, rng);
};

/** 雨滴与雪花粒子（同样只取 2×2 像素，纯色）。 */
const particleRain: Painter = (c, rng) => {
  c.noise(hex('#7ba7d8'), 0.12, rng);
};
const particleSnow: Painter = (c, rng) => {
  c.noise(hex('#f2f8ff'), 0.06, rng);
};

/** 梯子：两根立柱 + 若干横档，其余透明。 */
const LADDER_WOOD = hex('#8a6a3a');
const ladder: Painter = (c) => {
  c.fill(TRANSPARENT);
  c.rect(2, 0, 2, 16, LADDER_WOOD);
  c.rect(12, 0, 2, 16, LADDER_WOOD);
  for (const y of [1, 6, 11]) {
    c.rect(3, y, 10, 2, shade(LADDER_WOOD, 1.15));
  }
};

/** 木门：上半有窗格，下半是整块木板加合页。 */
const DOOR_WOOD = hex('#a5813f');
const DOOR_LINE = hex('#6a5024');
const DOOR_HINGE = hex('#4c4c4c');
const doorPanel: Painter = (c, rng) => {
  c.noise(DOOR_WOOD, 0.06, rng);
  c.rect(0, 0, 1, 16, DOOR_LINE);
  c.rect(15, 0, 1, 16, DOOR_LINE);
};
const doorLower: Painter = (c, rng) => {
  doorPanel(c, rng);
  c.rect(0, 15, 16, 1, DOOR_LINE);
  c.rect(1, 2, 2, 2, DOOR_HINGE);
  c.rect(12, 7, 2, 2, DOOR_HINGE);
};
const doorUpper: Painter = (c, rng) => {
  doorPanel(c, rng);
  c.rect(0, 0, 16, 1, DOOR_LINE);
  c.rect(3, 3, 10, 6, shade(DOOR_WOOD, 1.25));
  c.rect(7, 3, 2, 6, DOOR_LINE);
  c.rect(3, 5, 10, 2, DOOR_LINE);
  c.rect(1, 12, 2, 2, DOOR_HINGE);
};

/** 耕地：干湿两种顶面 + 泥土侧面；小麦按生长阶段从矮嫩到高黄。 */
const farmlandDry: Painter = (c, rng) => {
  c.noise(shade(DIRT, 0.95), 0.06, rng);
  for (const x of [3, 8, 13]) {
    c.rect(x, 0, 1, 16, shade(DIRT, 0.75));
  }
};
const farmlandWet: Painter = (c, rng) => {
  c.noise(shade(DIRT, 0.6), 0.05, rng);
  for (const x of [3, 8, 13]) {
    c.rect(x, 0, 1, 16, shade(DIRT, 0.45));
  }
};

const CROP_YOUNG = hex('#5f9b32');
/** 第 stage 阶段的作物：越大越高、颜色越接近成熟色。 */
function cropStage(stage: number, ripe: Rgba, headAtStage = 4): Painter {
  return (c) => {
    c.fill(TRANSPARENT);
    const t = stage / CROP_TEXTURE_STAGES;
    const height = 4 + Math.round(t * 11);
    const color = [
      Math.round(CROP_YOUNG[0] + (ripe[0] - CROP_YOUNG[0]) * t),
      Math.round(CROP_YOUNG[1] + (ripe[1] - CROP_YOUNG[1]) * t),
      Math.round(CROP_YOUNG[2] + (ripe[2] - CROP_YOUNG[2]) * t),
      255,
    ] as Rgba;
    for (const x of [2, 6, 10, 14]) {
      c.rect(x, 16 - height, 1, height, color);
      if (stage >= headAtStage) {
        c.rect(x - 1, 16 - height, 3, 2, shade(color, 1.15));
      }
    }
  };
}

/** 作物贴图的阶段数（0~7）。 */
const CROP_TEXTURE_STAGES = 7;
const WHEAT_RIPE = hex('#d8bb54');
const CARROT_RIPE = hex('#e07a1c');
const POTATO_RIPE = hex('#7fa83a');

/** 生成某种作物的 8 张阶段贴图。 */
function cropStageTextures(prefix: string, ripe: Rgba): Record<string, Painter> {
  const out: Record<string, Painter> = {};
  for (let stage = 0; stage <= CROP_TEXTURE_STAGES; stage++) {
    out[`${prefix}_stage_${stage}`] = cropStage(stage, ripe);
  }
  return out;
}

const glowstone: Painter = (c, rng) => {
  c.noise(GLOW, 0.2, rng);
  c.speckle(hex('#ffe9a8'), 40, rng);
};

const pumpkinSide: Painter = (c, rng) => {
  const orange = hex('#d0731c');
  c.noise(orange, 0.08, rng);
  const line = shade(orange, 0.75);
  for (const x of [3, 8, 13]) {
    c.rect(x, 0, 1, 16, line);
  }
};
const pumpkinTop: Painter = (c, rng) => {
  pumpkinSide(c, rng);
  c.rect(6, 6, 4, 4, hex('#5d8f2f'));
};
const pumpkinFace: Painter = (c, rng) => {
  pumpkinSide(c, rng);
  const black = hex('#1a1108');
  c.draw(['XX....XX', '.X....X.', '........', 'X.XXXX.X', 'XX.XX.XX'], { X: black }, 4, 4);
};

const melonSide: Painter = (c, rng) => {
  const green = hex('#7fbd2a');
  c.noise(green, 0.1, rng);
  const dark = shade(green, 0.65);
  for (const x of [2, 6, 10, 14]) {
    for (let y = 0; y < 16; y++) {
      if (rng() > 0.35) {
        c.set(x, y, dark);
      }
    }
  }
};

const crossPlant =
  (color: Rgba, flower?: Rgba): Painter =>
  (c, rng) => {
    c.fill(TRANSPARENT);
    const stalks = [3, 6, 8, 11, 13];
    for (const x of stalks) {
      const h = 6 + Math.floor(rng() * 8);
      for (let y = 16 - h; y < 16; y++) {
        c.set(x, y, shade(color, 0.8 + rng() * 0.4));
      }
      if (flower) {
        c.rect(x - 1, 16 - h - 1, 3, 2, flower);
      }
    }
  };

const dandelion: Painter = (c) => {
  c.fill(TRANSPARENT);
  c.rect(7, 8, 2, 8, hex('#3f7a22'));
  c.rect(6, 4, 4, 4, hex('#f6e33e'));
  c.rect(7, 3, 2, 6, hex('#f6e33e'));
  c.rect(5, 5, 6, 2, hex('#f6e33e'));
  c.set(9, 11, hex('#3f7a22'));
  c.set(10, 12, hex('#3f7a22'));
};

const poppy: Painter = (c) => {
  c.fill(TRANSPARENT);
  c.rect(7, 8, 2, 8, hex('#3f7a22'));
  c.rect(6, 4, 4, 4, hex('#d0342c'));
  c.rect(5, 5, 6, 2, hex('#d0342c'));
  c.rect(7, 5, 2, 2, hex('#2b1b1b'));
  c.set(5, 11, hex('#3f7a22'));
  c.set(4, 12, hex('#3f7a22'));
};

function saplingOf(color: Rgba): Painter {
  return (c) => {
    c.fill(TRANSPARENT);
    c.rect(7, 9, 2, 7, hex('#6b4a2a'));
    c.rect(4, 3, 8, 6, color);
    c.rect(5, 2, 6, 1, color);
    c.rect(6, 1, 4, 1, shade(color, 1.2));
  };
}
const sapling: Painter = saplingOf(hex('#3d7a24'));

const lapisOre: Painter = ore(hex('#2b4fbb'), 9);

/** 刷怪笼：黑色笼子里透出暗光的铁栅格。 */
const mobSpawner: Painter = (c, rng) => {
  c.noise(hex('#1b1b22'), 0.15, rng);
  const bar = hex('#4a4a55');
  for (let i = 0; i < 16; i += 4) {
    c.rect(i, 0, 1, 16, bar);
    c.rect(0, i, 16, 1, bar);
  }
};

/** 蜘蛛网：白色细丝，其余透明。 */
const cobweb: Painter = (c) => {
  c.fill(TRANSPARENT);
  const w = hex('#e8e8e8');
  c.rect(0, 8, 16, 1, w);
  c.rect(8, 0, 1, 16, w);
  for (let i = 0; i < 16; i++) {
    c.set(i, i, w);
    c.set(15 - i, i, w);
  }
  for (const r of [3, 6]) {
    c.rect(8 - r, 8 - r, r * 2, 1, w);
    c.rect(8 - r, 8 + r, r * 2, 1, w);
    c.rect(8 - r, 8 - r, 1, r * 2, w);
    c.rect(8 + r, 8 - r, 1, r * 2 + 1, w);
  }
};

/** 仙人掌：绿色底 + 竖刺；顶面是切面。 */
const CACTUS_GREEN = hex('#5b8f3a');
const cactusSide: Painter = (c, rng) => {
  c.noise(CACTUS_GREEN, 0.07, rng);
  const dark = shade(CACTUS_GREEN, 0.7);
  c.rect(0, 0, 1, 16, dark);
  c.rect(15, 0, 1, 16, dark);
  for (let y = 1; y < 16; y += 4) {
    c.rect(4, y, 1, 2, shade(CACTUS_GREEN, 1.3));
    c.rect(11, y + 2, 1, 2, shade(CACTUS_GREEN, 1.3));
  }
};
const cactusTop: Painter = (c, rng) => {
  c.noise(shade(CACTUS_GREEN, 1.15), 0.06, rng);
  c.rect(2, 2, 12, 12, shade(CACTUS_GREEN, 0.85));
};

/** 酿造台：深灰石底座 + 金色的杆（同一张贴图贴在底座与杆上）。 */
const brewingStand: Painter = (c, rng) => {
  c.noise(hex('#4a4a4a'), 0.08, rng);
  c.rect(6, 0, 4, 16, hex('#c9a227'));
  c.rect(7, 0, 2, 16, hex('#e0c060'));
};

/** 附魔台：黑曜石底 + 红布面，顶上一本翻开的书；侧面镶钻石。 */
const enchantingTableTop: Painter = (c, rng) => {
  c.noise(hex('#8b1a2a'), 0.08, rng);
  c.rect(4, 4, 8, 8, hex('#f0f0f0'));
  c.rect(7, 4, 2, 8, hex('#c8c8c8'));
};
const enchantingTableSide: Painter = (c, rng) => {
  c.noise(hex('#1c1424'), 0.08, rng);
  c.rect(0, 0, 16, 4, hex('#8b1a2a'));
  c.rect(6, 7, 4, 4, hex('#4be3d6'));
};

/** 矿物块：底色 + 边框内嵌的方形高光。 */
function mineralBlock(color: string): Painter {
  const base = hex(color);
  return (c, rng) => {
    c.noise(base, 0.05, rng);
    c.rect(0, 0, 16, 1, shade(base, 1.2));
    c.rect(0, 0, 1, 16, shade(base, 1.2));
    c.rect(15, 0, 1, 16, shade(base, 0.7));
    c.rect(0, 15, 16, 1, shade(base, 0.7));
    c.rect(3, 3, 10, 10, shade(base, 0.9));
  };
}
/** 铁砧：深灰铁面。 */
const anvil: Painter = (c, rng) => {
  c.noise(hex('#494949'), 0.08, rng);
};
const anvilTop: Painter = (c, rng) => {
  c.noise(hex('#494949'), 0.08, rng);
  c.rect(2, 3, 12, 10, hex('#3a3a3a'));
};

/** 下界疣：三个生长阶段，越大越密。 */
function netherWart(stage: number): Painter {
  return (c, rng) => {
    c.fill(TRANSPARENT);
    const red = hex('#a02020');
    const dark = hex('#6a1414');
    const rows = 2 + stage * 2;
    for (let i = 0; i < rows; i++) {
      const x = 2 + Math.floor(rng() * 11);
      const y = 14 - i * Math.floor(14 / rows);
      c.rect(x, y, 3, 2, i % 2 === 0 ? red : dark);
    }
    c.rect(7, 2, 2, 12, dark);
  };
}

/** 末地石：米黄色带斑点。 */
const endStone: Painter = (c, rng) => {
  c.noise(hex('#dbdc9b'), 0.1, rng);
  c.speckle(hex('#b0b070'), 26, rng);
};

/** 地狱岩：暗红色多孔石。 */
const netherrack: Painter = (c, rng) => {
  c.noise(hex('#9c4a44'), 0.16, rng);
  c.speckle(hex('#6b2a28'), 30, rng);
};

/** 灵魂沙：褐色沙里嵌着几张脸。 */
const soulSand: Painter = (c, rng) => {
  c.noise(hex('#5a4437'), 0.1, rng);
  c.rect(3, 4, 3, 4, hex('#463228'));
  c.rect(10, 8, 3, 4, hex('#463228'));
};

/** 下界石英矿：地狱岩底 + 白色石英颗粒。 */
const QUARTZ_SPOTS = 8;
const quartzOre: Painter = (c, rng) => {
  netherrack(c, rng);
  const white = hex('#e8e2dc');
  const dark = shade(white, 0.7);
  for (let i = 0; i < QUARTZ_SPOTS; i++) {
    const x = Math.floor(rng() * 14);
    const y = Math.floor(rng() * 14);
    c.set(x, y, white);
    c.set(x + 1, y, white);
    c.set(x, y + 1, dark);
    c.set(x + 1, y + 1, white);
  }
};

/** 下界砖块：暗红砖缝。 */
const netherBricks: Painter = (c, rng) => {
  c.noise(hex('#2d1519'), 0.08, rng);
  for (let y = 0; y < 16; y += 4) {
    c.rect(0, y, 16, 1, hex('#1b0c0f'));
    const offset = (y / 4) % 2 === 0 ? 0 : 8;
    c.rect(offset, y, 1, 4, hex('#1b0c0f'));
    c.rect((offset + 8) % 16, y, 1, 4, hex('#1b0c0f'));
  }
};

/** 传送门：紫色漩涡。 */
const netherPortal: Painter = (c, rng) => {
  c.noise(hex('#7a3ac0'), 0.25, rng);
  c.speckle(hex('#c08ae8'), 40, rng);
  c.speckle(hex('#3a1060'), 30, rng);
};

/** 甘蔗：细长的浅绿叶片。 */
const sugarCane: Painter = (c) => {
  c.fill(TRANSPARENT);
  const green = hex('#8fc26a');
  c.rect(5, 0, 2, 16, green);
  c.rect(9, 0, 2, 16, shade(green, 0.85));
  c.rect(7, 3, 2, 10, shade(green, 1.1));
};

/** 16 种染料 / 羊毛颜色（取自 1.8.9 的调色板）。 */
export const DYE_COLORS = [
  { id: 'white', label: '白色', color: hex('#e9ecec') },
  { id: 'orange', label: '橙色', color: hex('#f07613') },
  { id: 'magenta', label: '品红色', color: hex('#bd44b3') },
  { id: 'light_blue', label: '淡蓝色', color: hex('#3ab3da') },
  { id: 'yellow', label: '黄色', color: hex('#fed83d') },
  { id: 'lime', label: '黄绿色', color: hex('#80c71f') },
  { id: 'pink', label: '粉红色', color: hex('#f38baa') },
  { id: 'gray', label: '灰色', color: hex('#474f52') },
  { id: 'light_gray', label: '淡灰色', color: hex('#9d9d97') },
  { id: 'cyan', label: '青色', color: hex('#169c9c') },
  { id: 'purple', label: '紫色', color: hex('#8932b8') },
  { id: 'blue', label: '蓝色', color: hex('#3c44aa') },
  { id: 'brown', label: '棕色', color: hex('#835432') },
  { id: 'green', label: '绿色', color: hex('#5e7c16') },
  { id: 'red', label: '红色', color: hex('#b02e26') },
  { id: 'black', label: '黑色', color: hex('#1d1d21') },
] as const;

/** 16 色羊毛贴图。 */
function woolTextures(): Record<string, Painter> {
  const out: Record<string, Painter> = {};
  for (const c of DYE_COLORS) {
    out[`wool_${c.id}`] = (canvas, rng) => {
      canvas.noise(c.color, 0.07, rng);
      canvas.speckle(shade(c.color, 1.12), 18, rng);
    };
  }
  return out;
}

/** 石头变种：底色 + 两种斑点色；磨制版斑点更少更规整。 */
function speckledStone(base: Rgba, light: Rgba, dark: Rgba, polished: boolean): Painter {
  return (c, rng) => {
    c.noise(base, polished ? 0.04 : 0.1, rng);
    c.speckle(light, polished ? 8 : 30, rng);
    c.speckle(dark, polished ? 6 : 24, rng);
    if (polished) {
      c.rect(0, 0, 16, 1, shade(base, 1.15));
      c.rect(0, 15, 16, 1, shade(base, 0.85));
    }
  };
}

/** 三种石头变种（与 1.8.9 一致）：花岗岩偏红、闪长岩偏白、安山岩偏灰。 */
export const STONE_VARIANT_COLORS = [
  { id: 'granite', label: '花岗岩', base: hex('#9a6a55'), light: hex('#b98c72'), dark: hex('#7a4f3e') },
  { id: 'diorite', label: '闪长岩', base: hex('#cfcfcf'), light: hex('#f0f0f0'), dark: hex('#8a8a8a') },
  { id: 'andesite', label: '安山岩', base: hex('#8a8a8a'), light: hex('#a8a8a8'), dark: hex('#6a6a6a') },
] as const;

/** 三种石头变种及其磨制版的贴图。 */
function stoneVariantTextures(): Record<string, Painter> {
  const out: Record<string, Painter> = {};
  for (const v of STONE_VARIANT_COLORS) {
    out[v.id] = speckledStone(v.base, v.light, v.dark, false);
    out[`polished_${v.id}`] = speckledStone(v.base, v.light, v.dark, true);
  }
  return out;
}

/**
 * 六种木材（与 1.8.9 一致）的配色，据此批量生成木板 / 原木 / 树叶 / 树苗贴图。
 * 贴图 key 形如 `planks_spruce`、`log_side_birch`。
 */
export const WOOD_TYPES = [
  { id: 'oak', label: '橡木', wood: WOOD, bark: BARK, leaf: LEAF },
  { id: 'spruce', label: '云杉', wood: hex('#7a5730'), bark: hex('#3b2a17'), leaf: hex('#2f5a2a') },
  { id: 'birch', label: '白桦', wood: hex('#d7cb8d'), bark: hex('#d8d8d0'), leaf: hex('#78a34a') },
  { id: 'jungle', label: '丛林木', wood: hex('#a67a52'), bark: hex('#57452c'), leaf: hex('#39931f') },
  { id: 'acacia', label: '金合欢', wood: hex('#ba6337'), bark: hex('#6b5433'), leaf: hex('#5f9b32') },
  { id: 'dark_oak', label: '深色橡木', wood: hex('#4f3218'), bark: hex('#3a2a19'), leaf: hex('#2f6b22') },
] as const;

/** 六种木材的全部贴图。 */
function woodTextures(): Record<string, Painter> {
  const out: Record<string, Painter> = {};
  for (const t of WOOD_TYPES) {
    out[`planks_${t.id}`] = planksOf(t.wood);
    out[`log_side_${t.id}`] = logSideOf(t.bark);
    out[`log_top_${t.id}`] = logTopOf(t.bark, t.wood);
    out[`leaves_${t.id}`] = leavesOf(t.leaf);
    out[`sapling_${t.id}`] = saplingOf(shade(t.leaf, 1.1));
  }
  return out;
}

/** 破坏裂纹阶段数（destroy_stage_0..9）。 */
export const DESTROY_STAGE_COUNT = 10;
const DESTROY_STAGE_PREFIX = 'destroy_stage_';
const CRACK_COLOR = hex('#141414c8');
const CRACK_COLOR_LIGHT = hex('#2a2a2a96');
/** 每阶段裂纹分支数与最大长度随阶段线性增长。 */
const CRACK_BRANCH_BASE = 2;
const CRACK_BRANCH_PER_STAGE = 1;
const CRACK_MIN_LENGTH = 3;
const CRACK_LENGTH_PER_STAGE = 1;

/** 破坏阶段贴图 key。 */
export function destroyStageKey(stage: number): string {
  return `${DESTROY_STAGE_PREFIX}${stage}`;
}

/** 全部破坏阶段贴图 key。 */
export function collectDestroyStageKeys(): string[] {
  return Array.from({ length: DESTROY_STAGE_COUNT }, (_, i) => destroyStageKey(i));
}

/**
 * 裂纹贴图：透明底，从中心附近向外的随机折线，阶段越高分支越多越长。
 * 每阶段用固定种子，且低阶段的裂纹是高阶段的子集，保证过渡自然。
 */
function destroyStage(stage: number): Painter {
  return (c) => {
    const rng = createRng(hashString(DESTROY_STAGE_PREFIX));
    const branches = CRACK_BRANCH_BASE + CRACK_BRANCH_PER_STAGE * DESTROY_STAGE_COUNT;
    const visible = CRACK_BRANCH_BASE + CRACK_BRANCH_PER_STAGE * stage;
    const half = TEXTURE_SIZE / 2;
    for (let b = 0; b < branches; b++) {
      let x = half - 2 + Math.floor(rng() * 4);
      let y = half - 2 + Math.floor(rng() * 4);
      const angle = rng() * Math.PI * 2;
      const maxLength = CRACK_MIN_LENGTH + CRACK_LENGTH_PER_STAGE * DESTROY_STAGE_COUNT;
      const length = CRACK_MIN_LENGTH + CRACK_LENGTH_PER_STAGE * stage;
      for (let i = 0; i < maxLength; i++) {
        const jitter = (rng() - 0.5) * 1.2;
        const dx = Math.cos(angle + jitter);
        const dz = Math.sin(angle + jitter);
        x += dx > 0.33 ? 1 : dx < -0.33 ? -1 : 0;
        y += dz > 0.33 ? 1 : dz < -0.33 ? -1 : 0;
        if (b < visible && i < length) {
          c.set(x, y, CRACK_COLOR);
          if (stage >= DESTROY_STAGE_COUNT / 2 && rng() < 0.5) {
            c.set(x + 1, y, CRACK_COLOR_LIGHT);
          }
        }
      }
    }
  };
}

const DESTROY_STAGE_PAINTERS: Record<string, Painter> = Object.fromEntries(
  collectDestroyStageKeys().map((key, stage) => [key, destroyStage(stage)]),
);

/** 方块贴图生成器表。 */
export const BLOCK_TEXTURE_PAINTERS: Record<string, Painter> = {
  ...DESTROY_STAGE_PAINTERS,
  stone: noiseBase(STONE),
  grass_top: grassTop,
  grass_side: grassSide,
  dirt: noiseBase(DIRT, 0.1),
  cobblestone: cobble(STONE),
  mossy_cobblestone: cobble(STONE, true),
  planks,
  sapling,
  bedrock,
  water,
  sand: noiseBase(SAND, 0.05),
  gravel: (c, rng) => {
    c.noise(GRAVEL, 0.15, rng);
    c.speckle(shade(GRAVEL, 0.6), 30, rng);
    c.speckle(shade(GRAVEL, 1.3), 30, rng);
  },
  gold_ore: ore(hex('#f7d13d')),
  iron_ore: ore(hex('#d8af93')),
  coal_ore: ore(hex('#2b2b2b'), 10),
  diamond_ore: ore(hex('#5ce6e0'), 6),
  log_top: logTop,
  log_side: logSide,
  leaves,
  glass,
  sandstone_top: noiseBase(SAND, 0.05),
  sandstone_side: sandstoneSide,
  tall_grass: crossPlant(hex('#5d9c3a')),
  dandelion,
  poppy,
  bricks,
  tnt_top: tnt('top'),
  tnt_side: tnt('side'),
  tnt_bottom: tnt('bottom'),
  bookshelf,
  obsidian,
  torch,
  crafting_table_top: craftingTop,
  crafting_table_front: craftingFront,
  crafting_table_side: craftingSide,
  furnace_top: furnaceTop,
  furnace_front: furnaceFront,
  furnace_side: furnaceSide,
  ...woodTextures(),
  ...stoneVariantTextures(),
  ...woolTextures(),
  lapis_ore: lapisOre,
  mob_spawner: mobSpawner,
  cobweb,
  cactus_side: cactusSide,
  cactus_top: cactusTop,
  brewing_stand: brewingStand,
  netherrack,
  end_stone: endStone,
  nether_wart_0: netherWart(0),
  nether_wart_1: netherWart(1),
  nether_wart_2: netherWart(2),
  soul_sand: soulSand,
  quartz_ore: quartzOre,
  nether_bricks: netherBricks,
  nether_portal: netherPortal,
  enchanting_table_top: enchantingTableTop,
  gold_block: mineralBlock('#f0c040'),
  iron_block: mineralBlock('#dcdcdc'),
  diamond_block: mineralBlock('#4be3d6'),
  anvil,
  anvil_top: anvilTop,
  enchanting_table_side: enchantingTableSide,
  sugar_cane: sugarCane,
  chest_top: chestTop,
  chest_front: chestFront,
  chest_side: chestSide,
  bed_head_top: bedHeadTop,
  bed_foot_top: bedFootTop,
  bed_head_side: bedHeadSide,
  bed_foot_side: bedFootSide,
  bed_head_end: bedHeadEnd,
  bed_foot_end: bedFootEnd,
  ladder,
  particle_heart: particleHeart,
  particle_rain: particleRain,
  particle_snow: particleSnow,
  lava,
  fire,
  door_lower: doorLower,
  door_upper: doorUpper,
  farmland_dry: farmlandDry,
  farmland_wet: farmlandWet,
  ...cropStageTextures('wheat', WHEAT_RIPE),
  ...cropStageTextures('carrots', CARROT_RIPE),
  ...cropStageTextures('potatoes', POTATO_RIPE),
  snow: noiseBase(SNOW, 0.03),
  glowstone,
  stone_bricks: stoneBricks,
  pumpkin_top: pumpkinTop,
  pumpkin_face: pumpkinFace,
  pumpkin_side: pumpkinSide,
  melon_top: melonSide,
  melon_side: melonSide,
};

/** 生成一张方块贴图；未知 key 返回品红方格。 */
export function paintBlockTexture(key: string): PixelCanvas {
  const canvas = new PixelCanvas();
  const painter = BLOCK_TEXTURE_PAINTERS[key];
  const rng = createRng(hashString(key));
  if (!painter) {
    canvas.fill(hex('#ff00ff'));
    canvas.rect(0, 0, 8, 8, hex('#000000'));
    canvas.rect(8, 8, 8, 8, hex('#000000'));
    return canvas;
  }
  painter(canvas, rng);
  return canvas;
}
