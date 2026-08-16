/**
 * 程序化音效：不加载任何外部资源，全部用 WebAudio 现场合成。
 * 一个音效 = 若干层（振荡器音 / 噪声音）叠加，各层有自己的包络与频率走向；
 * 破坏、放置、脚步这类音效按方块材质分组（见 blockSounds.ts），叫声按生物种类分组。
 */

/** 一层振荡器音：从 freqStart 滑到 freqEnd。 */
interface ToneLayer {
  kind: 'tone';
  type: OscillatorType;
  freqStart: number;
  freqEnd: number;
  /** 相对整体音量的比例。 */
  gain: number;
  /** 相对音效开始时刻的延迟（秒）。 */
  delay?: number;
  duration: number;
}

/** 一层噪声音：白噪声过一个带通 / 低通，用来做脚步、沙石、玻璃碎裂。 */
interface NoiseLayer {
  kind: 'noise';
  filter: BiquadFilterType;
  /** 滤波器频率的起点与终点。 */
  freqStart: number;
  freqEnd: number;
  q: number;
  gain: number;
  delay?: number;
  duration: number;
}

export type SoundLayer = ToneLayer | NoiseLayer;

/** 一个音效。 */
export interface SoundSpec {
  layers: readonly SoundLayer[];
  /** 整体音量 0~1。 */
  volume: number;
  /** 每次播放时音高的随机浮动比例（0.1 = ±10%），让重复音效不呆板。 */
  pitchJitter?: number;
}

const tone = (
  type: OscillatorType,
  freqStart: number,
  freqEnd: number,
  duration: number,
  gain = 1,
  delay = 0,
): ToneLayer => ({ kind: 'tone', type, freqStart, freqEnd, duration, gain, delay });

const noise = (
  filter: BiquadFilterType,
  freqStart: number,
  freqEnd: number,
  q: number,
  duration: number,
  gain = 1,
  delay = 0,
): NoiseLayer => ({ kind: 'noise', filter, freqStart, freqEnd, q, duration, gain, delay });

/** 白噪声缓冲的时长（秒）：够长就能循环取用。 */
const NOISE_BUFFER_SECONDS = 1;
/** 听得见的最远距离。 */
const MAX_DISTANCE = 24;
/** 同一 tick 内同名音效最多播几次，避免爆音。 */
const MAX_CONCURRENT_SAME = 4;

export const SOUNDS: Readonly<Record<string, SoundSpec>> = {
  // ---- 通用交互
  pickup: { layers: [tone('sine', 700, 1100, 0.1)], volume: 0.12, pitchJitter: 0.1 },
  level: {
    layers: [tone('sine', 660, 990, 0.18), tone('sine', 990, 1320, 0.2, 0.6, 0.12)],
    volume: 0.14,
  },
  eat: {
    layers: [noise('bandpass', 900, 500, 3, 0.09, 1), noise('bandpass', 700, 400, 3, 0.08, 0.8, 0.12)],
    volume: 0.16,
    pitchJitter: 0.15,
  },
  drink: { layers: [tone('sine', 320, 200, 0.16), noise('lowpass', 600, 300, 1, 0.18, 0.5)], volume: 0.14 },
  bow: { layers: [noise('bandpass', 1800, 600, 2, 0.14, 1)], volume: 0.12, pitchJitter: 0.12 },
  fuse: { layers: [noise('highpass', 3000, 3000, 1, 0.5, 1)], volume: 0.1 },
  explode: {
    layers: [noise('lowpass', 800, 60, 1, 0.7, 1), tone('sawtooth', 120, 30, 0.5, 0.7)],
    volume: 0.38,
  },
  door: { layers: [tone('square', 180, 120, 0.14, 0.5), noise('bandpass', 500, 300, 2, 0.16, 1)], volume: 0.14 },
  chest: { layers: [noise('bandpass', 700, 400, 2, 0.2, 1)], volume: 0.12 },
  splash: { layers: [noise('bandpass', 1200, 300, 1.5, 0.35, 1)], volume: 0.18, pitchJitter: 0.15 },
  fizz: { layers: [noise('highpass', 2400, 800, 1, 0.5, 1)], volume: 0.16 },
  // 音符盒：基频交给调用方的 pitch 参数拉伸，这里只定音色包络
  note: { layers: [tone('triangle', 440, 380, 0.7), tone('sine', 880, 760, 0.4, 0.3)], volume: 0.2 },
  anvil: { layers: [tone('triangle', 1200, 300, 0.25), noise('bandpass', 2000, 900, 4, 0.15, 0.8)], volume: 0.2 },
  // ---- 战斗
  hit: { layers: [tone('sawtooth', 200, 120, 0.1)], volume: 0.15, pitchJitter: 0.15 },
  hurt: { layers: [tone('sawtooth', 300, 80, 0.25)], volume: 0.2, pitchJitter: 0.1 },
};

/** 音量分类：音效与音乐分开调。 */
export const SoundCategory = { SFX: 'sfx', MUSIC: 'music' } as const;
export type SoundCategory = (typeof SoundCategory)[keyof typeof SoundCategory];

/**
 * 音效播放器：持有 AudioContext 与两条音量总线（音效 / 音乐）。
 * 音乐由 MusicPlayer 通过 musicDestination 接入。
 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  /** 本帧各音效已播放次数，避免同一瞬间叠太多。 */
  private readonly playedThisFrame = new Map<string, number>();
  private masterVolume = 1;
  private sfxVolume = 1;
  private musicVolume = 1;
  enabled = true;

  /** 设置总音量 0~1。 */
  setVolumes(master: number, sfx: number, music: number): void {
    this.masterVolume = master;
    this.sfxVolume = sfx;
    this.musicVolume = music;
    if (this.masterGain && this.sfxGain && this.musicGain) {
      this.masterGain.gain.value = master;
      this.sfxGain.gain.value = sfx;
      this.musicGain.gain.value = music;
    }
  }

  /** 每帧调用：重置并发计数。 */
  update(): void {
    this.playedThisFrame.clear();
  }

  /** 音乐节点接入点（没有音频上下文时为 null）。 */
  get musicDestination(): AudioNode | null {
    this.ensureContext();
    return this.musicGain;
  }

  /** 音频上下文（MusicPlayer 用来排程）。 */
  get audioContext(): AudioContext | null {
    return this.ensureContext();
  }

  private ensureContext(): AudioContext | null {
    if (!this.enabled) {
      return null;
    }
    if (!this.ctx) {
      const Ctor = window.AudioContext;
      if (!Ctor) {
        return null;
      }
      this.ctx = new Ctor();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.masterVolume;
      this.masterGain.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVolume;
      this.sfxGain.connect(this.masterGain);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicVolume;
      this.musicGain.connect(this.masterGain);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {
        /* 浏览器要求用户手势后才可播放，忽略 */
      });
    }
    return this.ctx;
  }

  /** 复用同一段白噪声，避免每次播放都生成缓冲。 */
  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (!this.noiseBuffer) {
      const length = Math.floor(ctx.sampleRate * NOISE_BUFFER_SECONDS);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buffer;
    }
    return this.noiseBuffer;
  }

  /**
   * 播放音效。
   * @param name SOUNDS 里的键（或由 blockSounds / mobSounds 生成的键）
   * @param distance 与听者的距离（用于衰减）
   * @param pitch 额外的音高倍率（1 为原音高）
   * @param volumeScale 额外的音量倍率
   */
  play(name: string, distance = 0, pitch = 1, volumeScale = 1): void {
    const spec = SOUNDS[name];
    if (!spec) {
      return;
    }
    this.playSpec(spec, distance, pitch, volumeScale, name);
  }

  /** 播放一个直接给出的音效定义（材质音效等动态拼出来的）。 */
  playSpec(spec: SoundSpec, distance = 0, pitch = 1, volumeScale = 1, dedupeKey = ''): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || distance > MAX_DISTANCE) {
      return;
    }
    if (dedupeKey) {
      const count = this.playedThisFrame.get(dedupeKey) ?? 0;
      if (count >= MAX_CONCURRENT_SAME) {
        return;
      }
      this.playedThisFrame.set(dedupeKey, count + 1);
    }
    const attenuation = 1 - distance / MAX_DISTANCE;
    const jitter = spec.pitchJitter ? 1 + (Math.random() * 2 - 1) * spec.pitchJitter : 1;
    const rate = pitch * jitter;
    const volume = spec.volume * attenuation * volumeScale;
    const now = ctx.currentTime;
    for (const layer of spec.layers) {
      this.playLayer(ctx, layer, now, rate, volume);
    }
  }

  private playLayer(ctx: AudioContext, layer: SoundLayer, now: number, rate: number, volume: number): void {
    const start = now + (layer.delay ?? 0);
    const end = start + layer.duration;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(Math.max(0.0001, volume * layer.gain), start);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    gain.connect(this.sfxGain as GainNode);
    if (layer.kind === 'tone') {
      const osc = ctx.createOscillator();
      osc.type = layer.type;
      osc.frequency.setValueAtTime(layer.freqStart * rate, start);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, layer.freqEnd * rate), end);
      osc.connect(gain);
      osc.start(start);
      osc.stop(end + 0.02);
      return;
    }
    const source = ctx.createBufferSource();
    source.buffer = this.getNoiseBuffer(ctx);
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = layer.filter;
    filter.Q.value = layer.q;
    filter.frequency.setValueAtTime(layer.freqStart * rate, start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(1, layer.freqEnd * rate), end);
    source.connect(filter).connect(gain);
    source.start(start);
    source.stop(end + 0.02);
  }
}
