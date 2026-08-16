import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/engine/blocks/BlockRegistry';
import { Chunk } from '../src/engine/world/Chunk';
import { TerrainGenerator } from '../src/engine/world/TerrainGenerator';
import { LootTable, rollLoot } from '../src/engine/world/structures/LootTables';

/** 在一片区域里找地牢，返回统计。 */
function scan(seed: string, radius: number) {
  const gen = new TerrainGenerator(seed);
  let spawners = 0;
  let chests = 0;
  let pending = 0;
  for (let cx = -radius; cx <= radius; cx++) {
    for (let cz = -radius; cz <= radius; cz++) {
      const chunk = new Chunk(cx, cz);
      gen.generateChunk(chunk);
      pending += chunk.pendingBlockEntities.length;
      for (let y = 5; y < 60; y++) {
        for (let lz = 0; lz < 16; lz++) {
          for (let lx = 0; lx < 16; lx++) {
            const b = chunk.getLocal(lx, y, lz);
            if (b === BlockId.MOB_SPAWNER) {
              spawners++;
            }
            if (b === BlockId.CHEST) {
              chests++;
            }
          }
        }
      }
    }
  }
  return { spawners, chests, pending };
}

describe('地牢', () => {
  it('地下会生成带刷怪笼与箱子的石室', () => {
    const stats = scan('dungeon-seed', 6);
    expect(stats.spawners).toBeGreaterThan(0);
    expect(stats.chests).toBeGreaterThan(0);
    // 每个刷怪笼与箱子都留下了待补的方块实体标记
    expect(stats.pending).toBeGreaterThan(0);
  });

  it('同种子同 chunk 的地牢完全一致', () => {
    const a = new Chunk(3, -5);
    const b = new Chunk(3, -5);
    new TerrainGenerator('dungeon-seed').generateChunk(a);
    new TerrainGenerator('dungeon-seed').generateChunk(b);
    expect(a.pendingBlockEntities).toEqual(b.pendingBlockEntities);
  });

  it('关闭结构后不再生成地牢', () => {
    const gen = new TerrainGenerator('dungeon-seed', false);
    let spawners = 0;
    for (let cx = -4; cx <= 4; cx++) {
      for (let cz = -4; cz <= 4; cz++) {
        const chunk = new Chunk(cx, cz);
        gen.generateChunk(chunk);
        for (let y = 5; y < 60; y++) {
          for (let lz = 0; lz < 16; lz++) {
            for (let lx = 0; lx < 16; lx++) {
              if (chunk.getLocal(lx, y, lz) === BlockId.MOB_SPAWNER) {
                spawners++;
              }
            }
          }
        }
      }
    }
    expect(spawners).toBe(0);
  });
});

describe('战利品表', () => {
  it('掷出的东西都是表里的、数量在范围内', () => {
    let total = 0;
    for (let i = 0; i < 50; i++) {
      const loot = rollLoot(LootTable.DUNGEON, Math.random);
      total += loot.length;
      for (const stack of loot) {
        expect(stack.count).toBeGreaterThan(0);
      }
    }
    expect(total).toBeGreaterThan(0);
  });

  it('一个箱子里的种类有上限', () => {
    // 概率恒为 0 → 所有条目都命中
    const loot = rollLoot(LootTable.DESERT_TEMPLE, () => 0);
    expect(loot.length).toBeLessThanOrEqual(6);
  });
});
