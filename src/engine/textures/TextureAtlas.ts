import * as THREE from 'three';
import { collectBlockTextureKeys } from '../blocks/BlockRegistry';
import { TEXTURE_SIZE, type PixelCanvas } from './PixelCanvas';
import { collectDestroyStageKeys, paintBlockTexture } from './blockTextures';

/** 图集中一张贴图的 UV 范围。 */
export interface AtlasRegion {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  /** 图集内的整数索引，用于着色器/mesher。 */
  index: number;
}

/** 由程序化贴图拼成的方块图集。 */
export class TextureAtlas {
  readonly texture: THREE.Texture;
  readonly tilesPerRow: number;
  readonly regions = new Map<string, AtlasRegion>();
  /** 每张 16×16 贴图的像素数据，供 UI 图标复用。 */
  readonly pixels = new Map<string, PixelCanvas>();
  private readonly canvas: HTMLCanvasElement;

  constructor(keys: string[] = [...collectBlockTextureKeys(), ...collectDestroyStageKeys()]) {
    const count = keys.length;
    this.tilesPerRow = Math.ceil(Math.sqrt(count));
    const size = this.tilesPerRow * TEXTURE_SIZE;
    this.canvas = document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = size;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('TextureAtlas: cannot create 2d context');
    }
    keys.forEach((key, index) => {
      const pix = paintBlockTexture(key);
      this.pixels.set(key, pix);
      const tx = index % this.tilesPerRow;
      const ty = Math.floor(index / this.tilesPerRow);
      const imageData = new ImageData(new Uint8ClampedArray(pix.data), TEXTURE_SIZE, TEXTURE_SIZE);
      ctx.putImageData(imageData, tx * TEXTURE_SIZE, ty * TEXTURE_SIZE);
      const inset = 0.001;
      this.regions.set(key, {
        u0: tx / this.tilesPerRow + inset,
        v0: 1 - (ty + 1) / this.tilesPerRow + inset,
        u1: (tx + 1) / this.tilesPerRow - inset,
        v1: 1 - ty / this.tilesPerRow - inset,
        index,
      });
    });
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.needsUpdate = true;
  }

  /** 获取贴图 UV 范围；缺失时抛错（说明注册表与生成器不一致）。 */
  region(key: string): AtlasRegion {
    const r = this.regions.get(key);
    if (!r) {
      throw new Error(`TextureAtlas: missing texture "${key}"`);
    }
    return r;
  }
}
