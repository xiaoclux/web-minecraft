/** 极简合成音效（无外部资源）。 */
interface SoundSpec {
  type: OscillatorType;
  freqStart: number;
  freqEnd: number;
  duration: number;
  volume: number;
}

const SOUNDS: Record<string, SoundSpec> = {
  break: { type: 'square', freqStart: 220, freqEnd: 90, duration: 0.12, volume: 0.15 },
  place: { type: 'square', freqStart: 320, freqEnd: 200, duration: 0.08, volume: 0.12 },
  hit: { type: 'sawtooth', freqStart: 200, freqEnd: 120, duration: 0.1, volume: 0.15 },
  hurt: { type: 'sawtooth', freqStart: 300, freqEnd: 80, duration: 0.25, volume: 0.2 },
  pickup: { type: 'sine', freqStart: 700, freqEnd: 1100, duration: 0.1, volume: 0.12 },
  explode: { type: 'sawtooth', freqStart: 120, freqEnd: 30, duration: 0.6, volume: 0.35 },
  bow: { type: 'triangle', freqStart: 500, freqEnd: 900, duration: 0.15, volume: 0.1 },
  eat: { type: 'triangle', freqStart: 200, freqEnd: 260, duration: 0.12, volume: 0.1 },
  fuse: { type: 'triangle', freqStart: 800, freqEnd: 800, duration: 0.5, volume: 0.08 },
  level: { type: 'sine', freqStart: 800, freqEnd: 1600, duration: 0.3, volume: 0.12 },
};

const MAX_DISTANCE = 24;

/** 音效播放器。 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  enabled = true;

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
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {
        /* 浏览器要求用户手势后才可播放，忽略 */
      });
    }
    return this.ctx;
  }

  /** 播放音效；distance 为与听者距离（用于衰减）。 */
  play(name: string, distance = 0): void {
    const spec = SOUNDS[name];
    const ctx = this.ensureContext();
    if (!spec || !ctx || distance > MAX_DISTANCE) {
      return;
    }
    const attenuation = 1 - distance / MAX_DISTANCE;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = spec.type;
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(spec.freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, spec.freqEnd), now + spec.duration);
    gain.gain.setValueAtTime(spec.volume * attenuation, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + spec.duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + spec.duration + 0.02);
  }
}
