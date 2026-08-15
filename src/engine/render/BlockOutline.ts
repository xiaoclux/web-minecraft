import * as THREE from 'three';
import type { TextureAtlas } from '../textures/TextureAtlas';
import { DESTROY_STAGE_COUNT, destroyStageKey } from '../textures/blockTextures';

const OUTLINE_INFLATE = 0.002;
const CRACK_INFLATE = 0.004;
/** 立方体 6 面 × 4 顶点。 */
const CRACK_UV_COUNT = 24;

/** 准星指向方块的黑色线框 + Minecraft 式分阶段裂纹贴图。 */
export class BlockOutline {
  readonly group = new THREE.Group();
  private readonly lines: THREE.LineSegments;
  private readonly crack: THREE.Mesh;
  private readonly crackUvs: THREE.BufferAttribute;
  private currentStage = -1;

  constructor(private readonly atlas: TextureAtlas) {
    const box = new THREE.BoxGeometry(1 + OUTLINE_INFLATE * 2, 1 + OUTLINE_INFLATE * 2, 1 + OUTLINE_INFLATE * 2);
    const edges = new THREE.EdgesGeometry(box);
    this.lines = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 }),
    );
    const crackMaterial = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const crackGeometry = new THREE.BoxGeometry(1 + CRACK_INFLATE, 1 + CRACK_INFLATE, 1 + CRACK_INFLATE);
    this.crackUvs = new THREE.BufferAttribute(new Float32Array(CRACK_UV_COUNT * 2), 2);
    crackGeometry.setAttribute('uv', this.crackUvs);
    this.crack = new THREE.Mesh(crackGeometry, crackMaterial);
    this.crack.renderOrder = 20;
    this.group.add(this.lines, this.crack);
    this.group.visible = false;
  }

  /** 设置目标方块与挖掘进度（null 隐藏）。 */
  set(target: { x: number; y: number; z: number } | null, progress: number): void {
    if (!target) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    this.group.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
    if (progress <= 0) {
      this.crack.visible = false;
      return;
    }
    this.crack.visible = true;
    const stage = Math.min(DESTROY_STAGE_COUNT - 1, Math.floor(progress * DESTROY_STAGE_COUNT));
    if (stage !== this.currentStage) {
      this.applyStage(stage);
    }
  }

  private applyStage(stage: number): void {
    this.currentStage = stage;
    const region = this.atlas.region(destroyStageKey(stage));
    const arr = this.crackUvs.array as Float32Array;
    // BoxGeometry 每个面的 uv 顺序为 (0,1) (1,1) (0,0) (1,0)
    for (let face = 0; face < CRACK_UV_COUNT / 4; face++) {
      const o = face * 8;
      arr[o] = region.u0;
      arr[o + 1] = region.v1;
      arr[o + 2] = region.u1;
      arr[o + 3] = region.v1;
      arr[o + 4] = region.u0;
      arr[o + 5] = region.v0;
      arr[o + 6] = region.u1;
      arr[o + 7] = region.v0;
    }
    this.crackUvs.needsUpdate = true;
  }
}
