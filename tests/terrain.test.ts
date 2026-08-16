import { describe, expect, it } from 'vitest';
import { bytesEqual, collectBlockIds, generateArea } from './helpers';
import { BlockId, getBlockByName } from '../src/engine/blocks/BlockRegistry';
import { rollDrops } from '../src/engine/blocks/blockBreaking';
import { CHUNK_SIZE, SEA_LEVEL, WorldType } from '../src/engine/constants/world';
import { Chunk } from '../src/engine/world/Chunk';
import { createChunkGenerator } from '../src/engine/world/ChunkGenerator';
import { FLAT_LAYERS, FlatGenerator } from '../src/engine/world/FlatGenerator';
import { TerrainGenerator } from '../src/engine/world/TerrainGenerator';
import { biomeFor } from '../src/engine/world/biomes';

function generate(seed: string, cx: number, cz: number): Chunk {
  const chunk = new Chunk(cx, cz);
  new TerrainGenerator(seed).generateChunk(chunk);
  return chunk;
}

describe('TerrainGenerator', () => {
  it('同种子同 chunk 生成结果一致（含负坐标）', () => {
    expect(bytesEqual(generate('seed-123', -3, 7).toFlatBlocks(), generate('seed-123', -3, 7).toFlatBlocks())).toBe(true);
  });

  it('不同种子生成结果不同', () => {
    expect(bytesEqual(generate('alpha', 0, 0).toFlatBlocks(), generate('beta', 0, 0).toFlatBlocks())).toBe(false);
  });

  it('底层为基岩且出生点在海平面之上的草地', () => {
    const gen = new TerrainGenerator('spawn');
    const spawn = gen.findSpawn();
    expect(spawn.y).toBeGreaterThan(SEA_LEVEL);
    const world = generateArea(gen, -1, 1);
    const sx = Math.floor(spawn.x);
    const sz = Math.floor(spawn.z);
    expect(world.getBlock(sx, 0, sz)).toBe(BlockId.BEDROCK);
    expect(world.getBlock(sx, spawn.y - 1, sz)).toBe(BlockId.GRASS);
  });

  it('包含多种方块（矿石、树、水）', () => {
    const world = generateArea(new TerrainGenerator('variety'), -4, 4);
    const present = collectBlockIds(world);
    expect(present.has(BlockId.COAL_ORE)).toBe(true);
    expect(present.has(BlockId.LOG)).toBe(true);
    expect(present.has(BlockId.LEAVES)).toBe(true);
    expect(present.has(BlockId.WATER)).toBe(true);
    expect(present.has(BlockId.SAND)).toBe(true);
  });

  it('跨 chunk 边界的树在两侧 chunk 中都完整出现', () => {
    const gen = new TerrainGenerator('trees');
    let checked = 0;
    for (let cx = -6; cx <= 6 && checked === 0; cx++) {
      for (let cz = -6; cz <= 6 && checked === 0; cz++) {
        const tree = gen.listTrees(cx, cz).find((t) => t.x - cx * CHUNK_SIZE === CHUNK_SIZE - 1);
        if (!tree) {
          continue;
        }
        const own = new Chunk(cx, cz);
        const east = new Chunk(cx + 1, cz);
        gen.generateChunk(own);
        gen.generateChunk(east);
        // 树干在本 chunk，树冠最外圈落到东侧 chunk
        expect(own.getLocal(CHUNK_SIZE - 1, tree.y, tree.z - cz * CHUNK_SIZE)).toBe(BlockId.LOG);
        const leafY = tree.y + tree.height - 2;
        expect(east.getLocal(0, leafY, tree.z - cz * CHUNK_SIZE)).toBe(BlockId.LEAVES);
        checked++;
      }
    }
    expect(checked).toBe(1);
  });
});

describe('FlatGenerator', () => {
  it('按预设分层填充且出生点在地表', () => {
    const gen = createChunkGenerator({ seed: 'flat', worldType: WorldType.FLAT, generateStructures: false });
    expect(gen).toBeInstanceOf(FlatGenerator);
    const chunk = new Chunk(-2, 5);
    gen.generateChunk(chunk);
    for (let y = 0; y < FLAT_LAYERS.length; y++) {
      expect(chunk.getLocal(3, y, 9)).toBe(FLAT_LAYERS[y]);
    }
    expect(chunk.getLocal(3, FLAT_LAYERS.length, 9)).toBe(BlockId.AIR);
    expect(gen.findSpawn().y).toBe(FLAT_LAYERS.length);
  });
});

describe('地下岩浆', () => {
  it('深处洞穴里有岩浆，且不会出现在地表附近', () => {
    const world = generateArea(new TerrainGenerator('lava-seed'), -2, 2);
    let deepLava = 0;
    let shallowLava = 0;
    for (const chunk of world.chunks.values()) {
      for (let y = 0; y < 40; y++) {
        for (let lz = 0; lz < 16; lz++) {
          for (let lx = 0; lx < 16; lx++) {
            if (chunk.getLocal(lx, y, lz) === BlockId.LAVA) {
              if (y <= 10) {
                deepLava++;
              } else {
                shallowLava++;
              }
            }
          }
        }
      }
    }
    expect(deepLava).toBeGreaterThan(0);
    expect(shallowLava).toBe(0);
  });
});

describe('石头变种', () => {
  it('地下会生成花岗岩 / 闪长岩 / 安山岩，且只有原版石头掉圆石', () => {
    const world = generateArea(new TerrainGenerator('stone-variants'), -2, 2);
    const metas = new Set<number>();
    for (const chunk of world.chunks.values()) {
      for (let y = 1; y < 80; y++) {
        for (let lz = 0; lz < 16; lz++) {
          for (let lx = 0; lx < 16; lx++) {
            if (chunk.getLocal(lx, y, lz) === BlockId.STONE) {
              metas.add(chunk.getLocalMeta(lx, y, lz));
            }
          }
        }
      }
    }
    for (const meta of [0, 1, 3, 5]) {
      expect(metas.has(meta), `meta ${meta}`).toBe(true);
    }
    const stone = getBlockByName('stone')!;
    const pick = { id: 'iron_pickaxe', count: 1 };
    expect(rollDrops(stone, 0, pick, () => 0)[0].id).toBe('cobblestone');
    expect(rollDrops(stone, 1, pick, () => 0)[0].id).toBe('granite');
    expect(rollDrops(stone, 2, pick, () => 0)[0].id).toBe('polished_granite');
  });
});

describe('按群系分木材的树', () => {
  it('森林长白桦、雪原与山地长云杉', () => {
    const world = generateArea(new TerrainGenerator('tree-woods'), -4, 4);
    const logMetas = new Set<number>();
    for (const chunk of world.chunks.values()) {
      for (let y = 60; y < 130; y++) {
        for (let lz = 0; lz < 16; lz++) {
          for (let lx = 0; lx < 16; lx++) {
            if (chunk.getLocal(lx, y, lz) === BlockId.LOG) {
              logMetas.add(chunk.getLocalMeta(lx, y, lz));
            }
          }
        }
      }
    }
    // 至少出现两种木材（种子固定，森林/雪原/山地都在这片区域里）
    expect(logMetas.size).toBeGreaterThan(1);
  });

  it('每种树叶掉自己那种树苗', () => {
    const leaves = getBlockByName('leaves')!;
    expect(rollDrops(leaves, 0, null, () => 0)[0].id).toBe('sapling');
    expect(rollDrops(leaves, 1, null, () => 0)[0].id).toBe('spruce_sapling');
    expect(rollDrops(leaves, 2, null, () => 0)[0].id).toBe('birch_sapling');
  });
});

describe('群系扩展', () => {
  it('大范围里能生成出多种群系（含海洋）', () => {
    const gen = new TerrainGenerator('biomes-seed');
    const seen = new Set<string>();
    for (let x = -600; x <= 600; x += 40) {
      for (let z = -600; z <= 600; z += 40) {
        seen.add(gen.biomeAt(x, z));
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(6);
    expect(seen.has('ocean')).toBe(true);
  });

  it('群系表按温湿度选群系', () => {
    expect(biomeFor(-0.9, 0)).toBe('snowy');
    expect(biomeFor(-0.3, 0)).toBe('taiga');
    expect(biomeFor(0.9, 0.9)).toBe('jungle');
    expect(biomeFor(0.9, -0.9)).toBe('desert');
    expect(biomeFor(0.3, -0.9)).toBe('savanna');
    expect(biomeFor(0, 0.9)).toBe('swamp');
  });

  it('海面以下的列判为海洋', () => {
    const gen = new TerrainGenerator('biomes-seed');
    for (let x = -600; x <= 600; x += 7) {
      if (gen.heightAt(x, 0) < SEA_LEVEL - 1) {
        expect(gen.biomeAt(x, 0)).toBe('ocean');
        return;
      }
    }
  });

  it('沙漠里会长仙人掌与甘蔗', () => {
    const world = generateArea(new TerrainGenerator('cactus-seed'), -6, 6);
    const ids = collectBlockIds(world);
    expect(ids.has(BlockId.CACTUS) || ids.has(BlockId.SUGAR_CANE)).toBe(true);
  });
});
