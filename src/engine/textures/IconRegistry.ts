import { blockVariant, getBlock, RenderType } from '../blocks/BlockRegistry';
import { getItem, ItemKind } from '../items/ItemRegistry';
import { TEXTURE_SIZE, type PixelCanvas } from './PixelCanvas';
import { paintBlockTexture } from './blockTextures';
import { paintItemIcon } from './itemTextures';

/** UI 图标边长。 */
export const ICON_SIZE = 48;
const TOP_SHADE = 1;
const LEFT_SHADE = 0.8;
const RIGHT_SHADE = 0.6;

const cache = new Map<string, string>();
const blockTexCache = new Map<string, PixelCanvas>();

function texturePixels(key: string): PixelCanvas {
  let pix = blockTexCache.get(key);
  if (!pix) {
    pix = paintBlockTexture(key);
    blockTexCache.set(key, pix);
  }
  return pix;
}

function makeCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('IconRegistry: cannot create 2d context');
  }
  ctx.imageSmoothingEnabled = false;
  return [canvas, ctx];
}

function pixToImage(pix: PixelCanvas, shadeFactor = 1): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const data = new Uint8ClampedArray(pix.data);
  if (shadeFactor !== 1) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.round(data[i] * shadeFactor);
      data[i + 1] = Math.round(data[i + 1] * shadeFactor);
      data[i + 2] = Math.round(data[i + 2] * shadeFactor);
    }
  }
  ctx.putImageData(new ImageData(data, TEXTURE_SIZE, TEXTURE_SIZE), 0, 0);
  return canvas;
}

/** 绘制伪等距立方体图标。 */
function drawCubeIcon(topKey: string, leftKey: string, rightKey: string): string {
  const [canvas, ctx] = makeCanvas();
  const top = pixToImage(texturePixels(topKey), TOP_SHADE);
  const left = pixToImage(texturePixels(leftKey), LEFT_SHADE);
  const right = pixToImage(texturePixels(rightKey), RIGHT_SHADE);
  const s = ICON_SIZE;
  const half = s / 2;
  const quarter = s / 4;
  // 顶面：菱形
  ctx.save();
  ctx.setTransform(half / TEXTURE_SIZE, quarter / TEXTURE_SIZE, -half / TEXTURE_SIZE, quarter / TEXTURE_SIZE, half, 0);
  ctx.drawImage(top, 0, 0);
  ctx.restore();
  // 左面
  ctx.save();
  ctx.setTransform(half / TEXTURE_SIZE, quarter / TEXTURE_SIZE, 0, half / TEXTURE_SIZE, 0, quarter);
  ctx.drawImage(left, 0, 0);
  ctx.restore();
  // 右面
  ctx.save();
  ctx.setTransform(half / TEXTURE_SIZE, -quarter / TEXTURE_SIZE, 0, half / TEXTURE_SIZE, half, half);
  ctx.drawImage(right, 0, 0);
  ctx.restore();
  return canvas.toDataURL();
}

function drawFlatIcon(pix: PixelCanvas): string {
  const [canvas, ctx] = makeCanvas();
  ctx.drawImage(pixToImage(pix), 0, 0, ICON_SIZE, ICON_SIZE);
  return canvas.toDataURL();
}

/** 获取物品图标 data URL（带缓存）。 */
export function getItemIcon(itemId: string): string {
  const cached = cache.get(itemId);
  if (cached) {
    return cached;
  }
  const def = getItem(itemId);
  let url: string;
  if (def?.kind === ItemKind.BLOCK && def.blockId !== undefined) {
    const block = getBlock(def.blockId);
    const textures = blockVariant(block, def.blockMeta ?? 0).textures;
    if (block.render === RenderType.CROSS) {
      url = drawFlatIcon(texturePixels(textures.north));
    } else {
      url = drawCubeIcon(textures.top, textures.north, textures.east);
    }
  } else {
    url = drawFlatIcon(paintItemIcon(def?.icon ?? itemId));
  }
  cache.set(itemId, url);
  return url;
}
