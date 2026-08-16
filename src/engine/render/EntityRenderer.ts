import * as THREE from 'three';
import { getBlock, RenderType } from '../blocks/BlockRegistry';
import { MAX_LIGHT } from '../constants/world';
import { ArrowEntity } from '../entities/ArrowEntity';
import { XpOrbEntity } from '../entities/XpOrbEntity';
import type { Entity } from '../entities/Entity';
import { ItemDropEntity } from '../entities/ItemDropEntity';
import { ThrownPotionEntity } from '../entities/ThrownPotionEntity';
import { FireballEntity } from '../entities/FireballEntity';
import { EnderCrystalEntity } from '../entities/EnderCrystalEntity';
import { EnderDragonEntity } from '../entities/EnderDragonEntity';
import { WitherEntity } from '../entities/WitherEntity';
import { WitherSkullEntity } from '../entities/WitherSkullEntity';
import type { ItemStack } from '../items/ItemStack';
import { Mob } from '../entities/Mob';
import { getItem, ItemKind } from '../items/ItemRegistry';
import { PixelCanvas, createRng, hashString, hex } from '../textures/PixelCanvas';
import { paintBlockTexture } from '../textures/blockTextures';
import { paintItemIcon } from '../textures/itemTextures';
import type { World } from '../world/World';
import { XP_ORB_SIZE } from '../constants/game';
import { MOB_BABY_SCALE } from '../constants/mobs';
import { MOB_MODELS, PartAnim, type MobModelSpec, type PartSpec } from './MobModels';

const PIXEL = 1 / 16;
const HURT_COLOR = new THREE.Color(1, 0.35, 0.35);
const CREEPER_FLASH_COLOR = new THREE.Color(2, 2, 2);
const ITEM_BOB_SPEED = 2;
const ITEM_BOB_HEIGHT = 0.1;
const ITEM_SPIN_SPEED = 1.2;
const DROP_BLOCK_SIZE = 0.3;
const DROP_ITEM_SIZE = 0.4;
const ARROW_LENGTH = 0.6;
/** 经验球的基础颜色与闪烁速度。 */
const XP_ORB_COLOR = 0x8fff26;
const XP_ORB_PULSE_SPEED = 6;
const ARROW_THICKNESS = 0.06;
/** 末影水晶的渲染尺寸。 */
const CRYSTAL_RENDER_SIZE = 1.2;
/** 末影龙即使在暗处也保留一点可见度。 */
const DRAGON_MIN_BRIGHTNESS = 0.35;
const SHEEP_SHEARED_COLOR = '#f0a0a0';

interface RenderedEntity {
  group: THREE.Group;
  parts: { mesh: THREE.Mesh; spec: PartSpec }[];
  materials: THREE.MeshLambertMaterial[];
  kind: 'mob' | 'item' | 'arrow' | 'xp' | 'fireball' | 'crystal' | 'dragon' | 'wither';
}

/** 负责实体的 three.js 表现：模型、动画、受伤闪烁、光照。 */
export class EntityRenderer {
  readonly group = new THREE.Group();
  private readonly rendered = new Map<number, RenderedEntity>();
  private readonly textureCache = new Map<string, THREE.Texture>();
  private readonly geometryCache = new Map<string, THREE.BoxGeometry>();

  constructor(private world: World) {}

  /** 换世界（切维度）：清掉当前维度的实体表现。 */
  setWorld(world: World): void {
    if (world === this.world) {
      return;
    }
    this.world = world;
    for (const [id, r] of this.rendered) {
      this.group.remove(r.group);
      for (const m of r.materials) {
        m.dispose();
      }
      this.rendered.delete(id);
    }
  }

  /** 每帧同步。 */
  /** 夜视等效果给的最低亮度 0~1（0 表示按环境光正常渲染）。 */
  private minLight = 0;

  update(entities: Iterable<Entity>, skyLevel: number, time: number, cameraYaw: number, minLight = 0): void {
    this.minLight = minLight;
    const alive = new Set<number>();
    for (const entity of entities) {
      alive.add(entity.id);
      let r: RenderedEntity | null = this.rendered.get(entity.id) ?? null;
      if (!r) {
        r = this.create(entity);
        if (!r) {
          continue;
        }
        this.rendered.set(entity.id, r);
        this.group.add(r.group);
      }
      this.sync(entity, r, skyLevel, time, cameraYaw);
    }
    for (const [id, r] of this.rendered) {
      if (!alive.has(id)) {
        this.group.remove(r.group);
        for (const m of r.materials) {
          m.dispose();
        }
        this.rendered.delete(id);
      }
    }
  }

  private create(entity: Entity): RenderedEntity | null {
    if (entity instanceof Mob) {
      return this.createMob(entity);
    }
    if (entity instanceof ItemDropEntity || entity instanceof ThrownPotionEntity) {
      // 飞行中的药水就用掉落物的旋转图标表现，像瓶子在空中翻滚
      return this.createItem(entity.stack);
    }
    if (entity instanceof ArrowEntity) {
      return this.createArrow();
    }
    if (entity instanceof FireballEntity) {
      return this.createFireball(entity);
    }
    if (entity instanceof EnderCrystalEntity) {
      return this.createCrystal();
    }
    if (entity instanceof EnderDragonEntity) {
      return this.createDragon();
    }
    if (entity instanceof WitherEntity) {
      return this.createWither();
    }
    if (entity instanceof WitherSkullEntity) {
      return this.createWitherSkull();
    }
    if (entity instanceof XpOrbEntity) {
      return this.createXpOrb();
    }
    return null;
  }

  private partTexture(mobType: string, spec: PartSpec, face: boolean, colorOverride?: string): THREE.Texture {
    const color = colorOverride ?? spec.color;
    const key = `${mobType}:${spec.name}:${face ? 'face' : 'side'}:${color}`;
    let tex = this.textureCache.get(key);
    if (tex) {
      return tex;
    }
    const canvas = new PixelCanvas();
    const rng = createRng(hashString(key));
    canvas.noise(hex(color), spec.noise ?? 0.07, rng);
    if (face && spec.face && spec.facePalette) {
      const palette: Record<string, readonly [number, number, number, number]> = {};
      for (const [k, v] of Object.entries(spec.facePalette)) {
        palette[k] = hex(v);
      }
      const rows = spec.face;
      const w = rows[0]?.length ?? 0;
      const h = rows.length;
      const scaleX = 16 / Math.max(1, w);
      const scaleY = 16 / Math.max(1, h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const c = palette[rows[y][x]];
          if (c) {
            canvas.rect(Math.floor(x * scaleX), Math.floor(y * scaleY), Math.ceil(scaleX), Math.ceil(scaleY), c);
          }
        }
      }
    }
    tex = this.canvasToTexture(canvas);
    this.textureCache.set(key, tex);
    return tex;
  }

  private canvasToTexture(pix: PixelCanvas): THREE.Texture {
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

  private boxGeometry(w: number, h: number, d: number): THREE.BoxGeometry {
    const key = `${w},${h},${d}`;
    let g = this.geometryCache.get(key);
    if (!g) {
      g = new THREE.BoxGeometry(w, h, d);
      this.geometryCache.set(key, g);
    }
    return g;
  }

  private createMob(mob: Mob): RenderedEntity {
    const spec: MobModelSpec = MOB_MODELS[mob.type];
    const group = new THREE.Group();
    const parts: RenderedEntity['parts'] = [];
    const materials: THREE.MeshLambertMaterial[] = [];
    for (const part of spec.parts) {
      const colorOverride =
        mob.type === 'sheep' && part.name === 'body' && !mob.hasWool ? SHEEP_SHEARED_COLOR : undefined;
      const sideMat = new THREE.MeshLambertMaterial({ map: this.partTexture(mob.type, part, false, colorOverride) });
      const faceMat = part.face
        ? new THREE.MeshLambertMaterial({ map: this.partTexture(mob.type, part, true, colorOverride) })
        : sideMat;
      materials.push(sideMat);
      if (faceMat !== sideMat) {
        materials.push(faceMat);
      }
      const geometry = this.boxGeometry(part.size[0] * PIXEL, part.size[1] * PIXEL, part.size[2] * PIXEL);
      // BoxGeometry 材质顺序：+x, -x, +y, -y, +z, -z；正面为 -z
      const mesh = new THREE.Mesh(geometry, [sideMat, sideMat, sideMat, sideMat, sideMat, faceMat]);
      mesh.position.set(part.offset[0] * PIXEL, part.offset[1] * PIXEL, part.offset[2] * PIXEL);
      const pivot = new THREE.Group();
      pivot.position.set(part.pivot[0] * PIXEL, part.pivot[1] * PIXEL, part.pivot[2] * PIXEL);
      pivot.add(mesh);
      group.add(pivot);
      parts.push({ mesh, spec: part });
    }
    return { group, parts, materials, kind: 'mob' };
  }

  private createItem(stack: ItemStack): RenderedEntity {
    const def = getItem(stack.id);
    const group = new THREE.Group();
    const materials: THREE.MeshLambertMaterial[] = [];
    if (
      def?.kind === ItemKind.BLOCK &&
      def.blockId !== undefined &&
      getBlock(def.blockId).render !== RenderType.CROSS
    ) {
      const block = getBlock(def.blockId);
      const faces = [
        block.textures.east,
        block.textures.west,
        block.textures.top,
        block.textures.bottom,
        block.textures.south,
        block.textures.north,
      ];
      const mats = faces.map((key) => {
        const m = new THREE.MeshLambertMaterial({
          map: this.blockTexture(key),
          transparent: block.render !== RenderType.OPAQUE,
          alphaTest: 0.5,
        });
        materials.push(m);
        return m;
      });
      const mesh = new THREE.Mesh(this.boxGeometry(DROP_BLOCK_SIZE, DROP_BLOCK_SIZE, DROP_BLOCK_SIZE), mats);
      mesh.position.y = DROP_BLOCK_SIZE / 2;
      group.add(mesh);
    } else {
      const key =
        def?.kind === ItemKind.BLOCK && def.blockId !== undefined
          ? getBlock(def.blockId).textures.north
          : (def?.icon ?? stack.id);
      const isBlockTexture = def?.kind === ItemKind.BLOCK;
      const tex = isBlockTexture ? this.blockTexture(key) : this.itemTexture(key);
      const m = new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
      materials.push(m);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(DROP_ITEM_SIZE, DROP_ITEM_SIZE), m);
      mesh.position.y = DROP_ITEM_SIZE / 2;
      group.add(mesh);
    }
    return { group, parts: [], materials, kind: 'item' };
  }

  /** 火球：一个自发光的橙色小方块，大小随种类。 */
  private createFireball(fireball: FireballEntity): RenderedEntity {
    const group = new THREE.Group();
    const m = new THREE.MeshLambertMaterial({ color: 0xffa030, emissive: 0xff6010 });
    const size = fireball.width;
    const mesh = new THREE.Mesh(this.boxGeometry(size, size, size), m);
    group.add(mesh);
    return { group, parts: [], materials: [m], kind: 'fireball' };
  }

  /** 末影水晶：一颗发光的紫色棱形块。 */
  private createCrystal(): RenderedEntity {
    const group = new THREE.Group();
    const m = new THREE.MeshLambertMaterial({ color: 0xc77ffb, emissive: 0x6a2fa0 });
    const mesh = new THREE.Mesh(this.boxGeometry(CRYSTAL_RENDER_SIZE, CRYSTAL_RENDER_SIZE, CRYSTAL_RENDER_SIZE), m);
    mesh.rotation.set(Math.PI / 4, Math.PI / 4, 0);
    group.add(mesh);
    return { group, parts: [], materials: [m], kind: 'crystal' };
  }

  /** 末影龙：黑色的身体 + 头 + 两片翅膀（用盒子拼）。 */
  private createDragon(): RenderedEntity {
    const group = new THREE.Group();
    const m = new THREE.MeshLambertMaterial({ color: 0x1b1b26 });
    const body = new THREE.Mesh(this.boxGeometry(2.4, 1.4, 5), m);
    const head = new THREE.Mesh(this.boxGeometry(1.6, 1.4, 2), m);
    head.position.set(0, 0.2, -3.2);
    const wingLeft = new THREE.Mesh(this.boxGeometry(5, 0.3, 2.4), m);
    wingLeft.position.set(3.4, 0.5, 0);
    const wingRight = wingLeft.clone();
    wingRight.position.x = -3.4;
    group.add(body, head, wingLeft, wingRight);
    return { group, parts: [], materials: [m], kind: 'dragon' };
  }

  /** 凋灵：一根身体 + 三个头。 */
  private createWither(): RenderedEntity {
    const group = new THREE.Group();
    const m = new THREE.MeshLambertMaterial({ color: 0x24242c });
    const body = new THREE.Mesh(this.boxGeometry(0.6, 1.8, 0.6), m);
    body.position.y = 1;
    group.add(body);
    for (const offset of [-0.8, 0, 0.8]) {
      const head = new THREE.Mesh(this.boxGeometry(0.6, 0.6, 0.6), m);
      head.position.set(offset, offset === 0 ? 2.4 : 2.1, 0);
      group.add(head);
    }
    return { group, parts: [], materials: [m], kind: 'wither' };
  }

  /** 凋灵之首：黑色小方块。 */
  private createWitherSkull(): RenderedEntity {
    const group = new THREE.Group();
    const m = new THREE.MeshLambertMaterial({ color: 0x1b1b22, emissive: 0x2a1030 });
    group.add(new THREE.Mesh(this.boxGeometry(0.4, 0.4, 0.4), m));
    return { group, parts: [], materials: [m], kind: 'fireball' };
  }

  private createArrow(): RenderedEntity {
    const group = new THREE.Group();
    const m = new THREE.MeshLambertMaterial({ color: 0x8f6b3a });
    const mesh = new THREE.Mesh(this.boxGeometry(ARROW_THICKNESS, ARROW_THICKNESS, ARROW_LENGTH), m);
    group.add(mesh);
    return { group, parts: [], materials: [m], kind: 'arrow' };
  }

  /** 经验球：一个自发光的小方块，颜色在黄绿之间闪。 */
  private createXpOrb(): RenderedEntity {
    const group = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color: XP_ORB_COLOR });
    const mesh = new THREE.Mesh(this.boxGeometry(XP_ORB_SIZE, XP_ORB_SIZE, XP_ORB_SIZE), m);
    group.add(mesh);
    return { group, parts: [], materials: [m as unknown as THREE.MeshLambertMaterial], kind: 'xp' };
  }

  private blockTexture(key: string): THREE.Texture {
    const cacheKey = `block:${key}`;
    let tex = this.textureCache.get(cacheKey);
    if (!tex) {
      tex = this.canvasToTexture(paintBlockTexture(key));
      this.textureCache.set(cacheKey, tex);
    }
    return tex;
  }

  private itemTexture(key: string): THREE.Texture {
    const cacheKey = `item:${key}`;
    let tex = this.textureCache.get(cacheKey);
    if (!tex) {
      tex = this.canvasToTexture(paintItemIcon(key));
      this.textureCache.set(cacheKey, tex);
    }
    return tex;
  }

  private brightnessAt(x: number, y: number, z: number, skyLevel: number): number {
    const bx = Math.floor(x);
    const by = Math.floor(y);
    const bz = Math.floor(z);
    const sky = this.world.getSkyLight(bx, by, bz) / MAX_LIGHT;
    const block = this.world.getBlockLight(bx, by, bz) / MAX_LIGHT;
    const level = Math.max(sky * skyLevel, block, this.minLight);
    return 0.08 + 0.92 * (level / (4 - 3 * level));
  }

  private sync(entity: Entity, r: RenderedEntity, skyLevel: number, time: number, cameraYaw: number): void {
    r.group.position.set(entity.x, entity.y, entity.z);
    const brightness = this.brightnessAt(entity.x, entity.y + entity.height / 2, entity.z, skyLevel);
    if (r.kind === 'mob' && entity instanceof Mob) {
      this.syncMob(entity, r, brightness);
      return;
    }
    if (r.kind === 'item') {
      const bob = Math.sin(time * ITEM_BOB_SPEED + entity.id) * ITEM_BOB_HEIGHT + ITEM_BOB_HEIGHT;
      r.group.position.y = entity.y + bob;
      r.group.rotation.y = time * ITEM_SPIN_SPEED + entity.id;
      for (const m of r.materials) {
        m.color.setScalar(brightness);
      }
      return;
    }
    if (r.kind === 'xp') {
      // 经验球自己会发光，不受环境亮度影响；上下浮动 + 黄绿闪烁
      const bob = Math.sin(time * ITEM_BOB_SPEED + entity.id) * ITEM_BOB_HEIGHT + ITEM_BOB_HEIGHT;
      r.group.position.y = entity.y + bob;
      r.group.rotation.y = time * ITEM_SPIN_SPEED + entity.id;
      const pulse = 0.5 + 0.5 * Math.sin(time * XP_ORB_PULSE_SPEED + entity.id);
      for (const m of r.materials) {
        m.color.setRGB(0.55 + 0.45 * pulse, 1, 0.15);
      }
      return;
    }
    if (r.kind === 'crystal') {
      // 水晶自转 + 上下浮动，且自发光不受环境亮度影响
      r.group.rotation.y = time;
      r.group.position.y = entity.y + Math.sin(time * 2) * 0.15;
      return;
    }
    if (r.kind === 'wither') {
      r.group.rotation.set(0, entity.yaw, 0);
      for (const m of r.materials) {
        m.color.setScalar(Math.max(brightness, DRAGON_MIN_BRIGHTNESS));
      }
      return;
    }
    if (r.kind === 'dragon') {
      r.group.rotation.set(0, entity.yaw, 0);
      for (const m of r.materials) {
        m.color.setScalar(Math.max(brightness, DRAGON_MIN_BRIGHTNESS));
      }
      return;
    }
    if (r.kind === 'arrow') {
      r.group.rotation.set(0, entity.yaw, 0);
      r.group.rotateX(-entity.pitch);
      for (const m of r.materials) {
        m.color.setRGB(0.56 * brightness, 0.42 * brightness, 0.23 * brightness);
      }
      void cameraYaw;
    }
  }

  private syncMob(mob: Mob, r: RenderedEntity, brightness: number): void {
    const spec = MOB_MODELS[mob.type];
    r.group.rotation.y = mob.yaw;
    // 幼崽整体缩小（原版是身体缩小、脑袋按比例更大，这里先做整体缩放）
    const scale = mob.isBaby ? MOB_BABY_SCALE : 1;
    r.group.scale.setScalar(scale);
    const swing = Math.sin(mob.limbSwing * 3) * spec.swingAmplitude * Math.min(1, mob.limbSpeed / 1.5);
    const dying = mob.health <= 0;
    if (dying) {
      r.group.rotation.z = Math.min(Math.PI / 2, (mob.deathTicks / 20) * (Math.PI / 2));
      r.group.position.y = mob.y + Math.sin(r.group.rotation.z) * mob.width * 0.5;
    }
    for (const { mesh, spec: part } of r.parts) {
      const pivot = mesh.parent as THREE.Object3D;
      switch (part.anim) {
        case PartAnim.LEG_L:
          pivot.rotation.x = swing;
          break;
        case PartAnim.LEG_R:
          pivot.rotation.x = -swing;
          break;
        case PartAnim.ARM_L:
          pivot.rotation.x = -swing;
          break;
        case PartAnim.ARM_R:
          pivot.rotation.x = swing;
          break;
        case PartAnim.ZOMBIE_ARM:
          pivot.rotation.x = -Math.PI / 2 + swing * 0.2;
          break;
        case PartAnim.WING:
          pivot.rotation.z = mob.onGround ? 0 : Math.sin(mob.age * 1.5) * 0.8 * (part.pivot[0] < 0 ? 1 : -1);
          break;
        case PartAnim.HEAD:
          pivot.rotation.x = 0;
          break;
        default:
          break;
      }
    }
    let color: THREE.Color | null = null;
    if (mob.hurtTicks > 0 || dying) {
      color = HURT_COLOR;
    } else if (mob.isCharging && Math.floor(mob.fuse / 3) % 2 === 0) {
      color = CREEPER_FLASH_COLOR;
    } else if (mob.isBurning && mob.age % 6 < 3) {
      color = new THREE.Color(1.4, 0.8, 0.4);
    }
    for (const m of r.materials) {
      if (color) {
        m.color.copy(color).multiplyScalar(brightness);
      } else {
        m.color.setScalar(brightness);
      }
    }
    if (mob.type === 'sheep') {
      const bodyPart = r.parts.find((p) => p.spec.name === 'body');
      if (bodyPart) {
        const mats = bodyPart.mesh.material as THREE.MeshLambertMaterial[];
        const desired = this.partTexture('sheep', bodyPart.spec, false, mob.hasWool ? undefined : SHEEP_SHEARED_COLOR);
        if (mats[0].map !== desired) {
          for (const m of mats) {
            m.map = desired;
            m.needsUpdate = true;
          }
        }
      }
    }
  }

  /** 释放资源。 */
  dispose(): void {
    for (const r of this.rendered.values()) {
      for (const m of r.materials) {
        m.dispose();
      }
    }
    for (const t of this.textureCache.values()) {
      t.dispose();
    }
    for (const g of this.geometryCache.values()) {
      g.dispose();
    }
    this.rendered.clear();
  }
}
