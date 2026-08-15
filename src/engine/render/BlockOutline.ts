import * as THREE from 'three';

const OUTLINE_INFLATE = 0.002;
const CRACK_MAX_OPACITY = 0.6;

/** 准星指向方块的黑色线框 + 挖掘进度暗化。 */
export class BlockOutline {
  readonly group = new THREE.Group();
  private readonly lines: THREE.LineSegments;
  private readonly crack: THREE.Mesh;
  private readonly crackMaterial: THREE.MeshBasicMaterial;

  constructor() {
    const box = new THREE.BoxGeometry(1 + OUTLINE_INFLATE * 2, 1 + OUTLINE_INFLATE * 2, 1 + OUTLINE_INFLATE * 2);
    const edges = new THREE.EdgesGeometry(box);
    this.lines = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 }),
    );
    this.crackMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.crack = new THREE.Mesh(new THREE.BoxGeometry(1.004, 1.004, 1.004), this.crackMaterial);
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
    this.crackMaterial.opacity = progress * CRACK_MAX_OPACITY;
    this.crack.visible = progress > 0;
  }
}
