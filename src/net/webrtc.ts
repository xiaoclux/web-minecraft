/**
 * 浏览器之间的直连：WebRTC DataChannel + 手动房间码信令。
 *
 * 浏览器不能监听端口，所以"主机"用 WebRTC 而不是 WebSocket：
 * 主机生成一段"房间码"（SDP offer），客人粘贴后生成"回应码"（SDP answer），主机再粘回去，连接建立。
 * 局域网内不需要任何中转服务器；房间码可以用微信 / 口头 / 记事本传。
 *
 * 房间码 = JSON(SDP + ICE 候选) 的 base64，等 ICE 收集完再生成，这样只需要交换一次。
 */

import type { ClientTransport } from './NetClient';
import type { Connection } from './ServerCore';

/** DataChannel 的名字（两端要一致）。 */
const CHANNEL_LABEL = 'mc';
/** 只用公共 STUN 做 NAT 穿透；纯局域网其实用不到，但带上不影响。 */
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};
/** 等 ICE 收集完的最长时间（毫秒）；超时就用已有的候选。 */
const ICE_GATHER_TIMEOUT_MS = 3000;

/** 把 SDP 编码成可复制的房间码。 */
function encodeCode(description: RTCSessionDescriptionInit): string {
  return btoa(encodeURIComponent(JSON.stringify(description)));
}

/** 解析房间码；格式不对返回 null。 */
export function decodeCode(code: string): RTCSessionDescriptionInit | null {
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(atob(code.trim())));
    if (typeof parsed === 'object' && parsed !== null && 'type' in parsed && 'sdp' in parsed) {
      return parsed as RTCSessionDescriptionInit;
    }
    return null;
  } catch {
    return null;
  }
}

/** 等 ICE 候选收集完（或超时），这样房间码里就带齐了地址。 */
function waitForIce(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const done = (): void => {
      pc.removeEventListener('icegatheringstatechange', check);
      window.clearTimeout(timer);
      resolve();
    };
    const check = (): void => {
      if (pc.iceGatheringState === 'complete') {
        done();
      }
    };
    const timer = window.setTimeout(done, ICE_GATHER_TIMEOUT_MS);
    pc.addEventListener('icegatheringstatechange', check);
  });
}

/**
 * DataChannel 发送侧的水位线（字节）：缓冲超过它就先攒在自己的队列里，等浏览器发出去一些再继续。
 * 一口气把几百个 chunk 塞进 channel.send 会让 SCTP 的发送缓冲卡死（bufferedAmount 涨到几 MB 后再也不下降，
 * 之后所有消息都到不了对面），所以必须自己限流。
 */
const CHANNEL_HIGH_WATER_BYTES = 256 * 1024;
/** 缓冲降到这个值以下时浏览器发 bufferedamountlow 事件，我们接着灌。 */
const CHANNEL_LOW_WATER_BYTES = 64 * 1024;

/**
 * 带限流的 DataChannel 发送器：按顺序排队，缓冲有空位再发，保证消息顺序且不会把通道撑死。
 */
class PacedChannelSender {
  private readonly queue: ArrayBuffer[] = [];

  constructor(private readonly channel: RTCDataChannel) {
    channel.bufferedAmountLowThreshold = CHANNEL_LOW_WATER_BYTES;
    channel.addEventListener('bufferedamountlow', () => this.flush());
    channel.addEventListener('close', () => {
      this.queue.length = 0;
    });
  }

  /** 排队发送一帧（通道没开或已关就丢弃）。 */
  send(bytes: Uint8Array): void {
    if (this.channel.readyState !== 'open') {
      return;
    }
    // 拷一份：调用方可能复用底层缓冲
    this.queue.push(bytes.slice().buffer);
    this.flush();
  }

  private flush(): void {
    const channel = this.channel;
    while (this.queue.length > 0 && channel.readyState === 'open') {
      if (channel.bufferedAmount + this.queue[0].byteLength > CHANNEL_HIGH_WATER_BYTES && channel.bufferedAmount > 0) {
        return;
      }
      channel.send(this.queue.shift() as ArrayBuffer);
    }
  }
}

/** 把 DataChannel 包成服务端用的 Connection。 */
function channelAsConnection(channel: RTCDataChannel): Connection {
  const sender = new PacedChannelSender(channel);
  return {
    send: (bytes) => sender.send(bytes),
    close: () => channel.close(),
  };
}

/** 把 DataChannel 包成客户端用的 Transport。 */
export function channelAsTransport(channel: RTCDataChannel): ClientTransport {
  channel.binaryType = 'arraybuffer';
  const sender = new PacedChannelSender(channel);
  return {
    send: (bytes) => sender.send(bytes),
    close: () => channel.close(),
    onMessage: (handler) => {
      channel.addEventListener('message', (event: MessageEvent<ArrayBuffer>) => {
        handler(new Uint8Array(event.data));
      });
    },
    onClose: (handler) => channel.addEventListener('close', () => handler()),
  };
}

/** 一位通过 WebRTC 连进来的客人。 */
export interface RtcGuest {
  connection: Connection;
  /** 收到数据时回调（服务端用来喂给 ServerCore）。 */
  onMessage(handler: (bytes: Uint8Array) => void): void;
  onClose(handler: () => void): void;
}

/**
 * 主机侧的一次"邀请"：生成房间码，等客人的回应码。
 * 一个邀请对应一位客人；想让第二个人加入就再建一个。
 */
export class RtcInvite {
  private readonly pc = new RTCPeerConnection(RTC_CONFIG);
  private readonly channel: RTCDataChannel;
  private readonly messageHandlers: ((bytes: Uint8Array) => void)[] = [];
  private readonly closeHandlers: (() => void)[] = [];

  constructor() {
    this.channel = this.pc.createDataChannel(CHANNEL_LABEL, { ordered: true });
    this.channel.binaryType = 'arraybuffer';
    this.channel.addEventListener('message', (event: MessageEvent<ArrayBuffer>) => {
      const bytes = new Uint8Array(event.data);
      for (const handler of this.messageHandlers) {
        handler(bytes);
      }
    });
    this.channel.addEventListener('close', () => {
      for (const handler of this.closeHandlers) {
        handler();
      }
    });
  }

  /** 生成房间码（给客人）。 */
  async createCode(): Promise<string> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await waitForIce(this.pc);
    return encodeCode(this.pc.localDescription as RTCSessionDescriptionInit);
  }

  /**
   * 填入客人的回应码，连接开始建立。
   * @returns 通道打开后的客人对象
   */
  async acceptAnswer(code: string): Promise<RtcGuest> {
    const answer = decodeCode(code);
    if (!answer) {
      throw new Error('回应码格式不对');
    }
    await this.pc.setRemoteDescription(answer);
    await this.waitForOpen();
    return {
      connection: channelAsConnection(this.channel),
      onMessage: (handler) => this.messageHandlers.push(handler),
      onClose: (handler) => this.closeHandlers.push(handler),
    };
  }

  private waitForOpen(): Promise<void> {
    if (this.channel.readyState === 'open') {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      this.channel.addEventListener('open', () => resolve(), { once: true });
      this.channel.addEventListener('error', () => reject(new Error('连接失败')), { once: true });
    });
  }

  /** 断开这位客人。 */
  close(): void {
    this.channel.close();
    this.pc.close();
  }
}

/**
 * 客人侧：拿主机的房间码，生成回应码，等主机填回去后连接建立。
 */
export class RtcJoiner {
  private readonly pc = new RTCPeerConnection(RTC_CONFIG);
  private channel: RTCDataChannel | null = null;
  private readonly channelReady: Promise<RTCDataChannel>;

  constructor() {
    this.channelReady = new Promise((resolve) => {
      this.pc.addEventListener('datachannel', (event) => {
        this.channel = event.channel;
        this.channel.binaryType = 'arraybuffer';
        if (this.channel.readyState === 'open') {
          resolve(this.channel);
          return;
        }
        this.channel.addEventListener('open', () => resolve(event.channel), { once: true });
      });
    });
  }

  /**
   * 处理主机的房间码。
   * @returns 要发回给主机的回应码
   */
  async createAnswer(hostCode: string): Promise<string> {
    const offer = decodeCode(hostCode);
    if (!offer) {
      throw new Error('房间码格式不对');
    }
    await this.pc.setRemoteDescription(offer);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await waitForIce(this.pc);
    return encodeCode(this.pc.localDescription as RTCSessionDescriptionInit);
  }

  /** 等主机那边把回应码填进去、通道真正打开。 */
  async waitForConnection(): Promise<ClientTransport> {
    const channel = await this.channelReady;
    return channelAsTransport(channel);
  }

  close(): void {
    this.channel?.close();
    this.pc.close();
  }
}
