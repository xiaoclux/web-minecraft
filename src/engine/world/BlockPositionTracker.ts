import { CHUNK_SIZE } from '../constants/world';
import type { Chunk } from './Chunk';
import { packPos, unpackPos } from './posKey';
import type { World } from './World';

/**
 * 跟踪某一种方块在已加载世界里的全部位置。
 * 火、日光传感器这类"要按自己的节奏更新、但随机 tick 抽不到"的方块用它维护位置集合：
 * 订阅方块变更做增量维护，chunk 加载 / 卸载时整块扫描 / 清理，读档回来的方块也不会漏。
 */
export class BlockPositionTracker {
  /** 位置集合（packPos 打包的数字键）。 */
  readonly positions = new Set<number>();
  private readonly posOut = [0, 0, 0];

  constructor(world: World, private readonly blockId: number) {
    world.onBlockChange((x, y, z, oldId, newId) => this.track(x, y, z, oldId, newId));
    world.onBatchChange((changes) => {
      for (const c of changes) {
        this.track(c.x, c.y, c.z, c.oldId, c.newId);
      }
    });
    world.onChunkLoad((chunk) => this.scanChunk(chunk));
    world.onChunkUnload((chunk) => this.forgetChunk(chunk));
    // 构造时世界里可能已经有 chunk（读档、或系统在世界之后创建）
    for (const chunk of world.chunks.values()) {
      this.scanChunk(chunk);
    }
  }

  get size(): number {
    return this.positions.size;
  }

  private track(x: number, y: number, z: number, oldId: number, newId: number): void {
    if (newId === this.blockId) {
      this.positions.add(packPos(x, y, z));
    } else if (oldId === this.blockId) {
      this.positions.delete(packPos(x, y, z));
    }
  }

  private scanChunk(chunk: Chunk): void {
    const x0 = chunk.cx * CHUNK_SIZE;
    const z0 = chunk.cz * CHUNK_SIZE;
    for (const section of chunk.sections) {
      if (!section) {
        continue;
      }
      const blocks = section.blocks;
      for (let i = 0; i < blocks.length; i++) {
        if (blocks[i] !== this.blockId) {
          continue;
        }
        // 段内索引 = (ly * 16 + lz) * 16 + lx，见 sectionIndex
        const lx = i % CHUNK_SIZE;
        const lz = Math.floor(i / CHUNK_SIZE) % CHUNK_SIZE;
        const ly = Math.floor(i / (CHUNK_SIZE * CHUNK_SIZE));
        this.positions.add(packPos(x0 + lx, section.baseY + ly, z0 + lz));
      }
    }
  }

  private forgetChunk(chunk: Chunk): void {
    // 集合通常远小于一个 chunk 的 65536 格，反过来筛现有键更便宜
    for (const key of this.positions) {
      unpackPos(key, this.posOut);
      if (chunk.containsColumn(this.posOut[0], this.posOut[2])) {
        this.positions.delete(key);
      }
    }
  }
}
