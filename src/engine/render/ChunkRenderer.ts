import * as THREE from 'three';
import { CHUNK_SIZE } from '../constants/world';
import type { TextureAtlas } from '../textures/TextureAtlas';
import { ChunkMesher, type MeshBuffers } from '../world/ChunkMesher';
import { toChunkCoord } from '../world/Chunk';
import type { World } from '../world/World';
import { createChunkMaterials } from './ChunkMaterial';

/** 网格还不到这么多时（刚进世界）不看预算，尽快把眼前铺出来。 */
const INITIAL_BURST_MESH_COUNT = 16;
/** 离玩家这么近的脏 chunk 每帧至少重建一个（挖了方块得马上看见），不受预算限制。 */
const ALWAYS_REBUILD_DISTANCE = 1;

interface RebuildCandidate {
  key: number;
  cx: number;
  cz: number;
  dist: number;
}

interface ChunkMeshes {
  cx: number;
  cz: number;
  /** opaque / cutout / translucent 三层。 */
  layers: readonly [THREE.Mesh, THREE.Mesh, THREE.Mesh];
}

/** 管理所有 chunk 的 three.js 网格：按渲染距离加载、脏则重建。 */
export class ChunkRenderer {
  readonly group = new THREE.Group();
  readonly sharedUniforms = {
    uSkyLevel: { value: 1 },
    uMinLight: { value: 0 },
    uFogColor: { value: new THREE.Color(0x87ceeb) },
    uFogNear: { value: 60 },
    uFogFar: { value: 120 },
  };
  private readonly materials;
  private mesher: ChunkMesher;
  private readonly meshes = new Map<number, ChunkMeshes>();
  /** 本帧待重建的候选（复用数组，避免每帧分配）。 */
  private readonly candidates: RebuildCandidate[] = [];
  private renderDistance: number;
  private unsubscribeUnload: () => void;
  private lastCenterX = Number.NaN;
  private lastCenterZ = Number.NaN;

  constructor(
    private world: World,
    private readonly atlas: TextureAtlas,
    renderDistance: number,
  ) {
    this.mesher = new ChunkMesher(world, atlas);
    this.materials = createChunkMaterials(atlas.texture, this.sharedUniforms);
    this.renderDistance = renderDistance;
    this.materials.translucent.transparent = true;
    this.unsubscribeUnload = world.onChunkUnload((chunk) => this.unload(chunk.key));
  }

  /** 换一个世界渲染（切维度）：丢掉全部网格，重新订阅卸载事件。 */
  setWorld(world: World): void {
    if (world === this.world) {
      return;
    }
    this.unsubscribeUnload();
    for (const meshes of this.meshes.values()) {
      for (const m of meshes.layers) {
        m.geometry.dispose();
        this.group.remove(m);
      }
    }
    this.meshes.clear();
    this.world = world;
    // 网格全丢了，新世界里已经"干净"的 chunk 也得重建
    world.markAllDirty();
    this.mesher = new ChunkMesher(world, this.atlas);
    this.unsubscribeUnload = world.onChunkUnload((chunk) => this.unload(chunk.key));
  }

  /** 设置渲染距离。 */
  setRenderDistance(distance: number): void {
    this.renderDistance = distance;
    this.sharedUniforms.uFogFar.value = distance * CHUNK_SIZE;
    this.sharedUniforms.uFogNear.value = Math.max(8, distance * CHUNK_SIZE * 0.55);
  }

  /**
   * 每帧调用：按玩家位置显示/隐藏并重建脏 chunk。
   * 只看 world.dirtyChunks（chunk 加载 / 方块变化 / 切世界都会往里标），世界静止时这里几乎零开销。
   * @param deadline performance.now() 时间戳；由近及远重建，到点就停，剩下的下一帧继续
   */
  update(playerX: number, playerZ: number, deadline: number): void {
    const pcx = toChunkCoord(playerX);
    const pcz = toChunkCoord(playerZ);
    if (pcx !== this.lastCenterX || pcz !== this.lastCenterZ) {
      this.lastCenterX = pcx;
      this.lastCenterZ = pcz;
      this.updateVisibility(pcx, pcz);
    }
    const dirty = this.world.dirtyChunks;
    if (dirty.size === 0) {
      return;
    }
    const r = this.renderDistance;
    const candidates = this.candidates;
    candidates.length = 0;
    for (const key of dirty) {
      const chunk = this.world.getChunkByKey(key);
      if (!chunk) {
        dirty.delete(key);
        continue;
      }
      const dist = Math.max(Math.abs(chunk.cx - pcx), Math.abs(chunk.cz - pcz));
      if (dist <= r && this.world.isChunkRenderable(chunk.cx, chunk.cz)) {
        candidates.push({ key, cx: chunk.cx, cz: chunk.cz, dist });
      }
    }
    if (candidates.length === 0) {
      return;
    }
    candidates.sort((a, b) => a.dist - b.dist);
    const isBurst = this.meshes.size < INITIAL_BURST_MESH_COUNT;
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      const mustRebuild = i === 0 && c.dist <= ALWAYS_REBUILD_DISTANCE;
      if (!isBurst && !mustRebuild && performance.now() >= deadline) {
        break;
      }
      this.rebuild(c.key, c.cx, c.cz);
    }
    candidates.length = 0;
  }

  /** 玩家跨 chunk 时刷新各 chunk 网格的可见性。 */
  private updateVisibility(pcx: number, pcz: number): void {
    const r = this.renderDistance;
    for (const meshes of this.meshes.values()) {
      const inRange = Math.max(Math.abs(meshes.cx - pcx), Math.abs(meshes.cz - pcz)) <= r;
      for (const m of meshes.layers) {
        m.visible = inRange;
      }
    }
  }

  /** 释放某个 chunk 的网格（卸载时）。 */
  private unload(key: number): void {
    const meshes = this.meshes.get(key);
    if (!meshes) {
      return;
    }
    for (const m of meshes.layers) {
      this.group.remove(m);
      m.geometry.dispose();
    }
    this.meshes.delete(key);
  }

  /** 是否还有待构建的可见 chunk。 */
  get isBusy(): boolean {
    return this.world.dirtyChunks.size > 0;
  }

  private rebuild(key: number, cx: number, cz: number): void {
    const data = this.mesher.mesh(cx, cz);
    let meshes = this.meshes.get(key);
    if (!meshes) {
      const opaque = new THREE.Mesh(new THREE.BufferGeometry(), this.materials.opaque);
      const cutout = new THREE.Mesh(new THREE.BufferGeometry(), this.materials.cutout);
      const translucent = new THREE.Mesh(new THREE.BufferGeometry(), this.materials.translucent);
      translucent.renderOrder = 10;
      cutout.renderOrder = 5;
      meshes = { cx, cz, layers: [opaque, cutout, translucent] };
      const inRange = Math.max(Math.abs(cx - this.lastCenterX), Math.abs(cz - this.lastCenterZ)) <= this.renderDistance;
      for (const m of meshes.layers) {
        m.visible = inRange;
        m.frustumCulled = true;
        m.matrixAutoUpdate = false;
        this.group.add(m);
      }
      this.meshes.set(key, meshes);
    }
    this.fill(meshes.layers[0].geometry, data.opaque);
    this.fill(meshes.layers[1].geometry, data.cutout);
    this.fill(meshes.layers[2].geometry, data.translucent);
    this.world.dirtyChunks.delete(key);
  }

  private fill(geometry: THREE.BufferGeometry, buffers: MeshBuffers): void {
    // 先释放旧的 GPU 缓冲；three 只在 geometry.dispose() 时 deleteBuffer，直接换 attribute 会让旧缓冲等 GC
    geometry.dispose();
    geometry.setAttribute('position', new THREE.BufferAttribute(buffers.positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(buffers.uvs, 2));
    geometry.setAttribute('aLight', new THREE.BufferAttribute(buffers.lights, 3));
    geometry.setIndex(new THREE.BufferAttribute(buffers.indices, 1));
    // 视锥剔除只用包围球，包围盒没人读，省一遍全顶点扫描
    geometry.computeBoundingSphere();
  }

  /** 释放资源。 */
  dispose(): void {
    for (const meshes of this.meshes.values()) {
      for (const m of meshes.layers) {
        m.geometry.dispose();
      }
    }
    this.unsubscribeUnload();
    for (const mat of Object.values(this.materials)) {
      mat.dispose();
    }
    this.meshes.clear();
  }
}
