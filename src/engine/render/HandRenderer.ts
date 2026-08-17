import * as THREE from 'three';
import { getBlock, RenderType } from '../blocks/BlockRegistry';
import { getItem, ItemKind } from '../items/ItemRegistry';
import type { TextureAtlas } from '../textures/TextureAtlas';
import { paintItemIcon } from '../textures/itemTextures';
import { PixelCanvas } from '../textures/PixelCanvas';

const HAND_POSITION = new THREE.Vector3(0.5, -0.45, -0.8);
const BLOCK_SCALE = 0.3;
const ITEM_SCALE = 0.42;
const HAND_SKIN_COLOR = new THREE.Color(0xd9a066);
const HAND_RENDER_ORDER = 1000;
const SWING_DURATION_MS = 250;

/** 第一人称手持物品。 */
export class HandRenderer {
  readonly group = new THREE.Group();
  private currentKey: string | null = null;
  private mesh: THREE.Mesh | null = null;
  private swingStart = 0;
  private baseColor = new THREE.Color(1, 1, 1);
  private readonly textureCache = new Map<string, THREE.Texture>();
  /** 每种手持物只建一次网格：切物品栏只是换个子节点，不再每次新建材质 / 几何体。 */
  private readonly meshCache = new Map<string, { mesh: THREE.Mesh; baseColor: THREE.Color }>();

  constructor(private readonly atlas: TextureAtlas) {
    this.group.position.copy(HAND_POSITION);
  }

  /** 触发挥动。 */
  swing(): void {
    this.swingStart = performance.now();
  }

  /** 每帧：同步手持物品与动画。 */
  update(itemId: string | null, brightness: number): void {
    const key = itemId ?? 'hand';
    if (key !== this.currentKey) {
      this.currentKey = key;
      this.rebuild(itemId);
    }
    const elapsed = performance.now() - this.swingStart;
    const t = elapsed < SWING_DURATION_MS ? elapsed / SWING_DURATION_MS : 0;
    const swing = Math.sin(t * Math.PI);
    this.group.position.set(
      HAND_POSITION.x - swing * 0.2,
      HAND_POSITION.y - swing * 0.25,
      HAND_POSITION.z - swing * 0.15,
    );
    this.group.rotation.set(-swing * 0.8, 0.3 - swing * 0.4, 0);
    if (this.mesh) {
      const mats = Array.isArray(this.mesh.material) ? this.mesh.material : [this.mesh.material];
      for (const m of mats) {
        (m as THREE.MeshBasicMaterial).color.copy(this.baseColor).multiplyScalar(brightness);
      }
    }
  }

  private rebuild(itemId: string | null): void {
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh = null;
    }
    const cacheKey = itemId ?? 'hand';
    let entry = this.meshCache.get(cacheKey);
    if (!entry) {
      entry = this.buildMesh(itemId);
      this.meshCache.set(cacheKey, entry);
    }
    this.mesh = entry.mesh;
    this.baseColor.copy(entry.baseColor);
    this.group.add(this.mesh);
  }

  private buildMesh(itemId: string | null): { mesh: THREE.Mesh; baseColor: THREE.Color } {
    const def = itemId ? getItem(itemId) : undefined;
    const baseColor = new THREE.Color(1, 1, 1);
    let mesh: THREE.Mesh;
    if (!def) {
      const skin = new THREE.MeshBasicMaterial({ color: HAND_SKIN_COLOR, depthTest: false, depthWrite: false });
      baseColor.copy(HAND_SKIN_COLOR);
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.45), skin);
      mesh.rotation.set(0.2, 0, 0);
      mesh.renderOrder = HAND_RENDER_ORDER;
      return { mesh, baseColor };
    }
    if (def.kind === ItemKind.BLOCK && def.blockId !== undefined && getBlock(def.blockId).render !== RenderType.CROSS) {
      const block = getBlock(def.blockId);
      const faces = [
        block.textures.east,
        block.textures.west,
        block.textures.top,
        block.textures.bottom,
        block.textures.south,
        block.textures.north,
      ];
      const mats = faces.map(
        (k) =>
          new THREE.MeshBasicMaterial({
            map: this.blockTexture(k),
            transparent: block.render !== RenderType.OPAQUE,
            alphaTest: 0.5,
            depthTest: false,
            depthWrite: false,
          }),
      );
      mesh = new THREE.Mesh(new THREE.BoxGeometry(BLOCK_SCALE, BLOCK_SCALE, BLOCK_SCALE), mats);
      mesh.rotation.set(0.1, -0.6, 0);
    } else {
      const key =
        def.kind === ItemKind.BLOCK && def.blockId !== undefined
          ? getBlock(def.blockId).textures.north
          : (def.icon ?? def.id);
      const tex = def.kind === ItemKind.BLOCK ? this.blockTexture(key) : this.itemTexture(key);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
      });
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(ITEM_SCALE, ITEM_SCALE), mat);
      mesh.rotation.set(0, -0.4, 0.4);
    }
    mesh.renderOrder = HAND_RENDER_ORDER;
    return { mesh, baseColor };
  }

  private blockTexture(key: string): THREE.Texture {
    const cacheKey = `block:${key}`;
    let tex = this.textureCache.get(cacheKey);
    if (!tex) {
      const pix = this.atlas.pixels.get(key);
      tex = this.toTexture(pix ?? new PixelCanvas());
      this.textureCache.set(cacheKey, tex);
    }
    return tex;
  }

  private itemTexture(key: string): THREE.Texture {
    const cacheKey = `item:${key}`;
    let tex = this.textureCache.get(cacheKey);
    if (!tex) {
      tex = this.toTexture(paintItemIcon(key));
      this.textureCache.set(cacheKey, tex);
    }
    return tex;
  }

  private toTexture(pix: PixelCanvas): THREE.Texture {
    const el = document.createElement('canvas');
    el.width = pix.size;
    el.height = pix.size;
    const ctx = el.getContext('2d') as CanvasRenderingContext2D;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(pix.data), pix.size, pix.size), 0, 0);
    const tex = new THREE.CanvasTexture(el);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
}
