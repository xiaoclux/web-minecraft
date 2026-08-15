import { describe, expect, it } from 'vitest';
import { bytesEqual } from './helpers';
import { rleDecode, rleEncode } from '../src/engine/save/serialize';
import { TerrainGenerator } from '../src/engine/world/TerrainGenerator';
import { World } from '../src/engine/world/World';

describe('RLE 序列化', () => {
  it('往返一致', () => {
    const data = new Uint8Array([0, 0, 0, 1, 1, 2, 0, 0, 5]);
    const encoded = rleEncode(data);
    expect(Array.from(rleDecode(encoded, data.length))).toEqual(Array.from(data));
  });

  it('真实世界压缩后可还原且明显变小', () => {
    const world = new World();
    new TerrainGenerator('save-test').generate(world);
    const encoded = rleEncode(world.blocks);
    expect(encoded.byteLength).toBeLessThan(world.blocks.byteLength / 2);
    const decoded = rleDecode(encoded, world.blocks.length);
    expect(bytesEqual(decoded, world.blocks)).toBe(true);
  });

  it('长度不匹配时抛错', () => {
    expect(() => rleDecode(Uint32Array.from([3, 1]), 2)).toThrow();
  });
});
