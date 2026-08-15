import { CHUNK_GENERATE_BUDGET_PER_FRAME, LOAD_DISTANCE_EXTRA, UNLOAD_DISTANCE_EXTRA } from '../constants/world';
import { Chunk, chunkKey, toChunkCoord } from './Chunk';
import type { ChunkGenerator } from './ChunkGenerator';
import type { LightEngine } from './LightEngine';
import type { World } from './World';

/**
 * 按玩家位置流式生成 / 卸载 chunk：
 * 每帧在预算内生成最近的缺失 chunk 并点亮；把远离玩家且未被修改的 chunk 卸载（可随时确定性再生）。
 */
export class ChunkManager {
  constructor(
    private readonly world: World,
    private readonly generator: ChunkGenerator,
    private readonly light: LightEngine,
  ) {}

  /** 同步生成并点亮某方块坐标周围 radius 个 chunk（新建 / 读档 / 传送前用）。 */
  ensureLoaded(x: number, z: number, radius: number): void {
    const pcx = toChunkCoord(x);
    const pcz = toChunkCoord(z);
    for (let cz = pcz - radius; cz <= pcz + radius; cz++) {
      for (let cx = pcx - radius; cx <= pcx + radius; cx++) {
        this.loadChunk(cx, cz);
      }
    }
  }

  /** 每帧调用：按预算生成缺失 chunk，卸载过远 chunk。 */
  update(playerX: number, playerZ: number, renderDistance: number): void {
    const pcx = toChunkCoord(playerX);
    const pcz = toChunkCoord(playerZ);
    const loadRadius = renderDistance + LOAD_DISTANCE_EXTRA;
    let budget = CHUNK_GENERATE_BUDGET_PER_FRAME;
    // 由近及远逐环扫描，找到缺失的就生成
    for (let r = 0; r <= loadRadius && budget > 0; r++) {
      for (let dz = -r; dz <= r && budget > 0; dz++) {
        for (let dx = -r; dx <= r && budget > 0; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) {
            continue;
          }
          if (!this.world.chunks.has(chunkKey(pcx + dx, pcz + dz))) {
            this.loadChunk(pcx + dx, pcz + dz);
            budget--;
          }
        }
      }
    }
    const unloadRadius = renderDistance + UNLOAD_DISTANCE_EXTRA;
    for (const chunk of this.world.chunks.values()) {
      if (chunk.isModified) {
        continue;
      }
      if (Math.max(Math.abs(chunk.cx - pcx), Math.abs(chunk.cz - pcz)) > unloadRadius) {
        this.world.removeChunk(chunk.cx, chunk.cz);
      }
    }
  }

  /** 是否仍有玩家附近（渲染距离内）的 chunk 未生成。 */
  isLoading(playerX: number, playerZ: number, radius: number): boolean {
    const pcx = toChunkCoord(playerX);
    const pcz = toChunkCoord(playerZ);
    for (let cz = pcz - radius; cz <= pcz + radius; cz++) {
      for (let cx = pcx - radius; cx <= pcx + radius; cx++) {
        if (!this.world.chunks.has(chunkKey(cx, cz))) {
          return true;
        }
      }
    }
    return false;
  }

  /** 生成并点亮一个 chunk（已存在则跳过）。 */
  loadChunk(cx: number, cz: number): Chunk {
    const existing = this.world.getChunk(cx, cz);
    if (existing) {
      return existing;
    }
    const chunk = new Chunk(cx, cz);
    this.generator.generateChunk(chunk);
    this.world.addChunk(chunk);
    this.light.lightChunk(chunk);
    return chunk;
  }

  /** 把读档得到的 chunk 加入世界并点亮。 */
  addLoadedChunk(chunk: Chunk): void {
    this.world.addChunk(chunk);
    this.light.lightChunk(chunk);
  }
}
