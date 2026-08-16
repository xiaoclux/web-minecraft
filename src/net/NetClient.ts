/**
 * 联机客户端：与服务端收发协议消息，把方块变更写进本地世界，维护其他玩家的位置。
 *
 * 服务端权威：本地的挖 / 放只是"意图"，发出去之后等服务端广播回来才真正改世界；
 * 这样所有人看到的世界一定一致（局域网延迟很低，手感上几乎察觉不到）。
 */

import {
  MessageType,
  decodeMessage,
  encodeMessage,
  type NetMessage,
  type SnapshotEntity,
  type WelcomeMessage,
} from './protocol';

/** 一条到服务端的连接（WebSocket 或 DataChannel）。 */
export interface ClientTransport {
  send(bytes: Uint8Array): void;
  close(): void;
  /** 收到数据时回调。 */
  onMessage(handler: (bytes: Uint8Array) => void): void;
  /** 连接断开时回调。 */
  onClose(handler: () => void): void;
}

/** 别的玩家在本地的样子。 */
export interface RemotePlayer {
  id: number;
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

/** 客户端把收到的事件抛给游戏层。 */
export interface NetClientHandlers {
  /** 握手完成：拿到世界信息与出生点。 */
  onWelcome(message: WelcomeMessage): void;
  /** 服务端下发了一个 chunk。 */
  onChunkData(cx: number, cz: number, blocks: Uint32Array, meta: Uint32Array): void;
  /** 服务端确认的方块变更。 */
  onBlockChange(x: number, y: number, z: number, blockId: number, meta: number): void;
  /** 聊天消息。 */
  onChat(text: string): void;
  /** 世界时间同步。 */
  onTimeSync(timeTick: number): void;
  /** 玩家列表有变化（加入 / 离开 / 移动）。 */
  onPlayersChanged(): void;
  /** 收到实体快照。 */
  onEntitySnapshot(entities: readonly SnapshotEntity[]): void;
  /** 连接断开。 */
  onDisconnect(): void;
}

/** 客户端每隔多少 tick 上报一次自己的位置。 */
export const MOVE_REPORT_INTERVAL_TICKS = 2;

/** 联机客户端。 */
export class NetClient {
  private readonly players = new Map<number, RemotePlayer>();
  private selfId = 0;
  private remoteEntities: readonly SnapshotEntity[] = [];
  private connected = true;

  constructor(
    private readonly transport: ClientTransport,
    private readonly handlers: NetClientHandlers,
    playerName: string,
  ) {
    transport.onMessage((bytes) => this.handle(bytes));
    transport.onClose(() => {
      this.connected = false;
      this.handlers.onDisconnect();
    });
    this.send({ type: MessageType.HELLO, name: playerName });
  }

  /** 自己的玩家 id（握手后才有）。 */
  get playerId(): number {
    return this.selfId;
  }

  /** 是否还连着。 */
  get isConnected(): boolean {
    return this.connected;
  }

  /** 其他玩家（不含自己）。 */
  get remotePlayers(): readonly RemotePlayer[] {
    return [...this.players.values()];
  }

  /** 服务端最近一次快照里的实体。 */
  get entities(): readonly SnapshotEntity[] {
    return this.remoteEntities;
  }

  private handle(bytes: Uint8Array): void {
    const message = decodeMessage(bytes);
    if (!message) {
      return;
    }
    switch (message.type) {
      case MessageType.WELCOME:
        this.selfId = message.playerId;
        this.handlers.onWelcome(message);
        break;
      case MessageType.CHUNK_DATA:
        this.handlers.onChunkData(message.cx, message.cz, message.blocks, message.meta);
        break;
      case MessageType.BLOCK_CHANGE:
        this.handlers.onBlockChange(message.x, message.y, message.z, message.blockId, message.meta);
        break;
      case MessageType.PLAYER_JOIN:
        this.players.set(message.playerId, {
          id: message.playerId,
          name: message.name,
          x: 0,
          y: 0,
          z: 0,
          yaw: 0,
          pitch: 0,
        });
        this.handlers.onPlayersChanged();
        break;
      case MessageType.PLAYER_LEAVE:
        this.players.delete(message.playerId);
        this.handlers.onPlayersChanged();
        break;
      case MessageType.PLAYER_MOVE: {
        const player = this.players.get(message.playerId);
        if (player) {
          player.x = message.x;
          player.y = message.y;
          player.z = message.z;
          player.yaw = message.yaw;
          player.pitch = message.pitch;
          this.handlers.onPlayersChanged();
        }
        break;
      }
      case MessageType.CHAT_BROADCAST:
        this.handlers.onChat(message.text);
        break;
      case MessageType.TIME_SYNC:
        this.handlers.onTimeSync(message.timeTick);
        break;
      case MessageType.ENTITY_SNAPSHOT:
        this.remoteEntities = message.entities;
        this.handlers.onEntitySnapshot(message.entities);
        break;
      default:
        // C→S 的消息不该由服务端发过来，忽略
        break;
    }
  }

  /** 请求一个 chunk 的数据。 */
  requestChunk(cx: number, cz: number): void {
    this.send({ type: MessageType.REQUEST_CHUNK, cx, cz });
  }

  /** 上报自己的位置。 */
  reportMove(x: number, y: number, z: number, yaw: number, pitch: number): void {
    this.send({ type: MessageType.MOVE, x, y, z, yaw, pitch });
  }

  /** 请求放一个方块。 */
  requestPlace(x: number, y: number, z: number, blockId: number, meta: number): void {
    this.send({ type: MessageType.PLACE_BLOCK, x, y, z, blockId, meta });
  }

  /** 请求挖掉一个方块。 */
  requestBreak(x: number, y: number, z: number): void {
    this.send({ type: MessageType.BREAK_BLOCK, x, y, z });
  }

  /** 发一条聊天 / 指令。 */
  sendChat(text: string): void {
    this.send({ type: MessageType.CHAT, text });
  }

  private send(message: NetMessage): void {
    if (!this.connected) {
      return;
    }
    this.transport.send(encodeMessage(message));
  }

  /** 主动断开。 */
  dispose(): void {
    this.connected = false;
    this.transport.close();
    this.players.clear();
  }
}

/** 把浏览器的 WebSocket 包成 ClientTransport。 */
export function websocketTransport(socket: WebSocket): ClientTransport {
  socket.binaryType = 'arraybuffer';
  return {
    send: (bytes) => {
      if (socket.readyState === WebSocket.OPEN) {
        // 复制成独立的 ArrayBuffer，避免把整个底层缓冲发出去
        socket.send(bytes.slice().buffer);
      }
    },
    close: () => socket.close(),
    onMessage: (handler) => {
      socket.addEventListener('message', (event: MessageEvent<ArrayBuffer>) => {
        handler(new Uint8Array(event.data));
      });
    },
    onClose: (handler) => socket.addEventListener('close', () => handler()),
  };
}

/**
 * 连到一个服务端地址。
 * @returns 连接成功的 NetClient；连接失败时 reject
 */
export function connectToServer(url: string, name: string, handlers: NetClientHandlers): Promise<NetClient> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.addEventListener('open', () => {
      resolve(new NetClient(websocketTransport(socket), handlers, name));
    });
    socket.addEventListener('error', () => reject(new Error(`无法连接到 ${url}`)));
  });
}
