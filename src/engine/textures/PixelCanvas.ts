/** 贴图边长（像素）。 */
export const TEXTURE_SIZE = 16;

/** RGBA 颜色（0~255）。 */
export type Rgba = readonly [number, number, number, number];

/** 简单的确定性随机数（mulberry32）。 */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 字符串哈希（FNV-1a）用于给每张贴图派生种子。 */
export function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 亮度调整。 */
export function shade(color: Rgba, factor: number): Rgba {
  return [
    Math.max(0, Math.min(255, Math.round(color[0] * factor))),
    Math.max(0, Math.min(255, Math.round(color[1] * factor))),
    Math.max(0, Math.min(255, Math.round(color[2] * factor))),
    color[3],
  ];
}

/** 解析 #rrggbb / #rrggbbaa。 */
export function hex(str: string): Rgba {
  const clean = str.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const a = clean.length >= 8 ? parseInt(clean.slice(6, 8), 16) : 255;
  return [r, g, b, a];
}

/** 16×16 像素画布。 */
export class PixelCanvas {
  readonly size: number;
  readonly data: Uint8ClampedArray;

  constructor(size = TEXTURE_SIZE) {
    this.size = size;
    this.data = new Uint8ClampedArray(size * size * 4);
  }

  set(x: number, y: number, c: Rgba): void {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) {
      return;
    }
    const i = (y * this.size + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = c[3];
  }

  get(x: number, y: number): Rgba {
    const i = (y * this.size + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  fill(c: Rgba): this {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        this.set(x, y, c);
      }
    }
    return this;
  }

  rect(x0: number, y0: number, w: number, h: number, c: Rgba): this {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        this.set(x, y, c);
      }
    }
    return this;
  }

  /** 每个像素在 base 基础上随机变暗/变亮。 */
  noise(base: Rgba, variance: number, rng: () => number): this {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        this.set(x, y, shade(base, 1 + (rng() - 0.5) * 2 * variance));
      }
    }
    return this;
  }

  /** 随机撒点。 */
  speckle(color: Rgba, count: number, rng: () => number, minY = 0, maxY = this.size): this {
    for (let i = 0; i < count; i++) {
      const x = Math.floor(rng() * this.size);
      const y = minY + Math.floor(rng() * (maxY - minY));
      this.set(x, y, color);
    }
    return this;
  }

  /** 对已有像素整体乘以亮度因子（可指定区域）。 */
  darken(factor: number, x0 = 0, y0 = 0, w = this.size, h = this.size): this {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        this.set(x, y, shade(this.get(x, y), factor));
      }
    }
    return this;
  }

  /**
   * 用字符画绘制：每行一个字符串，palette 将字符映射为颜色，'.' 或空格为透明/跳过。
   */
  draw(rows: string[], palette: Record<string, Rgba>, offsetX = 0, offsetY = 0): this {
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        const c = palette[ch];
        if (c && ch !== '.' && ch !== ' ') {
          this.set(x + offsetX, y + offsetY, c);
        }
      }
    }
    return this;
  }
}

/** 把整数坐标与盐混入基础哈希，得到位置相关的确定性种子。 */
export function hashCoords(base: number, a: number, b: number, salt = 0): number {
  let h = base ^ 0x9e3779b9;
  h = Math.imul(h ^ (a | 0), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ (b | 0), 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h ^ (salt | 0), 0x27d4eb2f);
  h ^= h >>> 15;
  return h >>> 0;
}
