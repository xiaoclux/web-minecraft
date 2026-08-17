/**
 * 联机服务端核心：管理连接、按需下发 chunk、把方块改动与玩家位置广播给所有人。
 *
 * 它不关心传输是 WebSocket 还是 WebRTC DataChannel —— 只要给它一个能收发字节的 Connection。
 * 世界数据由外部提供（Node 专用服务端自己建 World，浏览器主机直接用玩家正在玩的那个 World），
 * 这样单机与联机跑的是同一套世界代码。
 */

import { CHUNK_SIZE } from '../engine/constants/world';
import { serializeChunk } from '../engine/save/chunkSerializer';
import { chunkKey } from '../engine/world/Chunk';
import type { ChunkManager } from '../engine/world/ChunkManager';
import type { World } from '../engine/world/World';
import { MessageType, decodeMessage, encodeMessage, type NetMessage, type SnapshotEntity } from './protocol';

/** 一条与客户端的连接（WebSocket / DataChannel 都能包成这个样子）。 */
export interface Connection {
  /** 发送一帧二进制数据。 */
  send(bytes: Uint8Array): void;
  /** 主动断开。 */
  close(): void;
}

/** 服务端看到的一名玩家。 */
export interface ServerPlayer {
  id: number;
  name: string;
  connection: Connection;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  /** 已经发过 chunk 数据的 key，避免重复下发。 */
  sentChunks: Set<number>;
}

/** 服务端需要外部提供的世界能力。 */
export interface ServerWorldSource {
  readonly world: World;
  readonly chunkManager: ChunkManager;
  /** 世界种子与类型（握手时告诉客户端）。 */
  readonly seed: string;
  readonly worldType: string;
  /** 当前世界时间。 */
  currentTime(): number;
  /** 出生点。 */
  spawnPoint(): { x: number; y: number; z: number };
  /**
   * 广播时同时通知宿主。浏览器主机自己并不是服务端里的一名"玩家"，
   * 没有这个回调的话主机看不到客人的聊天。
   */
  onBroadcast?(message: NetMessage): void;
  /**
   * 世界里当前的实体（生物 / 掉落物）。
   * Node 专用服务端用 ServerEntityWorld 提供，浏览器主机则把自己这局的实体给出来。
   */
  entities?(): SnapshotEntity[];
  /**
   * 宿主自己的位置与名字。浏览器主机也是一名在场玩家，但它不占连接，
   * 所以要单独告诉客人，否则客人看不到房主。
   */
  hostPlayer?(): { name: string; x: number; y: number; z: number; yaw: number; pitch: number };
  /**
   * 把客人要求的方块改动落到世界里，并连带做该做的方块更新（沙子下落、上面的火把掉下来、
   * 按钮过一会儿弹起……）。不提供时只是原样写入方块。
   */
  applyBlockChange?(x: number, y: number, z: number, blockId: number, meta: number): void;
}

/** 服务端每隔多少毫秒同步一次时间。 */
export const TIME_SYNC_INTERVAL_MS = 5000;
/** 房主的玩家 id（客人的 id 从 1 开始，0 留给房主）。 */
export const HOST_PLAYER_ID = 0;
/** 一次快照里最多带多少实体（避免一帧塞爆通道）。 */
const MAX_SNAPSHOT_ENTITIES = 200;

/**
 * 联机服务端。
 * 用法：new ServerCore(source) → 每来一条连接调 addConnection → 收到字节调 handleMessage。
 */
export class ServerCore {
  private readonly players = new Map<number, ServerPlayer>();
  private nextPlayerId = 1;
  private readonly unsubscribers: (() => void)[] = [];

  constructor(private readonly source: ServerWorldSource) {
    // 世界里任何方块变化都广播出去（玩家自己改的、活塞推的、火烧的都算）：
    // 逐块改动、只改附加数据（开门 / 作物 / 水位）、批量改动（爆炸）三条路都要接上
    const { world } = source;
    this.unsubscribers.push(
      world.onBlockChange((x, y, z, _oldId, newId) => this.broadcastBlock(x, y, z, newId, world.getMeta(x, y, z))),
      world.onMetaChange((x, y, z, id, meta) => this.broadcastBlock(x, y, z, id, meta)),
      world.onBatchChange((changes) => {
        for (const change of changes) {
          this.broadcastBlock(change.x, change.y, change.z, change.newId, world.getMeta(change.x, change.y, change.z));
        }
      }),
    );
  }

  private broadcastBlock(x: number, y: number, z: number, blockId: number, meta: number): void {
    this.broadcast({ type: MessageType.BLOCK_CHANGE, x, y, z, blockId, meta });
  }

  /** 在线玩家数。 */
  get playerCount(): number {
    return this.players.size;
  }

  /** 全部在线玩家（渲染其他玩家模型时用）。 */
  get onlinePlayers(): readonly ServerPlayer[] {
    return [...this.players.values()];
  }

  /**
   * 接入一条新连接。真正的"加入"要等客户端发 HELLO。
   * @returns 分配给这条连接的玩家 id
   */
  addConnection(connection: Connection): number {
    const id = this.nextPlayerId++;
    const spawn = this.source.spawnPoint();
    this.players.set(id, {
      id,
      name: `玩家${id}`,
      connection,
      x: spawn.x,
      y: spawn.y,
      z: spawn.z,
      yaw: 0,
      pitch: 0,
      sentChunks: new Set(),
    });
    return id;
  }

  /** 断开一条连接。 */
  removeConnection(playerId: number): void {
    const player = this.players.get(playerId);
    if (!player) {
      return;
    }
    this.players.delete(playerId);
    this.broadcast({ type: MessageType.PLAYER_LEAVE, playerId });
    this.broadcast({ type: MessageType.CHAT_BROADCAST, text: `${player.name} 离开了游戏` });
  }

  /** 处理一条来自客户端的原始字节。 */
  handleMessage(playerId: number, bytes: Uint8Array): void {
    const message = decodeMessage(bytes);
    const player = this.players.get(playerId);
    if (!message || !player) {
      return;
    }
    switch (message.type) {
      case MessageType.HELLO:
        this.handleHello(player, message.name);
        break;
      case MessageType.MOVE:
        this.handleMove(player, message);
        break;
      case MessageType.REQUEST_CHUNK:
        this.sendChunk(player, message.cx, message.cz);
        break;
      case MessageType.PLACE_BLOCK:
        // 服务端权威：直接改世界，改动会由 onBlockChange 广播回所有人
        this.setBlockAuthoritative(message.x, message.y, message.z, message.blockId, message.meta);
        break;
      case MessageType.BREAK_BLOCK:
        this.setBlockAuthoritative(message.x, message.y, message.z, 0, 0);
        break;
      case MessageType.CHAT:
        this.broadcast({ type: MessageType.CHAT_BROADCAST, text: `<${player.name}> ${message.text}` });
        break;
      default:
        // 服务端不该收到 S→C 的消息，忽略
        break;
    }
  }

  /**
   * 按客户端请求改一个方块。改之前先确保该 chunk 已加载，
   * 否则玩家在服务端还没生成的区域动手时，改动会静默丢失。
   */
  private setBlockAuthoritative(x: number, y: number, z: number, blockId: number, meta: number): void {
    if (!this.source.world.hasChunkAt(x, z)) {
      this.source.chunkManager.ensureLoaded(x, z, 0);
    }
    if (this.source.applyBlockChange) {
      this.source.applyBlockChange(x, y, z, blockId, meta);
      return;
    }
    this.source.world.setBlock(x, y, z, blockId, meta);
  }

  /** 握手：确认名字、告诉客户端世界信息，并互相通报在线玩家。 */
  private handleHello(player: ServerPlayer, name: string): void {
    player.name = name.trim() || player.name;
    const spawn = this.source.spawnPoint();
    this.send(player, {
      type: MessageType.WELCOME,
      playerId: player.id,
      seed: this.source.seed,
      worldType: this.source.worldType,
      timeTick: this.source.currentTime(),
      x: spawn.x,
      y: spawn.y,
      z: spawn.z,
    });
    // 房主也是一名玩家，只是不占连接
    const host = this.source.hostPlayer?.();
    if (host) {
      this.send(player, { type: MessageType.PLAYER_JOIN, playerId: HOST_PLAYER_ID, name: host.name });
    }
    // 把已经在线的人告诉新玩家
    for (const other of this.players.values()) {
      if (other.id !== player.id) {
        this.send(player, { type: MessageType.PLAYER_JOIN, playerId: other.id, name: other.name });
      }
    }
    // 把新玩家告诉其他人
    this.broadcastExcept(player.id, { type: MessageType.PLAYER_JOIN, playerId: player.id, name: player.name });
    this.broadcast({ type: MessageType.CHAT_BROADCAST, text: `${player.name} 加入了游戏` });
  }

  private handleMove(
    player: ServerPlayer,
    pose: { x: number; y: number; z: number; yaw: number; pitch: number },
  ): void {
    player.x = pose.x;
    player.y = pose.y;
    player.z = pose.z;
    player.yaw = pose.yaw;
    player.pitch = pose.pitch;
    this.broadcastExcept(player.id, {
      type: MessageType.PLAYER_MOVE,
      playerId: player.id,
      x: pose.x,
      y: pose.y,
      z: pose.z,
      yaw: pose.yaw,
      pitch: pose.pitch,
    });
  }

  /** 下发一个 chunk（必要时先生成）。同一个 chunk 对同一玩家只发一次。 */
  private sendChunk(player: ServerPlayer, cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    if (player.sentChunks.has(key)) {
      return;
    }
    this.source.chunkManager.ensureLoaded(cx * CHUNK_SIZE, cz * CHUNK_SIZE, 0);
    const chunk = this.source.world.getChunk(cx, cz);
    if (!chunk) {
      return;
    }
    player.sentChunks.add(key);
    const data = serializeChunk(chunk);
    this.send(player, { type: MessageType.CHUNK_DATA, cx, cz, blocks: data.blocks, meta: data.meta });
  }

  /** 定时同步世界时间。 */
  syncTime(): void {
    this.broadcast({ type: MessageType.TIME_SYNC, timeTick: this.source.currentTime() });
  }

  /** 广播宿主自己的位置（浏览器主机用）。 */
  syncHostPlayer(): void {
    const host = this.source.hostPlayer?.();
    if (!host || this.players.size === 0) {
      return;
    }
    this.broadcast({
      type: MessageType.PLAYER_MOVE,
      playerId: HOST_PLAYER_ID,
      x: host.x,
      y: host.y,
      z: host.z,
      yaw: host.yaw,
      pitch: host.pitch,
    });
  }

  /** 定时广播实体快照（生物 / 掉落物）。 */
  syncEntities(): void {
    const entities = this.source.entities?.();
    if (!entities) {
      return;
    }
    this.broadcast({
      type: MessageType.ENTITY_SNAPSHOT,
      entities: entities.length > MAX_SNAPSHOT_ENTITIES ? entities.slice(0, MAX_SNAPSHOT_ENTITIES) : entities,
    });
  }

  /** 在线玩家的位置（服务端跑生物 AI 时要知道追谁）。 */
  playerPositions(): { id: number; x: number; y: number; z: number }[] {
    const out: { id: number; x: number; y: number; z: number }[] = [];
    for (const player of this.players.values()) {
      out.push({ id: player.id, x: player.x, y: player.y, z: player.z });
    }
    return out;
  }

  /** 给所有人发一条消息。 */
  broadcast(message: NetMessage): void {
    this.source.onBroadcast?.(message);
    if (this.players.size === 0) {
      // 主机独自玩时不用为每次方块变化编码一遍
      return;
    }
    const bytes = encodeMessage(message);
    for (const player of this.players.values()) {
      player.connection.send(bytes);
    }
  }

  /** 给除某人之外的所有人发。 */
  private broadcastExcept(exceptId: number, message: NetMessage): void {
    const bytes = encodeMessage(message);
    for (const player of this.players.values()) {
      if (player.id !== exceptId) {
        player.connection.send(bytes);
      }
    }
  }

  private send(player: ServerPlayer, message: NetMessage): void {
    player.connection.send(encodeMessage(message));
  }

  /** 关服：断开全部连接并取消订阅。 */
  dispose(): void {
    for (const player of this.players.values()) {
      player.connection.close();
    }
    this.players.clear();
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers.length = 0;
  }
}
