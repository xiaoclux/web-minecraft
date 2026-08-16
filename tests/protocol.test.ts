import { describe, expect, it } from 'vitest';
import {
  MAX_CHAT_BYTES,
  MessageType,
  decodeMessage,
  encodeMessage,
  type NetMessage,
} from '../src/net/protocol';

/** 编码后再解码，应当与原消息一致。 */
function roundTrip(message: NetMessage): NetMessage | null {
  return decodeMessage(encodeMessage(message));
}

describe('联机协议', () => {
  it('每种消息都能原样往返', () => {
    const messages: NetMessage[] = [
      { type: MessageType.HELLO, name: '小明' },
      { type: MessageType.MOVE, x: 1.5, y: 64, z: -2.25, yaw: 1, pitch: -0.5 },
      { type: MessageType.REQUEST_CHUNK, cx: -3, cz: 7 },
      { type: MessageType.PLACE_BLOCK, x: 10, y: -20, z: 30, blockId: 55, meta: 9 },
      { type: MessageType.BREAK_BLOCK, x: -1, y: 0, z: 1 },
      { type: MessageType.CHAT, text: '/give diamond 5' },
      {
        type: MessageType.WELCOME,
        playerId: 42,
        seed: 'seed-42',
        worldType: 'normal',
        timeTick: 12345,
        x: 0.5,
        y: 70,
        z: 0.5,
      },
      {
        type: MessageType.CHUNK_DATA,
        cx: 2,
        cz: -5,
        blocks: new Uint32Array([1, 2, 3, 4294967295]),
        meta: new Uint32Array([]),
      },
      { type: MessageType.BLOCK_CHANGE, x: 3, y: 4, z: 5, blockId: 1, meta: 0 },
      { type: MessageType.PLAYER_JOIN, playerId: 7, name: 'Steve' },
      { type: MessageType.PLAYER_LEAVE, playerId: 7 },
      { type: MessageType.PLAYER_MOVE, playerId: 7, x: -0.5, y: 5, z: 0.25, yaw: 0, pitch: 0 },
      { type: MessageType.CHAT_BROADCAST, text: '<小明> 大家好' },
      { type: MessageType.TIME_SYNC, timeTick: 999 },
    ];
    for (const message of messages) {
      expect(roundTrip(message), `type=${message.type}`).toEqual(message);
    }
  });

  it('负坐标与浮点位置不失真到影响判断', () => {
    const decoded = roundTrip({
      type: MessageType.PLAYER_MOVE,
      playerId: 1,
      x: -1234.5,
      y: 63.25,
      z: 987.75,
      yaw: -3.14,
      pitch: 1.57,
    }) as { x: number; y: number; z: number; yaw: number; pitch: number };
    expect(decoded.x).toBeCloseTo(-1234.5, 2);
    expect(decoded.y).toBeCloseTo(63.25, 2);
    expect(decoded.yaw).toBeCloseTo(-3.14, 4);
  });

  it('超长文本被截断而不是撑爆', () => {
    const long = 'x'.repeat(MAX_CHAT_BYTES * 2);
    const decoded = roundTrip({ type: MessageType.CHAT, text: long }) as { text: string };
    expect(decoded.text.length).toBe(MAX_CHAT_BYTES);
  });

  it('空包 / 未知类型 / 半截包都返回 null 而不是抛异常', () => {
    expect(decodeMessage(new Uint8Array([]))).toBeNull();
    expect(decodeMessage(new Uint8Array([200, 1, 2]))).toBeNull();
    const good = encodeMessage({ type: MessageType.BLOCK_CHANGE, x: 1, y: 2, z: 3, blockId: 4, meta: 5 });
    expect(decodeMessage(good.subarray(0, good.length - 2))).toBeNull();
    // 多余的尾巴也算坏包
    const extra = new Uint8Array(good.length + 1);
    extra.set(good);
    expect(decodeMessage(extra)).toBeNull();
  });

  it('chunk 数据可以很大而不出错', () => {
    const blocks = new Uint32Array(4096);
    for (let i = 0; i < blocks.length; i++) {
      blocks[i] = (i * 2654435761) >>> 0;
    }
    const decoded = roundTrip({
      type: MessageType.CHUNK_DATA,
      cx: 0,
      cz: 0,
      blocks,
      meta: new Uint32Array(16),
    }) as { blocks: Uint32Array };
    expect(decoded.blocks).toEqual(blocks);
  });
});
