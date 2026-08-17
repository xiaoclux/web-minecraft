import { Chunk } from '../src/engine/world/Chunk';
import type { ChunkGenerator } from '../src/engine/world/ChunkGenerator';
import { ChunkManager } from '../src/engine/world/ChunkManager';
import { LightEngine } from '../src/engine/world/LightEngine';
import { World } from '../src/engine/world/World';
import type { EntityContext } from '../src/engine/entities/EntityContext';
import { Player } from '../src/engine/player/Player';
import { MAX_LIGHT } from '../src/engine/constants/world';
import type { RandomTickSystem } from '../src/engine/systems/RandomTickSystem';

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

/**
 * 造一个够生物 tick 用的最小 EntityContext。
 * 只填了各测试都要的字段，缺什么用 overrides 补。
 */
export function mobContext(overrides: Partial<EntityContext> = {}): EntityContext {
  const player = new Player();
  player.setPosition(0, 64, 0);
  return {
    world: emptyWorld(0),
    player,
    random: () => 0.5,
    playSound: () => {},
    playMobSound: () => {},
    livingEntitiesNear: () => [],
    crystalsNear: () => [],
    spawnEntity: () => {},
    dropItem: () => {},
    hurtPlayer: () => {},
    onEntityKilled: () => {},
    ...overrides,
  } as unknown as EntityContext;
}

/** 在 y 层以原点为中心、±radius 范围内铺满 blockId（未加载的位置自动跳过）。 */
export function fillLayer(world: World, y: number, radius: number, blockId: number): void {
  for (let z = -radius; z <= radius; z++) {
    for (let x = -radius; x <= radius; x++) {
      world.setBlock(x, y, z, blockId);
    }
  }
}

/** 固定光照、可控随机数的 RandomTickSystem 宿主；random 可给数列（循环取）或随机函数。 */
export function randomTickHost(world: World, light = MAX_LIGHT, random: number[] | (() => number) = []) {
  let i = 0;
  const next = typeof random === 'function' ? random : () => (random.length > 0 ? random[i++ % random.length] : Math.random());
  return {
    world,
    isRaining: false,
    lightLevelAt: () => light,
    random: next,
  };
}

/** 反复对某个方块跑随机 tick 直到条件成立或超时。 */
export function runUntil(
  system: RandomTickSystem,
  pos: readonly [number, number, number],
  check: () => boolean,
  maxTicks = 2000,
): boolean {
  for (let i = 0; i < maxTicks; i++) {
    system.tickBlock(pos[0], pos[1], pos[2]);
    if (check()) {
      return true;
    }
  }
  return false;
}
