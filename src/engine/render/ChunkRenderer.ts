import * as THREE from 'three';
import { CHUNK_SIZE, CHUNKS_X, CHUNKS_Z } from '../constants/world';
import type { TextureAtlas } from '../textures/TextureAtlas';
import { ChunkMesher, type MeshBuffers } from '../world/ChunkMesher';
import { chunkKey, type World } from '../world/World';
import { createChunkMaterials } from './ChunkMaterial';

/** 每帧最多重建的 chunk 数。 */
const MAX_REBUILDS_PER_FRAME = 3;

interface ChunkMeshes {
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

  constructor(
    private readonly world: World,
    atlas: TextureAtlas,
    renderDistance: number,
  ) {
    this.mesher = new ChunkMesher(world, atlas);
    this.materials = createChunkMaterials(atlas.texture, this.sharedUniforms);
    this.renderDistance = renderDistance;
    this.materials.translucent.transparent = true;
  }

  /** 设置渲染距离。 */
  setRenderDistance(distance: number): void {
    this.renderDistance = distance;
    this.sharedUniforms.uFogFar.value = distance * CHUNK_SIZE;
    this.sharedUniforms.uFogNear.value = Math.max(8, distance * CHUNK_SIZE * 0.55);
  }

  /** 每帧调用：按玩家位置加载/卸载并重建脏 chunk。 */
  update(playerX: number, playerZ: number): void {
    const pcx = Math.floor(playerX / CHUNK_SIZE);
    const pcz = Math.floor(playerZ / CHUNK_SIZE);
    const candidates: { key: number; cx: number; cz: number; dist: number }[] = [];
    for (let cz = 0; cz < CHUNKS_Z; cz++) {
      for (let cx = 0; cx < CHUNKS_X; cx++) {
        const dist = Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz));
        const key = chunkKey(cx, cz);
        const inRange = dist <= this.renderDistance;
        const existing = this.meshes.get(key);
        if (existing) {
          existing.opaque.visible = inRange;
          existing.cutout.visible = inRange;
          existing.translucent.visible = inRange;
        }
        if (inRange && (this.world.dirtyChunks.has(key) || !this.built.has(key))) {
          candidates.push({ key, cx, cz, dist });
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

  /** 是否还有待构建的可见 chunk。 */
  get isBusy(): boolean {
    return this.world.dirtyChunks.size > 0;
  }

  private rebuild(key: number, cx: number, cz: number): void {
    const data = this.mesher.mesh(cx, cz);
    let meshes = this.meshes.get(key);
    if (!meshes) {
      meshes = {
        opaque: new THREE.Mesh(new THREE.BufferGeometry(), this.materials.opaque),
        cutout: new THREE.Mesh(new THREE.BufferGeometry(), this.materials.cutout),
        translucent: new THREE.Mesh(new THREE.BufferGeometry(), this.materials.translucent),
      };
      meshes.translucent.renderOrder = 10;
      meshes.cutout.renderOrder = 5;
      for (const m of Object.values(meshes)) {
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
      for (const m of Object.values(meshes)) {
        m.geometry.dispose();
      }
    }
    for (const mat of Object.values(this.materials)) {
      mat.dispose();
    }
    this.meshes.clear();
  }
}
