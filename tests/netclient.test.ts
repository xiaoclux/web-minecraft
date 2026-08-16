import { describe, expect, it, vi } from 'vitest';
import { NetClient, type ClientTransport, type NetClientHandlers } from '../src/net/NetClient';
import { MessageType, decodeMessage, encodeMessage, type NetMessage } from '../src/net/protocol';

/** 直接把两端接在一起的假传输。 */
class FakeTransport implements ClientTransport {
  readonly sent: NetMessage[] = [];
  private messageHandler: ((bytes: Uint8Array) => void) | null = null;
  private closeHandler: (() => void) | null = null;
  closed = false;

  send(bytes: Uint8Array): void {
    const message = decodeMessage(bytes);
    if (message) {
      this.sent.push(message);
    }
  }

  close(): void {
    this.closed = true;
  }

  onMessage(handler: (bytes: Uint8Array) => void): void {
    this.messageHandler = handler;
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler;
  }

  /** 模拟服务端发来一条消息。 */
  deliver(message: NetMessage): void {
    this.messageHandler?.(encodeMessage(message));
  }

  /** 模拟断线。 */
  dropConnection(): void {
    this.closeHandler?.();
  }
}

function setup(): { transport: FakeTransport; client: NetClient; handlers: NetClientHandlers } {
  const transport = new FakeTransport();
  const handlers: NetClientHandlers = {
    onWelcome: vi.fn(),
    onChunkData: vi.fn(),
    onBlockChange: vi.fn(),
    onChat: vi.fn(),
    onTimeSync: vi.fn(),
    onPlayersChanged: vi.fn(),
    onDisconnect: vi.fn(),
  };
  const client = new NetClient(transport, handlers, '小明');
  return { transport, client, handlers };
}

describe('联机客户端', () => {
  it('创建时先报上名字', () => {
    const { transport } = setup();
    expect(transport.sent[0]).toEqual({ type: MessageType.HELLO, name: '小明' });
  });

  it('收到 WELCOME 后记住自己的 id', () => {
    const { transport, client, handlers } = setup();
    transport.deliver({
      type: MessageType.WELCOME,
      playerId: 7,
      seed: 's',
      worldType: 'normal',
      timeTick: 100,
      x: 0,
      y: 64,
      z: 0,
    });
    expect(client.playerId).toBe(7);
    expect(handlers.onWelcome).toHaveBeenCalled();
  });

  it('维护其他玩家的列表与位置', () => {
    const { transport, client } = setup();
    transport.deliver({ type: MessageType.PLAYER_JOIN, playerId: 2, name: '小红' });
    expect(client.remotePlayers.map((p) => p.name)).toEqual(['小红']);
    transport.deliver({ type: MessageType.PLAYER_MOVE, playerId: 2, x: 5, y: 64, z: -3, yaw: 1, pitch: 0 });
    expect(client.remotePlayers[0].x).toBe(5);
    expect(client.remotePlayers[0].z).toBe(-3);
    transport.deliver({ type: MessageType.PLAYER_LEAVE, playerId: 2 });
    expect(client.remotePlayers).toEqual([]);
  });

  it('不认识的玩家移动不会凭空造出一个玩家', () => {
    const { transport, client } = setup();
    transport.deliver({ type: MessageType.PLAYER_MOVE, playerId: 99, x: 1, y: 1, z: 1, yaw: 0, pitch: 0 });
    expect(client.remotePlayers).toEqual([]);
  });

  it('方块变更与 chunk 数据交给上层处理', () => {
    const { transport, handlers } = setup();
    transport.deliver({ type: MessageType.BLOCK_CHANGE, x: 1, y: 2, z: 3, blockId: 4, meta: 5 });
    expect(handlers.onBlockChange).toHaveBeenCalledWith(1, 2, 3, 4, 5);
    transport.deliver({
      type: MessageType.CHUNK_DATA,
      cx: 1,
      cz: 2,
      blocks: new Uint32Array([9]),
      meta: new Uint32Array([]),
    });
    expect(handlers.onChunkData).toHaveBeenCalled();
  });

  it('挖 / 放 / 聊天都只是发意图', () => {
    const { transport, client } = setup();
    transport.sent.length = 0;
    client.requestPlace(1, 2, 3, 4, 5);
    client.requestBreak(6, 7, 8);
    client.sendChat('你好');
    client.requestChunk(-1, 2);
    expect(transport.sent.map((m) => m.type)).toEqual([
      MessageType.PLACE_BLOCK,
      MessageType.BREAK_BLOCK,
      MessageType.CHAT,
      MessageType.REQUEST_CHUNK,
    ]);
  });

  it('断线后不再发消息，并通知上层', () => {
    const { transport, client, handlers } = setup();
    transport.dropConnection();
    expect(handlers.onDisconnect).toHaveBeenCalled();
    expect(client.isConnected).toBe(false);
    transport.sent.length = 0;
    client.sendChat('还在吗');
    expect(transport.sent).toEqual([]);
  });

  it('坏包不会让客户端崩掉', () => {
    const { transport, handlers } = setup();
    transport.deliver({ type: MessageType.TIME_SYNC, timeTick: 5 });
    expect(handlers.onTimeSync).toHaveBeenCalledWith(5);
    // 直接塞一段乱字节
    (transport as unknown as { messageHandler: (b: Uint8Array) => void }).messageHandler?.(new Uint8Array([250, 1]));
    expect(handlers.onTimeSync).toHaveBeenCalledTimes(1);
  });
});
