import { describe, expect, it } from 'vitest';
import { bytesEqual } from './helpers';
import { LEGACY_WORLD_SIZE_X, LEGACY_WORLD_SIZE_Z, SAVE_FORMAT_VERSION } from '../src/engine/constants/save';
import { GameMode, Difficulty } from '../src/engine/constants/game';
import { CHUNK_VOLUME, WORLD_SIZE_Y, WorldType } from '../src/engine/constants/world';
import { migrateLegacySave, type LegacyWorldSave } from '../src/engine/save/migrate';
import { rleDecode, rleEncode } from '../src/engine/save/serialize';
import { Chunk } from '../src/engine/world/Chunk';
import { TerrainGenerator } from '../src/engine/world/TerrainGenerator';

describe('RLE 序列化', () => {
  it('往返一致', () => {
    const data = new Uint8Array([0, 0, 0, 1, 1, 2, 0, 0, 5]);
    const encoded = rleEncode(data);
    expect(Array.from(rleDecode(encoded, data.length))).toEqual(Array.from(data));
  });

  it('真实 chunk 压缩后可还原且明显变小', () => {
    const chunk = new Chunk(3, -2);
    new TerrainGenerator('save-test').generateChunk(chunk);
    const encoded = rleEncode(chunk.blocks);
    expect(encoded.byteLength).toBeLessThan(chunk.blocks.byteLength);
    const decoded = rleDecode(encoded, chunk.blocks.length);
    expect(bytesEqual(decoded, chunk.blocks)).toBe(true);
  });

  it('长度不匹配时抛错', () => {
    expect(() => rleDecode(Uint32Array.from([3, 1]), 2)).toThrow();
  });
});

describe('旧存档迁移', () => {
  it('v1 整卷方块切成 256 个 chunk 且坐标一致', () => {
    const volume = LEGACY_WORLD_SIZE_X * WORLD_SIZE_Y * LEGACY_WORLD_SIZE_Z;
    const blocks = new Uint8Array(volume);
    const index = (x: number, y: number, z: number) => (y * LEGACY_WORLD_SIZE_Z + z) * LEGACY_WORLD_SIZE_X + x;
    blocks[index(17, 5, 33)] = 7;
    blocks[index(255, 63, 255)] = 9;
    const legacy: LegacyWorldSave = {
      version: 1,
      meta: {
        id: 'w1',
        name: '旧世界',
        seed: 's',
        mode: GameMode.SURVIVAL,
        difficulty: Difficulty.NORMAL,
        createdAt: 0,
        lastPlayed: 0,
      },
      tick: 10,
      blocks: rleEncode(blocks),
      blockCount: volume,
      player: {} as LegacyWorldSave['player'],
      entities: [],
      nextEntityId: 1,
    };
    const migrated = migrateLegacySave(legacy);
    expect(migrated.version).toBe(SAVE_FORMAT_VERSION);
    expect(migrated.meta.worldType).toBe(WorldType.DEFAULT);
    expect(migrated.chunks).toHaveLength(256);
    const chunkA = migrated.chunks.find((c) => c.cx === 1 && c.cz === 2);
    expect(chunkA).toBeDefined();
    const decodedA = rleDecode(chunkA!.blocks, CHUNK_VOLUME);
    const chunkObj = new Chunk(1, 2);
    chunkObj.blocks.set(decodedA);
    expect(chunkObj.getLocal(1, 5, 1)).toBe(7);
    const chunkB = migrated.chunks.find((c) => c.cx === 15 && c.cz === 15)!;
    const objB = new Chunk(15, 15);
    objB.blocks.set(rleDecode(chunkB.blocks, CHUNK_VOLUME));
    expect(objB.getLocal(15, 63, 15)).toBe(9);
  });
});
