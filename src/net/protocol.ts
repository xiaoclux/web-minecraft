/**
 * 局域网联机协议：二进制消息的编解码。
 *
 * 设计要点：
 * - 每条消息 = 1 字节类型 + 负载，负载按字段顺序紧密排列，不带字段名；
 * - chunk 数据直接复用存档用的 RLE 数组（Uint32Array），避免再写一套压缩；
 * - 服务端权威：客户端只发"我想做什么"，方块的最终状态一律由服务端广播。
 *
 * 这一层不依赖任何渲染 / DOM，Node 服务端与浏览器主机都能直接用。
 */

/** 消息类型。 */
export const MessageType = {
  // ---- 客户端 → 服务端
  /** 加入：报上名字。 */
  HELLO: 1,
  /** 玩家移动。 */
  MOVE: 2,
  /** 请求某个 chunk 的数据。 */
  REQUEST_CHUNK: 3,
  /** 想放一个方块。 */
  PLACE_BLOCK: 4,
  /** 想挖掉一个方块。 */
  BREAK_BLOCK: 5,
  /** 聊天 / 指令。 */
  CHAT: 6,
  // ---- 服务端 → 客户端
  /** 握手回应：分配 id 与世界信息。 */
  WELCOME: 20,
  /** chunk 数据。 */
  CHUNK_DATA: 21,
  /** 单个方块变化（服务端权威）。 */
  BLOCK_CHANGE: 22,
  /** 别的玩家加入。 */
  PLAYER_JOIN: 23,
  /** 别的玩家离开。 */
  PLAYER_LEAVE: 24,
  /** 别的玩家移动。 */
  PLAYER_MOVE: 25,
  /** 聊天消息广播。 */
  CHAT_BROADCAST: 26,
  /** 世界时间同步。 */
  TIME_SYNC: 27,
  /** 附近实体的快照（生物 / 掉落物）。 */
  ENTITY_SNAPSHOT: 28,
} as const;
export type MessageType = (typeof MessageType)[keyof typeof MessageType];

/** 玩家名的最大字节数。 */
export const MAX_NAME_BYTES = 64;
/** 聊天内容的最大字节数。 */
export const MAX_CHAT_BYTES = 512;

// ---------------------------------------------------------------- 消息类型定义

export interface HelloMessage {
  type: typeof MessageType.HELLO;
  name: string;
}

export interface MoveMessage {
  type: typeof MessageType.MOVE;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

export interface RequestChunkMessage {
  type: typeof MessageType.REQUEST_CHUNK;
  cx: number;
  cz: number;
}

export interface PlaceBlockMessage {
  type: typeof MessageType.PLACE_BLOCK;
  x: number;
  y: number;
  z: number;
  blockId: number;
  meta: number;
}

export interface BreakBlockMessage {
  type: typeof MessageType.BREAK_BLOCK;
  x: number;
  y: number;
  z: number;
}

export interface ChatMessage {
  type: typeof MessageType.CHAT;
  text: string;
}

export interface WelcomeMessage {
  type: typeof MessageType.WELCOME;
  playerId: number;
  seed: string;
  /** 世界类型（normal / flat）。 */
  worldType: string;
  timeTick: number;
  /** 出生点。 */
  x: number;
  y: number;
  z: number;
}

export interface ChunkDataMessage {
  type: typeof MessageType.CHUNK_DATA;
  cx: number;
  cz: number;
  blocks: Uint32Array;
  meta: Uint32Array;
}

export interface BlockChangeMessage {
  type: typeof MessageType.BLOCK_CHANGE;
  x: number;
  y: number;
  z: number;
  blockId: number;
  meta: number;
}

export interface PlayerJoinMessage {
  type: typeof MessageType.PLAYER_JOIN;
  playerId: number;
  name: string;
}

export interface PlayerLeaveMessage {
  type: typeof MessageType.PLAYER_LEAVE;
  playerId: number;
}

export interface PlayerMoveMessage {
  type: typeof MessageType.PLAYER_MOVE;
  playerId: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

export interface ChatBroadcastMessage {
  type: typeof MessageType.CHAT_BROADCAST;
  text: string;
}

export interface TimeSyncMessage {
  type: typeof MessageType.TIME_SYNC;
  timeTick: number;
}

/** 快照里的一个实体。 */
export interface SnapshotEntity {
  id: number;
  /** 实体类型（生物种类 / item / xp_orb 等）。 */
  kind: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface EntitySnapshotMessage {
  type: typeof MessageType.ENTITY_SNAPSHOT;
  entities: SnapshotEntity[];
}

/** 任意一条协议消息。 */
export type NetMessage =
  | HelloMessage
  | MoveMessage
  | RequestChunkMessage
  | PlaceBlockMessage
  | BreakBlockMessage
  | ChatMessage
  | WelcomeMessage
  | ChunkDataMessage
  | BlockChangeMessage
  | PlayerJoinMessage
  | PlayerLeaveMessage
  | PlayerMoveMessage
  | ChatBroadcastMessage
  | TimeSyncMessage
  | EntitySnapshotMessage;

// ---------------------------------------------------------------- 编码

/** 写入缓冲：按需扩容，最后 toUint8Array 取出。 */
class Writer {
  private buffer = new ArrayBuffer(INITIAL_BUFFER_BYTES);
  private view = new DataView(this.buffer);
  private offset = 0;

  private ensure(bytes: number): void {
    if (this.offset + bytes <= this.buffer.byteLength) {
      return;
    }
    let size = this.buffer.byteLength * 2;
    while (size < this.offset + bytes) {
      size *= 2;
    }
    const next = new ArrayBuffer(size);
    new Uint8Array(next).set(new Uint8Array(this.buffer));
    this.buffer = next;
    this.view = new DataView(next);
  }

  u8(value: number): void {
    this.ensure(1);
    this.view.setUint8(this.offset, value);
    this.offset += 1;
  }

  u16(value: number): void {
    this.ensure(2);
    this.view.setUint16(this.offset, value);
    this.offset += 2;
  }

  i32(value: number): void {
    this.ensure(4);
    this.view.setInt32(this.offset, value);
    this.offset += 4;
  }

  u32(value: number): void {
    this.ensure(4);
    this.view.setUint32(this.offset, value);
    this.offset += 4;
  }

  f32(value: number): void {
    this.ensure(4);
    this.view.setFloat32(this.offset, value);
    this.offset += 4;
  }

  /** 变长字符串：2 字节长度 + UTF-8 内容。 */
  str(value: string, maxBytes: number): void {
    const bytes = TEXT_ENCODER.encode(value);
    const clipped = bytes.byteLength > maxBytes ? bytes.subarray(0, maxBytes) : bytes;
    this.u16(clipped.byteLength);
    this.ensure(clipped.byteLength);
    new Uint8Array(this.buffer, this.offset, clipped.byteLength).set(clipped);
    this.offset += clipped.byteLength;
  }

  /** 变长 Uint32 数组：4 字节长度 + 内容。 */
  u32Array(value: Uint32Array): void {
    this.u32(value.length);
    this.ensure(value.length * 4);
    for (let i = 0; i < value.length; i++) {
      this.view.setUint32(this.offset, value[i]);
      this.offset += 4;
    }
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.buffer, 0, this.offset).slice();
  }
}

/** 读取缓冲。 */
class Reader {
  private readonly view: DataView;
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  u8(): number {
    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  u16(): number {
    const value = this.view.getUint16(this.offset);
    this.offset += 2;
    return value;
  }

  i32(): number {
    const value = this.view.getInt32(this.offset);
    this.offset += 4;
    return value;
  }

  u32(): number {
    const value = this.view.getUint32(this.offset);
    this.offset += 4;
    return value;
  }

  f32(): number {
    const value = this.view.getFloat32(this.offset);
    this.offset += 4;
    return value;
  }

  str(): string {
    const length = this.u16();
    const text = TEXT_DECODER.decode(this.bytes.subarray(this.offset, this.offset + length));
    this.offset += length;
    return text;
  }

  u32Array(): Uint32Array {
    const length = this.u32();
    const out = new Uint32Array(length);
    for (let i = 0; i < length; i++) {
      out[i] = this.view.getUint32(this.offset);
      this.offset += 4;
    }
    return out;
  }

  /** 是否已经读完（用于校验消息长度是否吻合）。 */
  get isAtEnd(): boolean {
    return this.offset === this.bytes.byteLength;
  }
}

const INITIAL_BUFFER_BYTES = 256;
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

/** 把一条消息编码成字节。 */
export function encodeMessage(message: NetMessage): Uint8Array {
  const w = new Writer();
  w.u8(message.type);
  switch (message.type) {
    case MessageType.HELLO:
      w.str(message.name, MAX_NAME_BYTES);
      break;
    case MessageType.MOVE:
      writePose(w, message);
      break;
    case MessageType.REQUEST_CHUNK:
      w.i32(message.cx);
      w.i32(message.cz);
      break;
    case MessageType.PLACE_BLOCK:
      w.i32(message.x);
      w.i32(message.y);
      w.i32(message.z);
      w.u8(message.blockId);
      w.u8(message.meta);
      break;
    case MessageType.BREAK_BLOCK:
      w.i32(message.x);
      w.i32(message.y);
      w.i32(message.z);
      break;
    case MessageType.CHAT:
      w.str(message.text, MAX_CHAT_BYTES);
      break;
    case MessageType.WELCOME:
      w.u32(message.playerId);
      w.str(message.seed, MAX_NAME_BYTES);
      w.str(message.worldType, MAX_NAME_BYTES);
      w.u32(message.timeTick);
      w.f32(message.x);
      w.f32(message.y);
      w.f32(message.z);
      break;
    case MessageType.CHUNK_DATA:
      w.i32(message.cx);
      w.i32(message.cz);
      w.u32Array(message.blocks);
      w.u32Array(message.meta);
      break;
    case MessageType.BLOCK_CHANGE:
      w.i32(message.x);
      w.i32(message.y);
      w.i32(message.z);
      w.u8(message.blockId);
      w.u8(message.meta);
      break;
    case MessageType.PLAYER_JOIN:
      w.u32(message.playerId);
      w.str(message.name, MAX_NAME_BYTES);
      break;
    case MessageType.PLAYER_LEAVE:
      w.u32(message.playerId);
      break;
    case MessageType.PLAYER_MOVE:
      w.u32(message.playerId);
      writePose(w, message);
      break;
    case MessageType.CHAT_BROADCAST:
      w.str(message.text, MAX_CHAT_BYTES);
      break;
    case MessageType.TIME_SYNC:
      w.u32(message.timeTick);
      break;
    case MessageType.ENTITY_SNAPSHOT:
      w.u16(message.entities.length);
      for (const entity of message.entities) {
        w.u32(entity.id);
        w.str(entity.kind, MAX_NAME_BYTES);
        w.f32(entity.x);
        w.f32(entity.y);
        w.f32(entity.z);
        w.f32(entity.yaw);
      }
      break;
    default:
      throw new Error(`未知消息类型：${(message as { type: number }).type}`);
  }
  return w.toUint8Array();
}

/** 位置 + 朝向（移动类消息共用）。 */
function writePose(w: Writer, pose: { x: number; y: number; z: number; yaw: number; pitch: number }): void {
  w.f32(pose.x);
  w.f32(pose.y);
  w.f32(pose.z);
  w.f32(pose.yaw);
  w.f32(pose.pitch);
}

function readPose(r: Reader): { x: number; y: number; z: number; yaw: number; pitch: number } {
  return { x: r.f32(), y: r.f32(), z: r.f32(), yaw: r.f32(), pitch: r.f32() };
}

/**
 * 解码一条消息。
 * @returns 解析出的消息；类型未知或长度不符返回 null（不抛异常，避免一条坏包打断整个连接）
 */
export function decodeMessage(bytes: Uint8Array): NetMessage | null {
  if (bytes.byteLength === 0) {
    return null;
  }
  const r = new Reader(bytes);
  const type = r.u8();
  try {
    const message = decodeBody(r, type);
    return message && r.isAtEnd ? message : null;
  } catch {
    // 坏包（长度不足等）：当作没收到
    return null;
  }
}

function decodeBody(r: Reader, type: number): NetMessage | null {
  switch (type) {
    case MessageType.HELLO:
      return { type: MessageType.HELLO, name: r.str() };
    case MessageType.MOVE:
      return { type: MessageType.MOVE, ...readPose(r) };
    case MessageType.REQUEST_CHUNK:
      return { type: MessageType.REQUEST_CHUNK, cx: r.i32(), cz: r.i32() };
    case MessageType.PLACE_BLOCK:
      return {
        type: MessageType.PLACE_BLOCK,
        x: r.i32(),
        y: r.i32(),
        z: r.i32(),
        blockId: r.u8(),
        meta: r.u8(),
      };
    case MessageType.BREAK_BLOCK:
      return { type: MessageType.BREAK_BLOCK, x: r.i32(), y: r.i32(), z: r.i32() };
    case MessageType.CHAT:
      return { type: MessageType.CHAT, text: r.str() };
    case MessageType.WELCOME:
      return {
        type: MessageType.WELCOME,
        playerId: r.u32(),
        seed: r.str(),
        worldType: r.str(),
        timeTick: r.u32(),
        x: r.f32(),
        y: r.f32(),
        z: r.f32(),
      };
    case MessageType.CHUNK_DATA:
      return {
        type: MessageType.CHUNK_DATA,
        cx: r.i32(),
        cz: r.i32(),
        blocks: r.u32Array(),
        meta: r.u32Array(),
      };
    case MessageType.BLOCK_CHANGE:
      return {
        type: MessageType.BLOCK_CHANGE,
        x: r.i32(),
        y: r.i32(),
        z: r.i32(),
        blockId: r.u8(),
        meta: r.u8(),
      };
    case MessageType.PLAYER_JOIN:
      return { type: MessageType.PLAYER_JOIN, playerId: r.u32(), name: r.str() };
    case MessageType.PLAYER_LEAVE:
      return { type: MessageType.PLAYER_LEAVE, playerId: r.u32() };
    case MessageType.PLAYER_MOVE:
      return { type: MessageType.PLAYER_MOVE, playerId: r.u32(), ...readPose(r) };
    case MessageType.CHAT_BROADCAST:
      return { type: MessageType.CHAT_BROADCAST, text: r.str() };
    case MessageType.TIME_SYNC:
      return { type: MessageType.TIME_SYNC, timeTick: r.u32() };
    case MessageType.ENTITY_SNAPSHOT: {
      const count = r.u16();
      const entities: SnapshotEntity[] = [];
      for (let i = 0; i < count; i++) {
        entities.push({ id: r.u32(), kind: r.str(), x: r.f32(), y: r.f32(), z: r.f32(), yaw: r.f32() });
      }
      return { type: MessageType.ENTITY_SNAPSHOT, entities };
    }
    default:
      return null;
  }
}
