import * as THREE from 'three';
import { BlockId } from '../blocks/BlockRegistry';
import { FACINGS, SIGN_WALL_BIT } from '../blocks/blockShapes';
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
/** 板面中心离方块底面的高度，以及字面浮出板面多少（避免 z-fighting）。 */
const BOARD_CENTER_Y = 12.5 / 16;
const SURFACE_OFFSET = 0.065;
/** 超过这个距离就不画字了（远处也看不清）。 */
const MAX_TEXT_DISTANCE = 24;

/**
 * 告示牌上的字：每块牌子一张小画布贴图，正面朝外贴在板上。
 * 牌子数量很少，直接每块一个 mesh；离得太远的隐藏起来不画。
 */
export class SignRenderer {
  readonly group = new THREE.Group();
  private signs: BlockPositionTracker;
  private readonly meshes = new Map<number, { mesh: THREE.Mesh; texture: THREE.CanvasTexture; text: string }>();
  private readonly posOut = [0, 0, 0];

  constructor(
    private world: World,
    private blockEntities: BlockEntityStore,
  ) {
    this.signs = new BlockPositionTracker(world, BlockId.SIGN);
  }

  /** 换世界（切维度）：牌子重新登记。 */
  setWorld(world: World, blockEntities: BlockEntityStore): void {
    this.world = world;
    this.blockEntities = blockEntities;
    this.signs = new BlockPositionTracker(world, BlockId.SIGN);
    for (const entry of this.meshes.values()) {
      this.group.remove(entry.mesh);
      entry.texture.dispose();
      entry.mesh.geometry.dispose();
      (entry.mesh.material as THREE.Material).dispose();
    }
    this.meshes.clear();
  }

  /** 每帧调用：把视野内牌子上的字画出来。 */
  update(playerX: number, playerY: number, playerZ: number): void {
    for (const key of this.signs.positions) {
      unpackPos(key, this.posOut);
      const [x, y, z] = this.posOut;
      const distance = Math.hypot(x + 0.5 - playerX, y + 0.5 - playerY, z + 0.5 - playerZ);
      if (distance > MAX_TEXT_DISTANCE) {
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
        this.group.remove(entry.mesh);
        entry.texture.dispose();
        entry.mesh.geometry.dispose();
        (entry.mesh.material as THREE.Material).dispose();
        this.meshes.delete(key);
      }
    }
  }

  private syncSign(key: number, x: number, y: number, z: number): void {
    const entity = this.blockEntities.get(x, y, z);
    const lines = entity?.type === BlockEntityType.SIGN ? entity.lines : null;
    const text = lines ? lines.join('\n') : '';
    let entry = this.meshes.get(key);
    if (!entry) {
      entry = this.createMesh();
      this.meshes.set(key, entry);
      this.group.add(entry.mesh);
    }
    entry.mesh.visible = text.trim().length > 0;
    if (entry.text !== text) {
      entry.text = text;
      this.paint(entry.texture, lines ?? []);
    }
    const meta = this.world.getMeta(x, y, z);
    const [fx, fz] = FACINGS[meta & (FACINGS.length - 1)];
    // 字浮在板的正面（朝向那一侧）
    const isWall = (meta & SIGN_WALL_BIT) !== 0;
    const boardOffset = isWall ? 0.5 - SURFACE_OFFSET : SURFACE_OFFSET;
    entry.mesh.position.set(x + 0.5 + fx * boardOffset, y + BOARD_CENTER_Y, z + 0.5 + fz * boardOffset);
    entry.mesh.rotation.set(0, Math.atan2(fx, fz), 0);
  }

  private createMesh(): { mesh: THREE.Mesh; texture: THREE.CanvasTexture; text: string } {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PLANE_WIDTH, PLANE_HEIGHT), material);
    return { mesh, texture, text: '' };
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
        ctx.fillText(line, canvas.width / 2, lineHeight * (i + 0.5), canvas.width - 8);
      }
    }
    texture.needsUpdate = true;
  }

  dispose(): void {
    this.setWorld(this.world, this.blockEntities);
  }
}
