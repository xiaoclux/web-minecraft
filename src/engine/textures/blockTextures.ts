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
const WOOL = hex('#e9e9e9');
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

const planks: Painter = (c, rng) => {
  c.noise(WOOD, 0.06, rng);
  const line = shade(WOOD, 0.55);
  for (const y of [3, 7, 11, 15]) {
    c.rect(0, y, 16, 1, line);
  }
  c.rect(4, 0, 1, 3, line);
  c.rect(12, 4, 1, 3, line);
  c.rect(7, 8, 1, 3, line);
  c.rect(2, 12, 1, 3, line);
};

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

const logSide: Painter = (c, rng) => {
  c.noise(BARK, 0.1, rng);
  const dark = shade(BARK, 0.6);
  for (let x = 1; x < 16; x += 4) {
    for (let y = 0; y < 16; y++) {
      if (rng() > 0.3) {
        c.set(x, y, dark);
      }
    }
  }
};

const logTop: Painter = (c, rng) => {
  c.noise(BARK, 0.08, rng);
  const inner = shade(WOOD, 1.05);
  c.rect(2, 2, 12, 12, inner);
  const ring = shade(WOOD, 0.75);
  c.rect(4, 4, 8, 8, ring);
  c.rect(5, 5, 6, 6, inner);
  c.rect(7, 7, 2, 2, ring);
};

const leaves: Painter = (c, rng) => {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const r = rng();
      if (r < 0.18) {
        c.set(x, y, TRANSPARENT);
      } else {
        c.set(x, y, shade(LEAF, 0.7 + r * 0.6));
      }
    }
  }
};

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

const sapling: Painter = (c) => {
  c.fill(TRANSPARENT);
  c.rect(7, 9, 2, 7, hex('#6b4a2a'));
  c.rect(4, 3, 8, 6, hex('#3d7a24'));
  c.rect(5, 2, 6, 1, hex('#3d7a24'));
  c.rect(6, 1, 4, 1, hex('#4c9430'));
};

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
  wool: noiseBase(WOOL, 0.05),
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
  door_lower: doorLower,
  door_upper: doorUpper,
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
