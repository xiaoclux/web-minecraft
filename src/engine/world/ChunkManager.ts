import { LOAD_DISTANCE_EXTRA, UNLOAD_DISTANCE_EXTRA } from '../constants/world';
import { Chunk, toChunkCoord } from './Chunk';
import type { ChunkGenerator } from './ChunkGenerator';
import type { LightEngine } from './LightEngine';
import type { World } from './World';

/** 点亮后需要重建网格的邻域半径（邻居朝向新 chunk 的面 + 光照溢出）。 */
const DIRTY_RADIUS_AFTER_LOAD = 1;

/**
 * 按玩家位置流式生成 / 卸载 chunk：
 * 每帧在时间预算内由近及远生成缺失的 chunk 并点亮；把远离玩家且未被修改的 chunk 卸载（可随时确定性再生）。
 */
export class ChunkManager {
  /** 上次扫描时玩家所在 chunk；加载区完整时可跳过扫描。 */
  private lastCenterX = Number.NaN;
  private lastCenterZ = Number.NaN;
  private isAreaComplete = false;

  constructor(
    private readonly world: World,
    private readonly generator: ChunkGenerator,
    private readonly light: LightEngine,
  ) {
    world.onChunkUnload(() => {
      this.isAreaComplete = false;
    });
  }

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

  /**
   * 每帧调用：生成缺失 chunk，卸载过远 chunk。
   * @param deadline performance.now() 时间戳；到点就停（一个 chunk 生成不可拆分，所以是"开工前看表"）
   */
  update(playerX: number, playerZ: number, renderDistance: number, deadline: number): void {
    const pcx = toChunkCoord(playerX);
    const pcz = toChunkCoord(playerZ);
    if (pcx !== this.lastCenterX || pcz !== this.lastCenterZ) {
      this.lastCenterX = pcx;
      this.lastCenterZ = pcz;
      this.isAreaComplete = false;
      this.unloadFar(pcx, pcz, renderDistance + UNLOAD_DISTANCE_EXTRA);
    }
    if (this.isAreaComplete) {
      return;
    }
    const loadRadius = renderDistance + LOAD_DISTANCE_EXTRA;
    // 由近及远逐环扫描（只走环的周长），找到缺失的就生成，直到用完预算
    for (let r = 0; r <= loadRadius; r++) {
      if (!this.loadRing(pcx, pcz, r, deadline)) {
        return;
      }
    }
    this.isAreaComplete = true;
  }

  /** 加载半径 r 的一环；预算耗尽返回 false。 */
  private loadRing(pcx: number, pcz: number, r: number, deadline: number): boolean {
    const step = r === 0 ? 1 : 2 * r;
    for (let dz = -r; dz <= r; dz++) {
      // 上下两条边全走，中间行只走左右两端
      const inner = dz !== -r && dz !== r;
      for (let dx = -r; dx <= r; dx += inner ? step : 1) {
        if (this.world.hasChunk(pcx + dx, pcz + dz)) {
          continue;
        }
        if (performance.now() >= deadline) {
          return false;
        }
        this.loadChunk(pcx + dx, pcz + dz);
      }
    }
    return true;
  }

  private unloadFar(pcx: number, pcz: number, unloadRadius: number): void {
    for (const chunk of this.world.chunks.values()) {
      if (chunk.isModified) {
        continue;
      }
      if (Math.max(Math.abs(chunk.cx - pcx), Math.abs(chunk.cz - pcz)) > unloadRadius) {
        this.world.removeChunk(chunk.cx, chunk.cz);
      }
    }
  }

  /** 生成并点亮一个 chunk（已存在则跳过）。 */
  loadChunk(cx: number, cz: number): Chunk {
    const existing = this.world.getChunk(cx, cz);
    if (existing) {
      return existing;
    }
    const chunk = new Chunk(cx, cz, this.world.hasSkyLight);
    this.generator.generateChunk(chunk);
    this.addLoadedChunk(chunk);
    return chunk;
  }

  /** 把（生成或读档得到的）chunk 加入世界、点亮并标脏邻域。 */
  addLoadedChunk(chunk: Chunk): void {
    this.world.addChunk(chunk);
    this.light.lightChunk(chunk);
    this.world.markDirtyRadius(chunk.cx, chunk.cz, DIRTY_RADIUS_AFTER_LOAD);
    this.isAreaComplete = false;
  }
}
