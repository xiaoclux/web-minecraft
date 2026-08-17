import * as THREE from 'three';
import { BlockId } from '../blocks/BlockRegistry';
import { FACING_MASK, FACINGS, SIGN_WALL_BIT } from '../blocks/blockShapes';
import { SIGN_LINE_COUNT } from '../constants/game';
import { BlockEntityType, type BlockEntityStore } from '../world/BlockEntityStore';
import { BlockPositionTracker } from '../world/BlockPositionTracker';
import { unpackPos } from '../world/posKey';
import type { World } from '../world/World';

/** 字面画进多大的画布（宽 : 高 = 告示牌板的比例）。 */
const CANVAS_WIDTH = 128;
const CANVAS_HEIGHT = 64;
const FONT_SIZE = 12;
const TEXT_COLOR = '#2b1d0e';
/** 字面比板略小一点，免得贴到边框上。 */
const PLANE_WIDTH = 0.9;
const PLANE_HEIGHT = 0.42;
/** 文字左右各留这么多像素边距，超长行压缩进这个宽度里。 */
const TEXT_HORIZONTAL_PADDING = 8;
/** 板面中心离方块底面的高度，以及字面浮出板面多少（避免 z-fighting）。 */
const BOARD_CENTER_Y = 12.5 / 16;
const SURFACE_OFFSET = 0.065;
/** 超过这个距离就不画字了（远处也看不清）；比较用平方距离，省掉每帧开方。 */
const MAX_TEXT_DISTANCE = 24;
const MAX_TEXT_DISTANCE_SQ = MAX_TEXT_DISTANCE * MAX_TEXT_DISTANCE;
/** 方块中心相对整数坐标的偏移。 */
const BLOCK_CENTER = 0.5;
/** meta 还没读过时的哨兵值（合法 meta 都是非负数），保证首次一定摆一次位置。 */
const META_UNSET = -1;

interface SignEntry {
  mesh: THREE.Mesh;
  texture: THREE.CanvasTexture;
  /** 上次画到贴图上的文字（各行拼接），文字没变就不重画。 */
  textKey: string;
  /** textKey 去掉空白后是否还有内容，缓存起来免得每帧 trim。 */
  hasText: boolean;
  /** 上次用来摆放朝向的 meta，没变就不重算位置/旋转。 */
  meta: number;
}

/**
 * 告示牌上的字：每块牌子一张小画布贴图，正面朝外贴在板上。
 * 牌子数量很少，直接每块一个 mesh；离得太远的隐藏起来不画。
 */
export class SignRenderer {
  readonly group = new THREE.Group();
  private signs: BlockPositionTracker;
  /**
   * 每个 World 一个 tracker，切维度来回切时复用而不是每次新建——
   * tracker 会订阅世界事件，反复新建又不退订就是泄漏。
   */
  private readonly trackers = new Map<World, BlockPositionTracker>();
  private readonly meshes = new Map<number, SignEntry>();
  private readonly posOut = [0, 0, 0];

  constructor(
    private world: World,
    private blockEntities: BlockEntityStore,
  ) {
    this.signs = this.trackerFor(world);
  }

  /** 换世界（切维度）：换用该世界的 tracker，旧世界的字全部收走。 */
  setWorld(world: World, blockEntities: BlockEntityStore): void {
    this.world = world;
    this.blockEntities = blockEntities;
    this.signs = this.trackerFor(world);
    this.clearMeshes();
  }

  private trackerFor(world: World): BlockPositionTracker {
    let tracker = this.trackers.get(world);
    if (!tracker) {
      tracker = new BlockPositionTracker(world, BlockId.SIGN);
      this.trackers.set(world, tracker);
    }
    return tracker;
  }

  /** 每帧调用：把视野内牌子上的字画出来。 */
  update(playerX: number, playerY: number, playerZ: number): void {
    for (const key of this.signs.positions) {
      unpackPos(key, this.posOut);
      const [x, y, z] = this.posOut;
      const dx = x + BLOCK_CENTER - playerX;
      const dy = y + BLOCK_CENTER - playerY;
      const dz = z + BLOCK_CENTER - playerZ;
      if (dx * dx + dy * dy + dz * dz > MAX_TEXT_DISTANCE_SQ) {
        const existing = this.meshes.get(key);
        if (existing) {
          existing.mesh.visible = false;
        }
        continue;
      }
      this.syncSign(key, x, y, z);
    }
    // 牌子被拆掉后把对应的字也收走
    for (const [key, entry] of this.meshes) {
      if (!this.signs.positions.has(key)) {
        this.destroyEntry(key, entry);
      }
    }
  }

  private syncSign(key: number, x: number, y: number, z: number): void {
    let entry = this.meshes.get(key);
    if (!entry) {
      entry = this.createEntry();
      this.meshes.set(key, entry);
      this.group.add(entry.mesh);
    }
    const entity = this.blockEntities.get(x, y, z);
    const lines = entity?.type === BlockEntityType.SIGN ? entity.lines : null;
    const textKey = lines ? lines.join('\n') : '';
    if (entry.textKey !== textKey) {
      entry.textKey = textKey;
      entry.hasText = textKey.trim().length > 0;
      this.paint(entry.texture, lines ?? []);
    }
    // 远处被隐藏后走回来要重新显示，所以可见性每帧按缓存的 hasText 赋值（只是一个布尔写入）
    entry.mesh.visible = entry.hasText;
    const meta = this.world.getMeta(x, y, z);
    if (entry.meta !== meta) {
      entry.meta = meta;
      this.place(entry.mesh, x, y, z, meta);
    }
  }

  /** 按朝向把字面摆到板的正面（朝向那一侧）；只在 meta 变化时调用。 */
  private place(mesh: THREE.Mesh, x: number, y: number, z: number, meta: number): void {
    const [fx, fz] = FACINGS[meta & FACING_MASK];
    const isWall = (meta & SIGN_WALL_BIT) !== 0;
    const boardOffset = isWall ? BLOCK_CENTER - SURFACE_OFFSET : SURFACE_OFFSET;
    mesh.position.set(x + BLOCK_CENTER + fx * boardOffset, y + BOARD_CENTER_Y, z + BLOCK_CENTER + fz * boardOffset);
    mesh.rotation.set(0, Math.atan2(fx, fz), 0);
  }

  private createEntry(): SignEntry {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PLANE_WIDTH, PLANE_HEIGHT), material);
    // 新建的 mesh 还没画字：先藏起来，等 syncSign 比对出文字后再决定显不显示
    mesh.visible = false;
    return { mesh, texture, textKey: '', hasText: false, meta: META_UNSET };
  }

  private destroyEntry(key: number, entry: SignEntry): void {
    this.group.remove(entry.mesh);
    entry.texture.dispose();
    entry.mesh.geometry.dispose();
    (entry.mesh.material as THREE.Material).dispose();
    this.meshes.delete(key);
  }

  private clearMeshes(): void {
    for (const [key, entry] of this.meshes) {
      this.destroyEntry(key, entry);
    }
  }

  private paint(texture: THREE.CanvasTexture, lines: readonly string[]): void {
    const canvas = texture.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = `${FONT_SIZE}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lineHeight = canvas.height / SIGN_LINE_COUNT;
    for (let i = 0; i < SIGN_LINE_COUNT; i++) {
      const line = lines[i] ?? '';
      if (line.length > 0) {
        ctx.fillText(line, canvas.width / 2, lineHeight * (i + 0.5), canvas.width - TEXT_HORIZONTAL_PADDING);
      }
    }
    texture.needsUpdate = true;
  }

  dispose(): void {
    this.clearMeshes();
    for (const tracker of this.trackers.values()) {
      tracker.dispose();
    }
    this.trackers.clear();
  }
}
