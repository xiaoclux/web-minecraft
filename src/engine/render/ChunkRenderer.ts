import * as THREE from 'three';
import { CHUNK_SIZE } from '../constants/world';
import type { TextureAtlas } from '../textures/TextureAtlas';
import { ChunkMesher, type MeshBuffers } from '../world/ChunkMesher';
import { chunkKey, toChunkCoord } from '../world/Chunk';
import type { World } from '../world/World';
import { createChunkMaterials } from './ChunkMaterial';

/** 每帧最多重建的 chunk 数。 */
const MAX_REBUILDS_PER_FRAME = 3;

interface ChunkMeshes {
  cx: number;
  cz: number;
  opaque: THREE.Mesh;
  cutout: THREE.Mesh;
  translucent: THREE.Mesh;
}

/** 管理所有 chunk 的 three.js 网格：按渲染距离加载、脏则重建。 */
export class ChunkRenderer {
  readonly group = new THREE.Group();
  readonly sharedUniforms = {
    uSkyLevel: { value: 1 },
    uFogColor: { value: new THREE.Color(0x87ceeb) },
    uFogNear: { value: 60 },
    uFogFar: { value: 120 },
  };
  private readonly materials;
  private readonly mesher: ChunkMesher;
  private readonly meshes = new Map<number, ChunkMeshes>();
  /** 已构建过网格的 chunk。 */
  private readonly built = new Set<number>();
  private renderDistance: number;
  private readonly unsubscribeUnload: () => void;

  constructor(
    private readonly world: World,
    atlas: TextureAtlas,
    renderDistance: number,
  ) {
    this.mesher = new ChunkMesher(world, atlas);
    this.materials = createChunkMaterials(atlas.texture, this.sharedUniforms);
    this.renderDistance = renderDistance;
    this.materials.translucent.transparent = true;
    this.unsubscribeUnload = world.onChunkUnload((chunk) => this.unload(chunk.key));
  }

  /** 设置渲染距离。 */
  setRenderDistance(distance: number): void {
    this.renderDistance = distance;
    this.sharedUniforms.uFogFar.value = distance * CHUNK_SIZE;
    this.sharedUniforms.uFogNear.value = Math.max(8, distance * CHUNK_SIZE * 0.55);
  }

  /** 每帧调用：按玩家位置显示/隐藏并重建脏 chunk。 */
  update(playerX: number, playerZ: number): void {
    const pcx = toChunkCoord(playerX);
    const pcz = toChunkCoord(playerZ);
    const r = this.renderDistance;
    const candidates: { key: number; cx: number; cz: number; dist: number }[] = [];
    for (const meshes of this.meshes.values()) {
      const inRange = Math.max(Math.abs(meshes.cx - pcx), Math.abs(meshes.cz - pcz)) <= r;
      meshes.opaque.visible = inRange;
      meshes.cutout.visible = inRange;
      meshes.translucent.visible = inRange;
    }
    for (let cz = pcz - r; cz <= pcz + r; cz++) {
      for (let cx = pcx - r; cx <= pcx + r; cx++) {
        const key = chunkKey(cx, cz);
        const needsBuild = this.world.dirtyChunks.has(key) || !this.built.has(key);
        if (needsBuild && this.canBuild(cx, cz)) {
          candidates.push({ key, cx, cz, dist: Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)) });
        }
      }
    }
    candidates.sort((a, b) => a.dist - b.dist);
    const limit = this.built.size < 16 ? MAX_REBUILDS_PER_FRAME * 4 : MAX_REBUILDS_PER_FRAME;
    for (let i = 0; i < Math.min(limit, candidates.length); i++) {
      const c = candidates[i];
      this.rebuild(c.key, c.cx, c.cz);
    }
  }

  /** chunk 已点亮且四邻已加载才建网格，避免在未加载边界留下缝隙。 */
  private canBuild(cx: number, cz: number): boolean {
    const chunk = this.world.getChunk(cx, cz);
    if (!chunk || !chunk.isLit) {
      return false;
    }
    return (
      this.world.getChunk(cx - 1, cz) !== null &&
      this.world.getChunk(cx + 1, cz) !== null &&
      this.world.getChunk(cx, cz - 1) !== null &&
      this.world.getChunk(cx, cz + 1) !== null
    );
  }

  /** 释放某个 chunk 的网格（卸载时）。 */
  private unload(key: number): void {
    const meshes = this.meshes.get(key);
    if (!meshes) {
      this.built.delete(key);
      return;
    }
    for (const m of [meshes.opaque, meshes.cutout, meshes.translucent]) {
      this.group.remove(m);
      m.geometry.dispose();
    }
    this.meshes.delete(key);
    this.built.delete(key);
  }

  /** 是否还有待构建的可见 chunk。 */
  get isBusy(): boolean {
    return this.world.dirtyChunks.size > 0;
  }

  private rebuild(key: number, cx: number, cz: number): void {
    const data = this.mesher.mesh(cx, cz);
    let meshes = this.meshes.get(key);
    if (!meshes) {
      meshes = {
        cx,
        cz,
        opaque: new THREE.Mesh(new THREE.BufferGeometry(), this.materials.opaque),
        cutout: new THREE.Mesh(new THREE.BufferGeometry(), this.materials.cutout),
        translucent: new THREE.Mesh(new THREE.BufferGeometry(), this.materials.translucent),
      };
      meshes.translucent.renderOrder = 10;
      meshes.cutout.renderOrder = 5;
      for (const m of [meshes.opaque, meshes.cutout, meshes.translucent]) {
        m.frustumCulled = true;
        m.matrixAutoUpdate = false;
        this.group.add(m);
      }
      this.meshes.set(key, meshes);
    }
    this.fill(meshes.opaque.geometry, data.opaque);
    this.fill(meshes.cutout.geometry, data.cutout);
    this.fill(meshes.translucent.geometry, data.translucent);
    this.world.dirtyChunks.delete(key);
    this.built.add(key);
  }

  private fill(geometry: THREE.BufferGeometry, buffers: MeshBuffers): void {
    geometry.setAttribute('position', new THREE.BufferAttribute(buffers.positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(buffers.uvs, 2));
    geometry.setAttribute('aLight', new THREE.BufferAttribute(buffers.lights, 3));
    geometry.setIndex(new THREE.BufferAttribute(buffers.indices, 1));
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
  }

  /** 释放资源。 */
  dispose(): void {
    for (const meshes of this.meshes.values()) {
      for (const m of [meshes.opaque, meshes.cutout, meshes.translucent]) {
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
