import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/engine/blocks/BlockRegistry';
import { LightEngine } from '../src/engine/world/LightEngine';
import { ChunkManager } from '../src/engine/world/ChunkManager';
import { FlatGenerator } from '../src/engine/world/FlatGenerator';
import { World } from '../src/engine/world/World';
import { HOST_PLAYER_ID, ServerCore, type Connection, type ServerWorldSource } from '../src/net/ServerCore';
import { MessageType, decodeMessage, encodeMessage, type NetMessage } from '../src/net/protocol';

/** 一个把收到的消息记下来的假连接。 */
class FakeConnection implements Connection {
  readonly received: NetMessage[] = [];
  closed = false;

  send(bytes: Uint8Array): void {
    const message = decodeMessage(bytes);
    if (message) {
      this.received.push(message);
    }
  }

  close(): void {
    this.closed = true;
  }

  /** 取出某类消息。 */
  ofType<T extends NetMessage['type']>(type: T): Extract<NetMessage, { type: T }>[] {
    return this.received.filter((m) => m.type === type) as Extract<NetMessage, { type: T }>[];
  }
}

function setup(): { server: ServerCore; source: ServerWorldSource } {
  const world = new World(true);
  const generator = new FlatGenerator('test-seed', false);
  const light = new LightEngine(world);
  const chunkManager = new ChunkManager(world, generator, light);
  const source: ServerWorldSource = {
    world,
    chunkManager,
    seed: 'test-seed',
    worldType: 'flat',
    currentTime: () => 1234,
    spawnPoint: () => ({ x: 0.5, y: 5, z: 0.5 }),
  };
  return { server: new ServerCore(source), source };
}

function join(server: ServerCore, name: string): { id: number; conn: FakeConnection } {
  const conn = new FakeConnection();
  const id = server.addConnection(conn);
  server.handleMessage(id, encodeMessage({ type: MessageType.HELLO, name }));
  return { id, conn };
}

describe('联机服务端', () => {
  it('握手后收到世界信息', () => {
    const { server } = setup();
    const { conn } = join(server, '小明');
    const welcome = conn.ofType(MessageType.WELCOME)[0];
    expect(welcome).toBeDefined();
    expect(welcome.seed).toBe('test-seed');
    expect(welcome.worldType).toBe('flat');
    expect(welcome.timeTick).toBe(1234);
    expect(welcome.y).toBe(5);
  });

  it('后加入的人能看到先来的人，先来的人也会收到新人加入', () => {
    const { server } = setup();
    const a = join(server, 'A');
    const b = join(server, 'B');
    // B 收到 A 的 JOIN
    expect(b.conn.ofType(MessageType.PLAYER_JOIN).map((m) => m.name)).toContain('A');
    // A 收到 B 的 JOIN
    expect(a.conn.ofType(MessageType.PLAYER_JOIN).map((m) => m.name)).toContain('B');
    expect(server.playerCount).toBe(2);
  });

  it('一个人放方块，另一个人收到方块变化', () => {
    const { server, source } = setup();
    const a = join(server, 'A');
    const b = join(server, 'B');
    b.conn.received.length = 0;
    server.handleMessage(
      a.id,
      encodeMessage({ type: MessageType.PLACE_BLOCK, x: 3, y: 6, z: 4, blockId: BlockId.STONE, meta: 0 }),
    );
    const change = b.conn.ofType(MessageType.BLOCK_CHANGE)[0];
    expect(change).toBeDefined();
    expect(change.blockId).toBe(BlockId.STONE);
    expect(source.world.getBlock(3, 6, 4)).toBe(BlockId.STONE);
  });

  it('挖方块同样广播，且世界真的变空', () => {
    const { server, source } = setup();
    const a = join(server, 'A');
    // 先让服务端加载这个 chunk，再直接改世界，模拟"本来就有一块石头"
    source.chunkManager.ensureLoaded(1, 1, 0);
    source.world.setBlock(1, 6, 1, BlockId.STONE);
    a.conn.received.length = 0;
    server.handleMessage(a.id, encodeMessage({ type: MessageType.BREAK_BLOCK, x: 1, y: 6, z: 1 }));
    expect(source.world.getBlock(1, 6, 1)).toBe(BlockId.AIR);
    expect(a.conn.ofType(MessageType.BLOCK_CHANGE).some((m) => m.blockId === BlockId.AIR)).toBe(true);
  });

  it('请求 chunk 会收到数据，重复请求不会重复下发', () => {
    const { server } = setup();
    const a = join(server, 'A');
    server.handleMessage(a.id, encodeMessage({ type: MessageType.REQUEST_CHUNK, cx: 0, cz: 0 }));
    server.handleMessage(a.id, encodeMessage({ type: MessageType.REQUEST_CHUNK, cx: 0, cz: 0 }));
    const chunks = a.conn.ofType(MessageType.CHUNK_DATA);
    expect(chunks.length).toBe(1);
    expect(chunks[0].blocks.length).toBeGreaterThan(0);
  });

  it('移动只广播给别人，不回给自己', () => {
    const { server } = setup();
    const a = join(server, 'A');
    const b = join(server, 'B');
    a.conn.received.length = 0;
    b.conn.received.length = 0;
    server.handleMessage(
      a.id,
      encodeMessage({ type: MessageType.MOVE, x: 10, y: 20, z: 30, yaw: 1, pitch: 0 }),
    );
    expect(a.conn.ofType(MessageType.PLAYER_MOVE).length).toBe(0);
    const move = b.conn.ofType(MessageType.PLAYER_MOVE)[0];
    expect(move.playerId).toBe(a.id);
    expect(move.x).toBeCloseTo(10);
  });

  it('聊天会带上发言人名字广播给所有人', () => {
    const { server } = setup();
    const a = join(server, '小明');
    const b = join(server, '小红');
    a.conn.received.length = 0;
    b.conn.received.length = 0;
    server.handleMessage(a.id, encodeMessage({ type: MessageType.CHAT, text: '你好' }));
    expect(a.conn.ofType(MessageType.CHAT_BROADCAST)[0].text).toBe('<小明> 你好');
    expect(b.conn.ofType(MessageType.CHAT_BROADCAST)[0].text).toBe('<小明> 你好');
  });

  it('掉线会通知其他人', () => {
    const { server } = setup();
    const a = join(server, 'A');
    const b = join(server, 'B');
    b.conn.received.length = 0;
    server.removeConnection(a.id);
    expect(b.conn.ofType(MessageType.PLAYER_LEAVE)[0].playerId).toBe(a.id);
    expect(server.playerCount).toBe(1);
  });

  it('坏包不会打断连接', () => {
    const { server } = setup();
    const a = join(server, 'A');
    const before = a.conn.received.length;
    server.handleMessage(a.id, new Uint8Array([255, 1, 2, 3]));
    server.handleMessage(a.id, new Uint8Array([]));
    expect(a.conn.received.length).toBe(before);
    expect(server.playerCount).toBe(1);
  });

  it('关服会断开所有连接', () => {
    const { server } = setup();
    const a = join(server, 'A');
    server.dispose();
    expect(a.conn.closed).toBe(true);
    expect(server.playerCount).toBe(0);
  });
});

describe('浏览器主机', () => {
  it('广播会同时通知宿主（主机自己不在玩家表里）', () => {
    const world = new World(true);
    const generator = new FlatGenerator('host-seed', false);
    const light = new LightEngine(world);
    const chunkManager = new ChunkManager(world, generator, light);
    const seen: string[] = [];
    const server = new ServerCore({
      world,
      chunkManager,
      seed: 'host-seed',
      worldType: 'flat',
      currentTime: () => 0,
      spawnPoint: () => ({ x: 0, y: 5, z: 0 }),
      onBroadcast: (message) => {
        if (message.type === MessageType.CHAT_BROADCAST) {
          seen.push(message.text);
        }
      },
    });
    const guest = join(server, '客人');
    server.handleMessage(guest.id, encodeMessage({ type: MessageType.CHAT, text: '你好' }));
    expect(seen).toContain('客人 加入了游戏');
    expect(seen).toContain('<客人> 你好');
  });
});

describe('房主作为玩家', () => {
  function hostServer() {
    const world = new World(true);
    const generator = new FlatGenerator('host', false);
    const light = new LightEngine(world);
    const chunkManager = new ChunkManager(world, generator, light);
    return new ServerCore({
      world,
      chunkManager,
      seed: 'host',
      worldType: 'flat',
      currentTime: () => 0,
      spawnPoint: () => ({ x: 0, y: 5, z: 0 }),
      hostPlayer: () => ({ name: '房主', x: 1, y: 2, z: 3, yaw: 0.5, pitch: 0 }),
    });
  }

  it('客人加入时会看到房主', () => {
    const server = hostServer();
    const guest = join(server, '客人');
    const joins = guest.conn.ofType(MessageType.PLAYER_JOIN);
    expect(joins.map((m) => m.name)).toContain('房主');
    expect(joins.find((m) => m.name === '房主')?.playerId).toBe(HOST_PLAYER_ID);
  });

  it('房主的位置会同步给客人', () => {
    const server = hostServer();
    const guest = join(server, '客人');
    guest.conn.received.length = 0;
    server.syncHostPlayer();
    const move = guest.conn.ofType(MessageType.PLAYER_MOVE)[0];
    expect(move.playerId).toBe(HOST_PLAYER_ID);
    expect(move.x).toBeCloseTo(1);
    expect(move.z).toBeCloseTo(3);
  });

  it('没人在线时不必广播房主位置', () => {
    const server = hostServer();
    // 没有客人，不该抛异常
    expect(() => server.syncHostPlayer()).not.toThrow();
  });
});

describe('方块改动的广播覆盖面', () => {
  it('只改附加数据（开门 / 水位）也会广播', () => {
    const { server, source } = setup();
    const { conn } = join(server, '小明');
    source.chunkManager.ensureLoaded(0, 0, 0);
    source.world.setBlock(1, 5, 1, BlockId.WOODEN_DOOR, 0);
    conn.received.length = 0;
    source.world.setMeta(1, 5, 1, 4);
    const change = conn.ofType(MessageType.BLOCK_CHANGE)[0];
    expect(change).toMatchObject({ x: 1, y: 5, z: 1, blockId: BlockId.WOODEN_DOOR, meta: 4 });
  });

  it('批量改动（爆炸）逐块广播', () => {
    const { server, source } = setup();
    const { conn } = join(server, '小明');
    source.chunkManager.ensureLoaded(0, 0, 0);
    conn.received.length = 0;
    source.world.batch(() => {
      source.world.setBlock(2, 5, 2, BlockId.STONE);
      source.world.setBlock(3, 5, 2, BlockId.STONE);
    });
    expect(conn.ofType(MessageType.BLOCK_CHANGE)).toHaveLength(2);
  });

  it('提供 applyBlockChange 时客人的改动交给它落实', () => {
    const world = new World(true);
    const generator = new FlatGenerator('test-seed', false);
    const chunkManager = new ChunkManager(world, generator, new LightEngine(world));
    const applied: number[][] = [];
    const server = new ServerCore({
      world,
      chunkManager,
      seed: 'test-seed',
      worldType: 'flat',
      currentTime: () => 0,
      spawnPoint: () => ({ x: 0, y: 5, z: 0 }),
      applyBlockChange: (x, y, z, blockId, meta) => applied.push([x, y, z, blockId, meta]),
    });
    const { id } = join(server, '客人');
    server.handleMessage(id, encodeMessage({ type: MessageType.PLACE_BLOCK, x: 1, y: 6, z: 1, blockId: BlockId.SAND, meta: 0 }));
    server.handleMessage(id, encodeMessage({ type: MessageType.BREAK_BLOCK, x: 1, y: 6, z: 1 }));
    expect(applied).toEqual([
      [1, 6, 1, BlockId.SAND, 0],
      [1, 6, 1, BlockId.AIR, 0],
    ]);
  });
});
