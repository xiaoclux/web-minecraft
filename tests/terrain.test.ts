import { describe, expect, it } from 'vitest';
import { bytesEqual } from './helpers';
import { BlockId } from '../src/engine/blocks/BlockRegistry';
import { SEA_LEVEL } from '../src/engine/constants/world';
import { TerrainGenerator } from '../src/engine/world/TerrainGenerator';
import { World } from '../src/engine/world/World';

describe('TerrainGenerator', () => {
  it('同种子生成结果一致', () => {
    const a = new World();
    const b = new World();
    new TerrainGenerator('seed-123').generate(a);
    new TerrainGenerator('seed-123').generate(b);
    expect(bytesEqual(a.blocks, b.blocks)).toBe(true);
  });

  it('不同种子生成结果不同', () => {
    const a = new World();
    const b = new World();
    new TerrainGenerator('alpha').generate(a);
    new TerrainGenerator('beta').generate(b);
    expect(bytesEqual(a.blocks, b.blocks)).toBe(false);
  });

  it('底层为基岩且出生点在海平面之上的草地', () => {
    const world = new World();
    const gen = new TerrainGenerator('spawn');
    gen.generate(world);
    expect(world.getBlock(100, 0, 100)).toBe(BlockId.BEDROCK);
    const spawn = gen.findSpawn(world);
    expect(spawn.y).toBeGreaterThan(SEA_LEVEL);
    expect(world.getBlock(Math.floor(spawn.x), spawn.y - 1, Math.floor(spawn.z))).toBe(BlockId.GRASS);
  });

  it('包含多种方块（矿石、树、水）', () => {
    const world = new World();
    new TerrainGenerator('variety').generate(world);
    const present = new Set<number>(world.blocks);
    expect(present.has(BlockId.COAL_ORE)).toBe(true);
    expect(present.has(BlockId.LOG)).toBe(true);
    expect(present.has(BlockId.LEAVES)).toBe(true);
    expect(present.has(BlockId.WATER)).toBe(true);
    expect(present.has(BlockId.SAND)).toBe(true);
  });
});
