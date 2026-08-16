import { DYE_COLORS } from './blockTextures';
import { PixelCanvas, hex, shade, type Rgba } from './PixelCanvas';

type Painter = (c: PixelCanvas) => void;

const STICK = hex('#8f6b3a');
const STICK_DARK = hex('#5b4326');
const TIER_COLORS: Record<string, Rgba> = {
  wooden: hex('#a37c4a'),
  stone: hex('#8a8a8a'),
  iron: hex('#d8d8d8'),
  golden: hex('#f0c040'),
  diamond: hex('#4be3d6'),
};

const PICKAXE = [
  '..........HHH...',
  '........HHHHHH..',
  '.......HH...HHH.',
  '......HH.....HH.',
  '.....HH.....S.H.',
  '....HH.....SS...',
  '...HH.....SS....',
  '..HH.....SS.....',
  '..H.....SS......',
  '.......SS.......',
  '......SS........',
  '.....SS.........',
  '....SS..........',
  '...SS...........',
  '..SS............',
  '.SS.............',
];
const AXE = [
  '........HHH.....',
  '.......HHHHH....',
  '......HHHHHHH...',
  '.....HHHHSHHH...',
  '.....HHHSSHHH...',
  '......HSS.HHH...',
  '......SS..HH....',
  '.....SS.........',
  '....SS..........',
  '...SS...........',
  '..SS............',
  '.SS.............',
  'SS..............',
  '................',
  '................',
  '................',
];
const HOE = [
  '......HHHHHH....',
  '......HHHHHH....',
  '......HH..HH....',
  '..........SH....',
  '.........SS.....',
  '........SS......',
  '.......SS.......',
  '......SS........',
  '.....SS.........',
  '....SS..........',
  '...SS...........',
  '..SS............',
  '.SS.............',
  'SS..............',
  '................',
  '................',
];
const SHOVEL = [
  '...........HHH..',
  '..........HHHHH.',
  '..........HHHHH.',
  '..........HHHHH.',
  '..........SHHH..',
  '.........SS.....',
  '........SS......',
  '.......SS.......',
  '......SS........',
  '.....SS.........',
  '....SS..........',
  '...SS...........',
  '..SS............',
  '.SS.............',
  '................',
  '................',
];
const SWORD = [
  '.............HH.',
  '............HHH.',
  '...........HHH..',
  '..........HHH...',
  '.........HHH....',
  '........HHH.....',
  '.......HHH......',
  '..GG..HHH.......',
  '...GGHHH........',
  '....GG..........',
  '...SSGG.........',
  '..SS..GG........',
  '.SS.............',
  'SS..............',
  '................',
  '................',
];

function toolPainter(shape: string[], tier: string): Painter {
  const head = TIER_COLORS[tier];
  return (c) =>
    c.draw(shape, {
      H: head,
      S: STICK,
      G: STICK_DARK,
    });
}

function drawTool(name: string, shape: string[]): Record<string, Painter> {
  const out: Record<string, Painter> = {};
  for (const tier of Object.keys(TIER_COLORS)) {
    out[`${tier}_${name}`] = toolPainter(shape, tier);
  }
  return out;
}

const blob =
  (color: Rgba, rows: string[]): Painter =>
  (c) =>
    c.draw(rows, { X: color, D: shade(color, 0.7), L: shade(color, 1.25) });

function meatPainter(raw: Rgba, cooked: boolean): Painter {
  const fat = hex('#f2e2c9');
  const base = cooked ? shade(raw, 0.6) : raw;
  return (c) =>
    c.draw(
      [
        '................',
        '................',
        '....XXXXXX......',
        '...XXXXXXXXX....',
        '..XXXXFFXXXXX...',
        '..XXXFFFFXXXX...',
        '..XXXFFFXXXXX...',
        '..XXXXXXXXXXD...',
        '...XXXXXXXXDD...',
        '....XDDXXXDD....',
        '.....DDDDDD.....',
        '................',
      ],
      { X: base, D: shade(base, 0.7), F: cooked ? shade(fat, 0.75) : fat },
    );
}

/** 物品图标生成器表。 */
/** 手绘的物品图标（盔甲那类批量生成的在下面合并进来）。 */
const HAND_DRAWN_ICONS: Record<string, Painter> = {
  ...drawTool('pickaxe', PICKAXE),
  ...drawTool('axe', AXE),
  ...drawTool('shovel', SHOVEL),
  ...drawTool('sword', SWORD),
  ...drawTool('hoe', HOE),
  stick: (c) =>
    c.draw(
      [
        '..........XX',
        '.........XX.',
        '........XX..',
        '.......XX...',
        '......XX....',
        '.....XX.....',
        '....XX......',
        '...XX.......',
        '..XX........',
        '.XX.........',
      ],
      { X: STICK },
      2,
      3,
    ),
  coal: blob(hex('#262626'), [
    '................',
    '................',
    '.....XXXX.......',
    '....XXLXXX......',
    '...XXLLXXXX.....',
    '...XXXXXXXXX....',
    '..XXXXXXXXXX....',
    '..XXXXXXXXXD....',
    '...XXXXXXXDD....',
    '....XXXXDDD.....',
    '.....XDDDD......',
    '................',
  ]),
  charcoal: blob(hex('#3a2a20'), [
    '................',
    '................',
    '.....XXXX.......',
    '....XXLXXX......',
    '...XXLLXXXX.....',
    '...XXXXXXXXX....',
    '..XXXXXXXXXX....',
    '..XXXXXXXXXD....',
    '...XXXXXXXDD....',
    '....XXXXDDD.....',
    '.....XDDDD......',
    '................',
  ]),
  iron_ingot: blob(hex('#d8d8d8'), [
    '................',
    '................',
    '................',
    '................',
    '.....LLLLLLLL...',
    '....LXXXXXXXXD..',
    '...LXXXXXXXXXD..',
    '..LXXXXXXXXXXD..',
    '..XXXXXXXXXXDD..',
    '..DDDDDDDDDDD...',
    '................',
    '................',
  ]),
  gold_ingot: blob(hex('#f2c744'), [
    '................',
    '................',
    '................',
    '................',
    '.....LLLLLLLL...',
    '....LXXXXXXXXD..',
    '...LXXXXXXXXXD..',
    '..LXXXXXXXXXXD..',
    '..XXXXXXXXXXDD..',
    '..DDDDDDDDDDD...',
    '................',
    '................',
  ]),
  diamond: blob(hex('#5ce6e0'), [
    '................',
    '................',
    '.....LLLLLL.....',
    '....LLXXXXXD....',
    '...LLXXXXXXXD...',
    '...LXXXXXXXXD...',
    '....XXXXXXXD....',
    '.....XXXXXD.....',
    '......XXXD......',
    '.......XD.......',
    '................',
    '................',
  ]),
  wheat_seeds: (c) => {
    const s = hex('#3d9c2a');
    c.draw(['.X..X...', 'X..X..X.', '..X..X..', '.X..X.X.', 'X.X..X..'], { X: s }, 4, 5);
  },
  string: (c) => {
    const s = hex('#eeeeee');
    c.draw(['XX......', 'X.XX....', '...XX...', '....XX..', '.....XX.', '......XX'], { X: s }, 4, 4);
  },
  feather: (c) =>
    c.draw(
      ['.......XX', '......XXX', '.....XXXX', '....XXXX.', '...XXXX..', '..XXXX...', '.XXX.....', 'XX.......'],
      { X: hex('#f0f0f0') },
      3,
      3,
    ),
  leather: blob(hex('#c65c35'), [
    '................',
    '................',
    '..XX........XX..',
    '..XXXXXXXXXXXX..',
    '..XXXXXXXXXXXX..',
    '...XXXXXXXXXX...',
    '...XXXXXXXXXX...',
    '...XXXXXXXXXX...',
    '....XXXXXXXX....',
    '....XXXXXXXX....',
    '.....XX..XX.....',
    '................',
  ]),
  bone: (c) =>
    c.draw(
      ['XX.......XX', 'XXX.....XXX', '.XXXXXXXXX.', '..XXXXXXX..', '.XXXXXXXXX.', 'XXX.....XXX', 'XX.......XX'],
      { X: hex('#eaeaea') },
      2,
      4,
    ),
  gunpowder: (c) => {
    const g = hex('#555555');
    c.draw(['...XXX...', '..XXXXX..', '.XXXXXXX.', 'XXXXXXXXX', 'XXXXXXXXX', '.XXXXXXX.', '..XXXXX..'], { X: g }, 3, 5);
  },
  arrow: (c) =>
    c.draw(
      [
        '.............XX.',
        '............XXX.',
        '...........XXX..',
        '..........XX....',
        '.........XX.....',
        '........XX......',
        '.......XX.......',
        '......XX........',
        '.....XX.........',
        '..FFXX..........',
        '.FFFX...........',
        'FFF.............',
      ],
      { X: STICK, F: hex('#e6e6e6') },
      0,
      2,
    ),
  snowball: blob(hex('#f0f8ff'), [
    '................',
    '................',
    '................',
    '......XXXX......',
    '.....XLLXXX.....',
    '....XLLXXXXX....',
    '....XXXXXXXX....',
    '....XXXXXXXD....',
    '.....XXXXDD.....',
    '......DDDD......',
    '................',
    '................',
  ]),
  flint: (c) =>
    c.draw(
      ['..XX..', '.XXXX.', 'XXXXXX', 'XXXXXX', '.XXXX.', '..XX..'],
      { X: hex('#4a4a52') },
      5,
      5,
    ),
  flint_and_steel: (c) => {
    c.draw(['..XXX.', '.X...X', 'X.....', 'X.....', '.X...X', '..XXX.'], { X: hex('#c8c8c8') }, 3, 4);
    c.draw(['XXX', 'XXX'], { X: hex('#4a4a52') }, 9, 9);
  },
  ender_pearl: (c) =>
    c.draw(
      ['..XXXX..', '.XXXXXX.', 'XXXXLXXX', 'XXXLLXXX', 'XXXXXXXX', 'XXXXXXXX', '.XXXXXX.', '..XXXX..'],
      { X: hex('#12a37a'), L: hex('#7fe6c8') },
      4,
      4,
    ),
  ink_sac: (c) =>
    c.draw(
      ['..XXXX..', '.XXXXXX.', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX', '.XXXXXX.', '..XXXX..'],
      { X: hex('#1d1d21') },
      4,
      5,
    ),
  slimeball: (c) =>
    c.draw(
      ['..XXXX..', '.XXXXXX.', 'XXXLXXXX', 'XXLLXXXX', 'XXXXXXXX', '.XXXXXX.', '..XXXX..'],
      { X: hex('#7ac47a'), L: hex('#b6e6b6') },
      4,
      5,
    ),
  sugar: (c) => {
    c.fill([0, 0, 0, 0]);
    c.rect(4, 8, 8, 5, hex('#eeeeee'));
    c.rect(5, 6, 6, 2, hex('#ffffff'));
  },
  bucket: bucketPainter(null),
  water_bucket: bucketPainter(hex('#3f60d6')),
  lava_bucket: bucketPainter(hex('#d45a12')),
  milk_bucket: bucketPainter(hex('#f2f2f2')),
  shears: (c) =>
    c.draw(
      [
        'X....X..',
        'XX..XX..',
        '.XXXX...',
        '..XX....',
        '.XXXX...',
        'X.X..X..',
        'X.X..X..',
        '.X....X.',
      ],
      { X: hex('#c8c8c8') },
      4,
      4,
    ),
  bow: (c) =>
    c.draw(
      [
        '....SSS.........',
        '..SS...S........',
        '.S......S.......',
        'S.......S.......',
        'S.......S.......',
        'S.......S.......',
        'S........S......',
        'S........S......',
        'S........S......',
        'S........S......',
        'S.......S.......',
        '.S......S.......',
        '..SS...S........',
        '....SSS.........',
      ],
      { S: STICK },
      1,
      1,
    ),
  apple: (c) =>
    c.draw(
      [
        '......S.........',
        '.....SS.........',
        '..XXXXXXXX......',
        '.XXXXXXXXXX.....',
        'XXXXXXXXXXXX....',
        'XXXXXXXXXXXX....',
        'XXXXXXXXXXXX....',
        'XXXXXXXXXXXX....',
        '.XXXXXXXXXX.....',
        '..XXXX.XXX......',
      ],
      { X: hex('#d8342c'), S: hex('#5b4326') },
      2,
      3,
    ),
  wheat: (c) =>
    c.draw(
      [
        '.......X........',
        '..X....X....X...',
        '.XXX..XXX..XXX..',
        '..X.X..X..X.X...',
        '..X.XX.X.XX.X...',
        '..X..X.X.X..X...',
        '.....X.X.X......',
        '.....XXXXX......',
        '.......X........',
        '.......X........',
      ],
      { X: hex('#d8bb54') },
      1,
      3,
    ),
  carrot: (c) => {
    c.draw(['..XX..', '.XXXX.', '.XXXX.', '..XX..', '..XX..', '...X..'], { X: hex('#e07a1c') }, 5, 7);
    c.draw(['.X.X.', 'XXXXX', '.XXX.'], { X: hex('#4f8f2a') }, 5, 3);
  },
  potato: blob(hex('#d8a860'), [
    '................',
    '................',
    '................',
    '....XXXXXX......',
    '...XXDXXXXX.....',
    '..XXXXXXXXX.....',
    '..XXXXXDXXX.....',
    '...XXXXXXX......',
    '....XXXXX.......',
    '................',
  ]),
  baked_potato: blob(hex('#b07830'), [
    '................',
    '................',
    '................',
    '....XXXXXX......',
    '...XXDXXXXX.....',
    '..XXXXXXXXX.....',
    '..XXXXXDXXX.....',
    '...XXXXXXX......',
    '....XXXXX.......',
    '................',
  ]),
  golden_apple: (c) =>
    c.draw(
      [
        '......S.........',
        '.....SS.........',
        '..XXXXXXXX......',
        '.XXXXXXXXXX.....',
        'XXXXXXXXXXXX....',
        'XXXXXXXXXXXX....',
        'XXXXXXXXXXXX....',
        'XXXXXXXXXXXX....',
        '.XXXXXXXXXX.....',
        '..XXXX.XXX......',
      ],
      { X: hex('#f0c040'), S: hex('#5b4326') },
      2,
      3,
    ),
  bread: blob(hex('#c98f4a'), [
    '................',
    '................',
    '................',
    '..........LL....',
    '........LLLLXX..',
    '......LLLLXXXX..',
    '....LLLLXXXXXD..',
    '..LLLLXXXXXDD...',
    '..XXXXXXXDDD....',
    '..XXXXXDDD......',
    '..XXDDDD........',
    '..DDD...........',
    '................',
  ]),
  porkchop: meatPainter(hex('#f2a0a0'), false),
  cooked_porkchop: meatPainter(hex('#f2a0a0'), true),
  beef: meatPainter(hex('#c8403a'), false),
  cooked_beef: meatPainter(hex('#c8403a'), true),
  chicken: meatPainter(hex('#f0c8b0'), false),
  cooked_chicken: meatPainter(hex('#f0c8b0'), true),
  mutton: meatPainter(hex('#e04a4a'), false),
  cooked_mutton: meatPainter(hex('#e04a4a'), true),
  melon_slice: (c) =>
    c.draw(
      [
        'XXXXXXXXXXXX',
        'RRRRRRRRRRRR',
        'RRRSRRRSRRRR',
        'RRRRRRRRRRRR',
        '.RRSRRRRSRR.',
        '..RRRRRRRR..',
        '...RRRRRR...',
        '....RRRR....',
        '.....RR.....',
      ],
      { X: hex('#7fbd2a'), R: hex('#e0463c'), S: hex('#2b1b1b') },
      2,
      3,
    ),
  rotten_flesh: blob(hex('#8a5a3a'), [
    '................',
    '................',
    '....XXXX........',
    '...XXXXXXX..XX..',
    '..XXXDXXXXXXXX..',
    '..XXXXXXXXXXXX..',
    '..XXXXXXDDXXX...',
    '...XXXXXXXXXD...',
    '....XXDXXXXD....',
    '.....XXXXXX.....',
    '................',
    '................',
  ]),
};

/** 盔甲：四种材质 × 四个部位，同一套像素图换个主色。 */
const ARMOR_TIER_COLORS: Record<string, Rgba> = {
  leather: hex('#8a5a35'),
  iron: hex('#d8d8d8'),
  golden: hex('#f0c040'),
  diamond: hex('#4be3d6'),
};

const HELMET_ROWS = [
  '...XXXXXXXXXX...',
  '..XXXXXXXXXXXX..',
  '..XXXXXXXXXXXX..',
  '..XXXDDDDDDXXX..',
  '..XXXDDDDDDXXX..',
  '..XXXXXXXXXXXX..',
  '..XXX......XXX..',
  '..XX........XX..',
];
const CHESTPLATE_ROWS = [
  '..XX........XX..',
  '.XXXXXXXXXXXXXX.',
  'XXXXXXXXXXXXXXXX',
  'XXXXXXDDDDXXXXXX',
  'XXXXXXDDDDXXXXXX',
  '.XXXXXXXXXXXXXX.',
  '..XXXXXXXXXXXX..',
  '..XXXXXXXXXXXX..',
  '..XXXXXXXXXXXX..',
  '...XXXXXXXXXX...',
];
const LEGGINGS_ROWS = [
  '..XXXXXXXXXXXX..',
  '..XXXXXXXXXXXX..',
  '..XXXXDDDDXXXX..',
  '..XXXXXXXXXXXX..',
  '..XXXXX..XXXXX..',
  '..XXXX....XXXX..',
  '..XXXX....XXXX..',
  '..XXXX....XXXX..',
  '..XXX......XXX..',
];
const BOOTS_ROWS = [
  '..XXXX....XXXX..',
  '..XXXX....XXXX..',
  '.XXXXXX..XXXXXX.',
  '.XXXXXXXXXXXXXX.',
  '.XXXXXXXXXXXXXX.',
  '..XXXXX..XXXXX..',
];
const ARMOR_PIECE_ROWS: Record<string, { rows: string[]; offsetY: number }> = {
  helmet: { rows: HELMET_ROWS, offsetY: 3 },
  chestplate: { rows: CHESTPLATE_ROWS, offsetY: 3 },
  leggings: { rows: LEGGINGS_ROWS, offsetY: 4 },
  boots: { rows: BOOTS_ROWS, offsetY: 6 },
};

function armorPainters(): Record<string, Painter> {
  const out: Record<string, Painter> = {};
  for (const [tier, color] of Object.entries(ARMOR_TIER_COLORS)) {
    for (const [piece, { rows, offsetY }] of Object.entries(ARMOR_PIECE_ROWS)) {
      out[`${tier}_${piece}`] = (c) => c.draw(rows, { X: color, D: shade(color, 0.75) }, 0, offsetY);
    }
  }
  return out;
}

/** 全部物品图标。 */
export const ITEM_ICON_PAINTERS: Record<string, Painter> = {
  ...HAND_DRAWN_ICONS,
  ...armorPainters(),
  ...dyePainters(),
};

/** 染料 / 骨粉：一小撮彩色粉末。 */
const DYE_ROWS = ['..XX..', '.XXXX.', 'XXXXXX', 'XXXXXX', '.XXXX.', '..XX..'];
function dyePainters(): Record<string, Painter> {
  const out: Record<string, Painter> = {};
  for (const c of DYE_COLORS) {
    const id = c.id === 'white' ? 'bone_meal' : c.id === 'blue' ? 'lapis_lazuli' : `${c.id}_dye`;
    out[id] = (canvas) => canvas.draw(DYE_ROWS, { X: c.color }, 5, 5);
  }
  return out;
}

/** 桶：铁皮轮廓，装了东西就在桶身里填色。 */
const BUCKET_METAL = hex('#b0b0b0');
const BUCKET_DARK = hex('#7a7a7a');
function bucketPainter(fill: Rgba | null): Painter {
  return (c) => {
    c.draw(
      [
        'X......X',
        'X......X',
        '.X....X.',
        '.XFFFFX.',
        '.XFFFFX.',
        '.XFFFFX.',
        '..XXXX..',
      ],
      { X: BUCKET_METAL, F: fill ?? BUCKET_DARK },
      4,
      5,
    );
  };
}

/** 生成物品图标；未知 key 返回品红方块。 */
export function paintItemIcon(key: string): PixelCanvas {
  const canvas = new PixelCanvas();
  canvas.fill([0, 0, 0, 0]);
  const painter = ITEM_ICON_PAINTERS[key];
  if (!painter) {
    canvas.rect(2, 2, 12, 12, hex('#ff00ff'));
    return canvas;
  }
  painter(canvas);
  return canvas;
}
