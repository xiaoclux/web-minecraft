import { Chunk } from '../src/engine/world/Chunk';
import type { ChunkGenerator } from '../src/engine/world/ChunkGenerator';
import { ChunkManager } from '../src/engine/world/ChunkManager';
import { LightEngine } from '../src/engine/world/LightEngine';
import { World } from '../src/engine/world/World';

/** 比较两个类型化数组是否逐元素相等。 */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

/** 创建一个以原点为中心、半径 radius 个 chunk 的空世界（全部标记为已点亮，方便直接写光照）。 */
export function emptyWorld(radius = 4): World {
  const world = new World();
  for (let cz = -radius; cz <= radius; cz++) {
    for (let cx = -radius; cx <= radius; cx++) {
      const chunk = new Chunk(cx, cz);
      chunk.isLit = true;
      world.addChunk(chunk);
    }
  }
  return world;
}

/** 用生成器生成 [c0..c1]² 范围的 chunk 并点亮。 */
export function generateArea(generator: ChunkGenerator, c0: number, c1: number): World {
  const world = new World();
  const manager = new ChunkManager(world, generator, new LightEngine(world));
  for (let cz = c0; cz <= c1; cz++) {
    for (let cx = c0; cx <= c1; cx++) {
      manager.loadChunk(cx, cz);
    }
  }
  return world;
}

/** 收集世界中出现过的方块 id。 */
export function collectBlockIds(world: World): Set<number> {
  const ids = new Set<number>();
  for (const chunk of world.chunks.values()) {
    for (const section of chunk.sections) {
      if (!section) {
        continue;
      }
      for (const id of section.blocks) {
        ids.add(id);
      }
    }
  }
  return ids;
}
