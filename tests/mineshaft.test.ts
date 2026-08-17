import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/engine/blocks/BlockRegistry';
import { CHUNK_SIZE } from '../src/engine/constants/world';
import { MobType } from '../src/engine/entities/MobDefs';
import { Chunk } from '../src/engine/world/Chunk';
import { MineshaftGenerator } from '../src/engine/world/structures/MineshaftGenerator';

/** 扫一片 chunk，统计矿井里的各种方块。 */
function scan(generator: MineshaftGenerator, span: number) {
  const counts = { rail: 0, fence: 0, planks: 0, cobweb: 0, chest: 0, spawner: 0, air: 0 };
  const spawnerMobs: string[] = [];
  for (let cx = 0; cx < span; cx++) {
    for (let cz = 0; cz < span; cz++) {
      // 先铺满石头，这样"被掏空的巷道"才数得出来
      const chunk = new Chunk(cx, cz, true);
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          for (let y = 10; y < 50; y++) {
            chunk.setLocal(lx, y, lz, BlockId.STONE);
          }
        }
      }
      generator.placeInChunk(chunk);
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          for (let y = 10; y < 50; y++) {
            const id = chunk.getLocal(lx, y, lz);
            if (id === BlockId.RAIL) counts.rail++;
            else if (id === BlockId.FENCE) counts.fence++;
            else if (id === BlockId.PLANKS) counts.planks++;
            else if (id === BlockId.COBWEB) counts.cobweb++;
            else if (id === BlockId.CHEST) counts.chest++;
            else if (id === BlockId.MOB_SPAWNER) counts.spawner++;
            else if (id === BlockId.AIR) counts.air++;
          }
        }
      }
      for (const pending of chunk.pendingBlockEntities) {
        if (pending.spawns) {
          spawnerMobs.push(pending.spawns);
        }
      }
    }
  }
  return { counts, spawnerMobs };
}

describe('废弃矿井', () => {
  it('会挖出带铁轨与木支撑的巷道', () => {
    const { counts } = scan(new MineshaftGenerator('mineshaft-seed'), 24);
    expect(counts.air).toBeGreaterThan(0);
    expect(counts.rail).toBeGreaterThan(0);
    expect(counts.planks).toBeGreaterThan(0);
    expect(counts.fence).toBeGreaterThan(0);
  });

  it('刷怪笼刷的是洞穴蜘蛛', () => {
    const { spawnerMobs } = scan(new MineshaftGenerator('mineshaft-spawner'), 24);
    for (const mob of spawnerMobs) {
      expect(mob).toBe(MobType.CAVE_SPIDER);
    }
  });

  it('同一个种子生成的结果完全一致', () => {
    const a = scan(new MineshaftGenerator('same-seed'), 6);
    const b = scan(new MineshaftGenerator('same-seed'), 6);
    expect(a.counts).toEqual(b.counts);
  });
});
