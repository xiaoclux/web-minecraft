import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/engine/blocks/BlockRegistry';
import { CHUNK_SIZE } from '../src/engine/constants/world';
import { Chunk, toChunkCoord } from '../src/engine/world/Chunk';
import { FlatGenerator } from '../src/engine/world/FlatGenerator';
import { TerrainGenerator } from '../src/engine/world/TerrainGenerator';
import { VillageGenerator, type Village } from '../src/engine/world/structures/VillageGenerator';

/** 在原点附近的格子里找一座村庄。 */
function findVillage(gen: VillageGenerator): Village {
  for (let cz = -4; cz <= 4; cz++) {
    for (let cx = -4; cx <= 4; cx++) {
      const v = gen.getVillage(cx, cz);
      if (v) {
        return v;
      }
    }
  }
  throw new Error('测试种子附近没有村庄');
}

describe('VillageGenerator', () => {
  it('同种子同格子布局一致，不同种子不同', () => {
    const a = new TerrainGenerator('village-a').villages!;
    const b = new TerrainGenerator('village-a').villages!;
    const c = new TerrainGenerator('village-c').villages!;
    const va = findVillage(a);
    const vb = b.getVillage(va.cellX, va.cellZ)!;
    expect(vb.centerX).toBe(va.centerX);
    expect(vb.pieces.map((p) => p.blocks.length)).toEqual(va.pieces.map((p) => p.blocks.length));
    const vc = c.getVillage(va.cellX, va.cellZ);
    expect(vc === null || vc.centerX !== va.centerX || vc.centerZ !== va.centerZ).toBe(true);
  });

  it('包含水井与至少 4 栋房屋，房屋互不重叠', () => {
    const v = findVillage(new TerrainGenerator('village-a').villages!);
    const houses = v.pieces.filter((p) => p.kind === 'house');
    expect(v.pieces.some((p) => p.kind === 'well')).toBe(true);
    expect(houses.length).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < houses.length; i++) {
      for (let j = i + 1; j < houses.length; j++) {
        const a = houses[i].bounds;
        const b = houses[j].bounds;
        const overlap = a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
        expect(overlap).toBe(false);
      }
    }
  });

  it('跨 chunk 的房屋在各 chunk 中拼起来与整体一致', () => {
    const gen = new FlatGenerator('flat-village', true);
    const v = findVillage(gen.villages!);
    const house = v.pieces.find(
      (p) => p.kind === 'house' && toChunkCoord(p.bounds.minX) !== toChunkCoord(p.bounds.maxX),
    );
    expect(house).toBeDefined();
    const chunks = new Map<string, Chunk>();
    for (const b of house!.blocks) {
      const cx = toChunkCoord(b.x);
      const cz = toChunkCoord(b.z);
      const key = `${cx},${cz}`;
      if (!chunks.has(key)) {
        const chunk = new Chunk(cx, cz);
        gen.generateChunk(chunk);
        chunks.set(key, chunk);
      }
    }
    // 房屋自身方块与写入 chunk 后读回的一致（其它建筑不会覆盖房屋：房屋之间留有间隙）
    let checked = 0;
    for (const b of house!.blocks) {
      const chunk = chunks.get(`${toChunkCoord(b.x)},${toChunkCoord(b.z)}`)!;
      const actual = chunk.getLocal(b.x - chunk.originX, b.y, b.z - chunk.originZ);
      if (b.id === BlockId.AIR) {
        continue;
      }
      expect(actual).toBe(b.id);
      checked++;
    }
    expect(checked).toBeGreaterThan(50);
    expect(chunks.size).toBeGreaterThan(1);
  });

  it('村庄占用的列不长树', () => {
    const terrain = new TerrainGenerator('village-a');
    const v = findVillage(terrain.villages!);
    const house = v.pieces.find((p) => p.kind === 'house')!;
    const cx = toChunkCoord(house.bounds.minX);
    const cz = toChunkCoord(house.bounds.minZ);
    for (const tree of terrain.listTrees(cx, cz)) {
      const inside =
        tree.x >= house.bounds.minX &&
        tree.x <= house.bounds.maxX &&
        tree.z >= house.bounds.minZ &&
        tree.z <= house.bounds.maxZ;
      expect(inside).toBe(false);
    }
    expect(CHUNK_SIZE).toBe(16);
  });
});
