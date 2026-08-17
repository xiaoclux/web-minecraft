import * as THREE from 'three';
import { getBlock, RenderType } from '../blocks/BlockRegistry';
import { MAX_LIGHT } from '../constants/world';
import { ArrowEntity } from '../entities/ArrowEntity';
import { XpOrbEntity } from '../entities/XpOrbEntity';
import type { Entity } from '../entities/Entity';
import { ItemDropEntity } from '../entities/ItemDropEntity';
import { FishingBobberEntity } from '../entities/FishingBobberEntity';
import { ThrownItemEntity } from '../entities/ThrownItemEntity';
import { ThrownPotionEntity } from '../entities/ThrownPotionEntity';
import { FireballEntity } from '../entities/FireballEntity';
import { EnderCrystalEntity } from '../entities/EnderCrystalEntity';
import { EnderDragonEntity } from '../entities/EnderDragonEntity';
import { WitherEntity } from '../entities/WitherEntity';
import { WitherSkullEntity } from '../entities/WitherSkullEntity';
import { MinecartEntity } from '../entities/MinecartEntity';
import type { ItemStack } from '../items/ItemStack';
import { Mob } from '../entities/Mob';
import { isMobType } from '../entities/MobDefs';
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
/** 着火的生物闪烁时的偏橙色调。 */
const BURN_COLOR = new THREE.Color(1.4, 0.8, 0.4);
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
/** 名牌：画布尺寸、字号、世界里的大小与离脚底的高度。 */
const NAMEPLATE_CANVAS_WIDTH = 256;
const NAMEPLATE_CANVAS_HEIGHT = 64;
const NAMEPLATE_FONT_PX = 40;
const NAMEPLATE_MAX_CHARS = 12;
const NAMEPLATE_WORLD_WIDTH = 1.6;
const NAMEPLATE_WORLD_HEIGHT = 0.4;
const NAMEPLATE_HEIGHT = 2.2;
/** 末影水晶的渲染尺寸。 */
const CRYSTAL_RENDER_SIZE = 1.2;
/** 末影龙即使在暗处也保留一点可见度。 */
const DRAGON_MIN_BRIGHTNESS = 0.35;
const SHEEP_SHEARED_COLOR = '#f0a0a0';

interface RenderedEntity {
  group: THREE.Group;
  parts: { mesh: THREE.Mesh; spec: PartSpec }[];
  materials: THREE.MeshLambertMaterial[];
  kind: 'mob' | 'item' | 'arrow' | 'xp' | 'fireball' | 'crystal' | 'dragon' | 'wither' | 'minecart' | 'bobber';
  /** 不跟随 group 变换、需要各自摆在世界坐标里的部件（末影龙的脖子与尾巴分段）。 */
  extraMeshes?: THREE.Mesh[];
}

/**
 * 末影龙脖子与尾巴的分段。
 * delay = 取多少帧之前的位置（越大离头越远），offset = 沿当时朝向再挪多少（正数在前），
 * rise = 相对当时高度抬高多少。
 */
const DRAGON_SEGMENTS: readonly { width: number; height: number; length: number; delay: number; offset: number; rise: number }[] =
  [
    // 头与脖子：几乎不延迟，靠 offset 顶在身体前面
    { width: 1.6, height: 1.4, length: 2, delay: 0, offset: 3.6, rise: 0.25 },
    { width: 1.2, height: 1.1, length: 1.5, delay: 1, offset: 2.2, rise: 0.35 },
    { width: 1, height: 0.9, length: 1.4, delay: 2, offset: 1.1, rise: 0.4 },
    // 尾巴：延迟逐节加大，转弯时才甩出弧线，直飞时连成一条
    { width: 1.2, height: 1, length: 1.6, delay: 3, offset: -3.2, rise: 0.1 },
    { width: 1, height: 0.85, length: 1.5, delay: 5, offset: -4.5, rise: 0.05 },
    { width: 0.8, height: 0.7, length: 1.4, delay: 7, offset: -5.7, rise: 0 },
    { width: 0.6, height: 0.55, length: 1.3, delay: 9, offset: -6.8, rise: 0 },
  ];

/** 负责实体的 three.js 表现：模型、动画、受伤闪烁、光照。 */
export class EntityRenderer {
  readonly group = new THREE.Group();
  private readonly rendered = new Map<number, RenderedEntity>();
  /** 其他玩家的模型（联机）。 */
  private readonly remotePlayers = new Map<number, RenderedEntity>();
  /** 服务端同步过来的实体模型（联机客户端用）。 */
  private readonly remoteEntities = new Map<number, RenderedEntity>();
  private readonly textureCache = new Map<string, THREE.Texture>();
  private readonly geometryCache = new Map<string, THREE.BoxGeometry>();

  constructor(private world: World) {}

  /**
   * 更新其他玩家的模型（联机用）。用与僵尸同款的人形模型，只是配色不同。
   */
  updateRemotePlayers(
    players: readonly { id: number; name: string; x: number; y: number; z: number; yaw: number }[],
  ): void {
    if (players.length === 0 && this.remotePlayers.size === 0) {
      return;
    }
    const alive = this.alive;
    alive.clear();
    for (const player of players) {
      alive.add(player.id);
      let rendered = this.remotePlayers.get(player.id);
      if (!rendered) {
        rendered = this.createRemotePlayer(player.name);
        this.group.add(rendered.group);
        this.remotePlayers.set(player.id, rendered);
      }
      rendered.group.position.set(player.x, player.y, player.z);
      rendered.group.rotation.set(0, player.yaw, 0);
    }
    for (const [id, rendered] of this.remotePlayers) {
      if (!alive.has(id)) {
        this.group.remove(rendered.group);
        for (const m of rendered.materials) {
          m.dispose();
        }
        this.remotePlayers.delete(id);
      }
    }
  }

  /**
   * 画服务端同步过来的实体（生物 / 掉落物）。这些实体在本地没有逻辑，只有位置与朝向。
   */
  updateRemoteEntities(entities: readonly { id: number; kind: string; x: number; y: number; z: number; yaw: number }[]): void {
    if (entities.length === 0 && this.remoteEntities.size === 0) {
      return;
    }
    const alive = this.alive;
    alive.clear();
    for (const entity of entities) {
      alive.add(entity.id);
      let rendered = this.remoteEntities.get(entity.id);
      if (!rendered) {
        const created = this.createRemoteEntity(entity.kind);
        if (!created) {
          continue;
        }
        rendered = created;
        this.group.add(rendered.group);
        this.remoteEntities.set(entity.id, rendered);
      }
      rendered.group.position.set(entity.x, entity.y, entity.z);
      rendered.group.rotation.set(0, entity.yaw, 0);
    }
    for (const [id, rendered] of this.remoteEntities) {
      if (!alive.has(id)) {
        this.group.remove(rendered.group);
        for (const m of rendered.materials) {
          m.dispose();
        }
        this.remoteEntities.delete(id);
      }
    }
  }

  /** 按类型造一个只用来看的实体模型；不认识的类型返回 null。 */
  private createRemoteEntity(kind: string): RenderedEntity | null {
    if (isMobType(kind)) {
      // 借用生物模型：只需要类型与"有没有毛"，这里都按默认值来
      const fake = new Mob(kind);
      return this.createMob(fake);
    }
    if (kind === 'item' || kind === 'xp_orb') {
      const group = new THREE.Group();
      const m = new THREE.MeshLambertMaterial({ color: kind === 'xp_orb' ? 0x8ce63a : 0xd0d0d0 });
      const size = kind === 'xp_orb' ? 0.2 : 0.3;
      group.add(new THREE.Mesh(this.boxGeometry(size, size, size), m));
      return { group, parts: [], materials: [m], kind: 'item' };
    }
    return null;
  }

  /** 其他玩家的模型：头 + 身体 + 四肢的简化 Steve。 */
  /** 名牌：把名字画到一张小画布上，用 Sprite 贴在头顶（始终朝向相机）。 */
  private createNameplate(name: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = NAMEPLATE_CANVAS_WIDTH;
    canvas.height = NAMEPLATE_CANVAS_HEIGHT;
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.font = `${NAMEPLATE_FONT_PX}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.slice(0, NAMEPLATE_MAX_CHARS), canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
    sprite.scale.set(NAMEPLATE_WORLD_WIDTH, NAMEPLATE_WORLD_HEIGHT, 1);
    sprite.position.y = NAMEPLATE_HEIGHT;
    return sprite;
  }

  private createRemotePlayer(name: string): RenderedEntity {
    const group = new THREE.Group();
    const skin = new THREE.MeshLambertMaterial({ color: 0xc98d63 });
    const shirt = new THREE.MeshLambertMaterial({ color: 0x2e8b8b });
    const pants = new THREE.MeshLambertMaterial({ color: 0x30407a });
    const head = new THREE.Mesh(this.boxGeometry(0.5, 0.5, 0.5), skin);
    head.position.y = 1.7;
    const body = new THREE.Mesh(this.boxGeometry(0.5, 0.75, 0.25), shirt);
    body.position.y = 1.15;
    const armL = new THREE.Mesh(this.boxGeometry(0.25, 0.75, 0.25), shirt);
    armL.position.set(0.375, 1.15, 0);
    const armR = armL.clone();
    armR.position.x = -0.375;
    const legL = new THREE.Mesh(this.boxGeometry(0.25, 0.75, 0.25), pants);
    legL.position.set(0.125, 0.375, 0);
    const legR = legL.clone();
    legR.position.x = -0.125;
    group.add(head, body, armL, armR, legL, legR, this.createNameplate(name));
    return { group, parts: [], materials: [skin, shirt, pants], kind: 'mob' };
  }

  /** 换世界（切维度）：清掉当前维度的实体表现。 */
  setWorld(world: World): void {
    if (world === this.world) {
      return;
    }
    this.world = world;
    for (const [id, r] of this.rendered) {
      this.removeRendered(r);
      this.rendered.delete(id);
    }
  }

  /** 从场景里摘掉一个实体的所有部件并释放材质。 */
  private removeRendered(r: RenderedEntity): void {
    this.group.remove(r.group);
    for (const mesh of r.extraMeshes ?? []) {
      this.group.remove(mesh);
    }
    for (const m of r.materials) {
      m.dispose();
    }
  }

  /** 每帧同步。 */
  /** 夜视等效果给的最低亮度 0~1（0 表示按环境光正常渲染）。 */
  private minLight = 0;
  /** 采样龙的历史位置时复用的输出对象。 */
  private readonly dragonSample = { x: 0, y: 0, z: 0, yaw: 0 };
  /** 本帧还活着的实体 id（复用，避免每帧新建 Set）。 */
  private readonly alive = new Set<number>();

  update(entities: Iterable<Entity>, skyLevel: number, time: number, cameraYaw: number, minLight = 0): void {
    this.minLight = minLight;
    const alive = this.alive;
    alive.clear();
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
        this.removeRendered(r);
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
    if (entity instanceof ThrownItemEntity) {
      return this.createItem({ id: entity.itemId, count: 1 });
    }
    if (entity instanceof FishingBobberEntity) {
      return this.createBobber();
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
    if (entity instanceof MinecartEntity) {
      return this.createMinecart();
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

  /**
   * 末影龙：身体 + 两片翅膀（跟着本体转），外加脖子与尾巴的分段。
   * 分段不挂在身体下面，而是各自按"若干帧之前的位置"摆放，飞起来才有蛇一样的甩动。
   */
  private createDragon(): RenderedEntity {
    const group = new THREE.Group();
    const m = new THREE.MeshLambertMaterial({ color: 0x1b1b26 });
    const body = new THREE.Mesh(this.boxGeometry(2.4, 1.4, 5), m);
    const wingLeft = new THREE.Mesh(this.boxGeometry(5, 0.3, 2.4), m);
    wingLeft.position.set(3.4, 0.5, 0);
    const wingRight = wingLeft.clone();
    wingRight.position.x = -3.4;
    group.add(body, wingLeft, wingRight);
    const segments: THREE.Mesh[] = [];
    for (let i = 0; i < DRAGON_SEGMENTS.length; i++) {
      const spec = DRAGON_SEGMENTS[i];
      const mesh = new THREE.Mesh(this.boxGeometry(spec.width, spec.height, spec.length), m);
      // 分段用世界坐标摆放，所以挂在场景根上而不是龙的 group 里
      this.group.add(mesh);
      segments.push(mesh);
    }
    return { group, parts: [], materials: [m], kind: 'dragon', extraMeshes: segments };
  }

  /** 钓鱼浮漂：一个小白红方块。 */
  private createBobber(): RenderedEntity {
    const group = new THREE.Group();
    const m = new THREE.MeshLambertMaterial({ color: 0xdd4444 });
    const mesh = new THREE.Mesh(this.boxGeometry(2, 2, 2), m);
    group.add(mesh);
    return { group, parts: [], materials: [m], kind: 'bobber' };
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

  /** 矿车：一个没有盖子的铁盒子。 */
  private createMinecart(): RenderedEntity {
    const group = new THREE.Group();
    const m = new THREE.MeshLambertMaterial({ color: 0x9a9a9a });
    const bottom = new THREE.Mesh(this.boxGeometry(0.98, 0.12, 0.98), m);
    bottom.position.y = 0.06;
    group.add(bottom);
    for (const [dx, dz, w, d] of [
      [0.45, 0, 0.08, 0.98],
      [-0.45, 0, 0.08, 0.98],
      [0, 0.45, 0.98, 0.08],
      [0, -0.45, 0.98, 0.08],
    ]) {
      const wall = new THREE.Mesh(this.boxGeometry(w, 0.45, d), m);
      wall.position.set(dx, 0.32, dz);
      group.add(wall);
    }
    return { group, parts: [], materials: [m], kind: 'minecart' };
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
    if (r.kind === 'minecart') {
      r.group.rotation.set(0, entity.yaw, 0);
      for (const m of r.materials) {
        m.color.setScalar(brightness);
      }
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
      if (entity instanceof EnderDragonEntity) {
        this.syncDragonSegments(entity, r);
      }
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

  /** 按龙的位置历史摆脖子与尾巴：每一节取"更早若干帧"的位置，自然拖成一条线。 */
  private syncDragonSegments(dragon: EnderDragonEntity, r: RenderedEntity): void {
    const meshes = r.extraMeshes;
    if (!meshes) {
      return;
    }
    for (let i = 0; i < meshes.length; i++) {
      const spec = DRAGON_SEGMENTS[i];
      dragon.sampleHistory(spec.delay, this.dragonSample);
      const sample = this.dragonSample;
      // 沿该帧朝向再往前 / 往后挪一点，脖子在头前、尾巴在身后
      const forwardX = -Math.sin(sample.yaw);
      const forwardZ = -Math.cos(sample.yaw);
      meshes[i].position.set(
        sample.x + forwardX * spec.offset,
        sample.y + spec.rise,
        sample.z + forwardZ * spec.offset,
      );
      meshes[i].rotation.set(0, sample.yaw, 0);
      meshes[i].visible = !dragon.isDead;
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
      color = BURN_COLOR;
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
