import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/engine/blocks/BlockRegistry';
import { DIMENSION_DEFS, isDimensionId } from '../src/engine/world/Dimension';
import { EndGenerator, END_ISLAND_SURFACE_Y, OBSIDIAN_PILLAR_COUNT } from '../src/engine/world/EndGenerator';
import { NetherGenerator, NETHER_HEIGHT, NETHER_LAVA_LEVEL } from '../src/engine/world/NetherGenerator';
import { NetherFortressGenerator } from '../src/engine/world/structures/NetherFortressGenerator';
import { Chunk } from '../src/engine/world/Chunk';
import { World } from '../src/engine/world/World';
import { PORTAL_AXIS_X, mapCoordinate, tryLightPortal } from '../src/engine/systems/PortalSystem';

function generate(generator: { generateChunk(c: Chunk): void }, cx: number, cz: number, hasSkyLight = false): Chunk {
  const chunk = new Chunk(cx, cz, hasSkyLight);
  generator.generateChunk(chunk);
  return chunk;
}

describe('维度定义', () => {
  it('下界没有天空光、有 1:8 坐标比例', () => {
    expect(DIMENSION_DEFS.nether.hasSkyLight).toBe(false);
    expect(DIMENSION_DEFS.nether.coordinateScale).toBe(8);
    expect(DIMENSION_DEFS.overworld.hasSkyLight).toBe(true);
    expect(isDimensionId('nether')).toBe(true);
    expect(isDimensionId('moon')).toBe(false);
  });

  it('只有主世界能睡床、只有下界会蒸发水', () => {
    expect(DIMENSION_DEFS.overworld.bedExplodes).toBe(false);
    expect(DIMENSION_DEFS.nether.bedExplodes).toBe(true);
    expect(DIMENSION_DEFS.end.bedExplodes).toBe(true);
    expect(DIMENSION_DEFS.nether.waterEvaporates).toBe(true);
    expect(DIMENSION_DEFS.overworld.waterEvaporates).toBe(false);
    expect(DIMENSION_DEFS.end.waterEvaporates).toBe(false);
  });

  it('无天空光的世界读到的天空光恒为 0', () => {
    const dark = new World(false);
    const bright = new World(true);
    expect(dark.getSkyLight(0, 100, 0)).toBe(0);
    expect(bright.getSkyLight(0, 100, 0)).toBeGreaterThan(0);
  });

  it('主世界 ↔ 下界坐标按 1:8 换算', () => {
    const over = DIMENSION_DEFS.overworld;
    const nether = DIMENSION_DEFS.nether;
    expect(mapCoordinate(800, over, nether)).toBe(100);
    expect(mapCoordinate(100, nether, over)).toBe(800);
    expect(mapCoordinate(-8, over, nether)).toBe(-1);
  });
});

describe('下界地形', () => {
  const generator = new NetherGenerator('seed-a');

  it('上下都是基岩，岩浆海以下没有空气', () => {
    const chunk = generate(generator, 0, 0);
    expect(chunk.getLocal(8, 0, 8)).toBe(BlockId.BEDROCK);
    expect(chunk.getLocal(8, NETHER_HEIGHT - 1, 8)).toBe(BlockId.BEDROCK);
    for (let y = 6; y <= NETHER_LAVA_LEVEL; y++) {
      expect(chunk.getLocal(8, y, 8)).not.toBe(BlockId.AIR);
    }
  });

  it('生成了地狱岩与空洞，且同种子同 chunk 结果一致', () => {
    const a = generate(generator, 3, -2);
    const b = generate(new NetherGenerator('seed-a'), 3, -2);
    let netherrack = 0;
    let air = 0;
    for (let y = 10; y < NETHER_HEIGHT - 10; y++) {
      for (let lz = 0; lz < 16; lz++) {
        for (let lx = 0; lx < 16; lx++) {
          const id = a.getLocal(lx, y, lz);
          if (id === BlockId.NETHERRACK) netherrack++;
          if (id === BlockId.AIR) air++;
          expect(b.getLocal(lx, y, lz)).toBe(id);
        }
      }
    }
    expect(netherrack).toBeGreaterThan(0);
    expect(air).toBeGreaterThan(0);
  });
});

describe('末地地形', () => {
  const generator = new EndGenerator('seed-a');

  it('主岛中心有末地石、远处是虚空', () => {
    const center = generate(generator, 0, 0);
    expect(center.getLocal(0, END_ISLAND_SURFACE_Y, 0)).toBe(BlockId.END_STONE);
    const far = generate(generator, 40, 40);
    let solid = 0;
    for (let y = 0; y < 128; y++) for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
      if (far.getLocal(lx, y, lz) !== BlockId.AIR) solid++;
    }
    expect(solid).toBe(0);
  });

  it('十根黑曜石柱都在岛上且高度不同', () => {
    expect(generator.pillars.length).toBe(OBSIDIAN_PILLAR_COUNT);
    const heights = new Set(generator.pillars.map((p) => p.topY));
    expect(heights.size).toBeGreaterThan(1);
    for (const pillar of generator.pillars) {
      expect(pillar.topY).toBeGreaterThan(END_ISLAND_SURFACE_Y);
    }
  });
});

describe('传送门框架', () => {
  function buildFrame(world: World, x: number, y: number, z: number): void {
    for (let i = -1; i <= 2; i++) {
      world.setBlock(x + i, y - 1, z, BlockId.OBSIDIAN);
      world.setBlock(x + i, y + 3, z, BlockId.OBSIDIAN);
    }
    for (let j = 0; j < 3; j++) {
      world.setBlock(x - 1, y + j, z, BlockId.OBSIDIAN);
      world.setBlock(x + 2, y + j, z, BlockId.OBSIDIAN);
    }
  }

  function loadedWorld(): World {
    const world = new World(true);
    for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) {
      const chunk = new Chunk(cx, cz, true);
      world.addChunk(chunk);
    }
    return world;
  }

  it('合法框架能点燃，内部填满传送门方块', () => {
    const world = loadedWorld();
    buildFrame(world, 4, 10, 4);
    expect(tryLightPortal(world, 4, 10, 4)).toBe(true);
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 2; i++) {
        expect(world.getBlock(4 + i, 10 + j, 4)).toBe(BlockId.NETHER_PORTAL);
        expect(world.getMeta(4 + i, 10 + j, 4)).toBe(PORTAL_AXIS_X);
      }
    }
  });

  it('缺一块黑曜石就点不着', () => {
    const world = loadedWorld();
    buildFrame(world, 4, 10, 4);
    world.setBlock(4, 9, 4, BlockId.AIR);
    expect(tryLightPortal(world, 4, 10, 4)).toBe(false);
  });
});

describe('下界要塞', () => {
  it('要塞格子里能找到要塞，且桥与塔用的是下界砖', () => {
    const generator = new NetherGenerator('fortress-seed', true);
    const fortresses = new NetherFortressGenerator('fortress-seed');
    // 找一个有要塞的格子
    let found: { cellX: number; cellZ: number; fortress: NonNullable<ReturnType<typeof fortresses.getFortress>> } | null = null;
    for (let cellX = 0; cellX < 6 && !found; cellX++) {
      for (let cellZ = 0; cellZ < 6 && !found; cellZ++) {
        const fortress = fortresses.getFortress(cellX, cellZ);
        if (fortress) {
          found = { cellX, cellZ, fortress };
        }
      }
    }
    expect(found).not.toBeNull();
    const { fortress } = found!;
    const cx = Math.floor(fortress.centerX / 16);
    const cz = Math.floor(fortress.centerZ / 16);
    const chunk = generate(generator, cx, cz);
    let bricks = 0;
    let spawners = 0;
    for (let y = fortress.y - 4; y <= fortress.y + 14; y++) {
      for (let lz = 0; lz < 16; lz++) {
        for (let lx = 0; lx < 16; lx++) {
          const id = chunk.getLocal(lx, y, lz);
          if (id === BlockId.NETHER_BRICKS) bricks++;
          if (id === BlockId.MOB_SPAWNER) spawners++;
        }
      }
    }
    expect(bricks).toBeGreaterThan(50);
    expect(spawners).toBe(1);
    expect(chunk.pendingBlockEntities.some((e) => e.spawns === 'blaze')).toBe(true);
  });

  it('同种子的要塞位置固定', () => {
    const a = new NetherFortressGenerator('same');
    const b = new NetherFortressGenerator('same');
    for (let i = 0; i < 5; i++) {
      expect(a.getFortress(i, 0)).toEqual(b.getFortress(i, 0));
    }
  });
});
