/**
 * 生物叫声：按"嗓音类型"分组合成 —— 每组一条基频曲线与音色，
 * 闲置 / 受伤 / 死亡三种情形只改音高与时长，避免每种生物各写一套。
 */

import type { SoundLayer, SoundSpec } from '../render/SoundManager';

/** 嗓音类型。 */
export const MobVoice = {
  /** 低沉的哼声（僵尸、猪人）。 */
  GROAN: 'groan',
  /** 骨头咔哒（骷髅）。 */
  RATTLE: 'rattle',
  /** 嘶嘶（苦力怕、蜘蛛）。 */
  HISS: 'hiss',
  /** 家畜低鸣（牛、猪）。 */
  LOW: 'low',
  /** 咩咩 / 咕咕（羊、鸡）。 */
  BLEAT: 'bleat',
  /** 尖细吱吱（蝙蝠、末影螨）。 */
  SQUEAK: 'squeak',
  /** 黏糊（史莱姆）。 */
  SQUISH: 'squish',
  /** 空灵（末影人）。 */
  ETHEREAL: 'ethereal',
} as const;
export type MobVoice = (typeof MobVoice)[keyof typeof MobVoice];

interface VoiceSpec {
  /** 闲置叫声的基频。 */
  freq: number;
  /** 频率下滑的比例。 */
  slide: number;
  type: OscillatorType;
  duration: number;
  volume: number;
  /** 叠一层噪声（沙哑 / 嘶嘶感）。 */
  noiseFreq?: number;
  noiseGain?: number;
}

const VOICE_SPECS: Readonly<Record<MobVoice, VoiceSpec>> = {
  groan: { freq: 150, slide: 0.7, type: 'sawtooth', duration: 0.55, volume: 0.16, noiseFreq: 700, noiseGain: 0.3 },
  rattle: { freq: 520, slide: 0.85, type: 'square', duration: 0.28, volume: 0.13, noiseFreq: 2600, noiseGain: 0.5 },
  hiss: { freq: 320, slide: 0.9, type: 'sawtooth', duration: 0.7, volume: 0.14, noiseFreq: 4200, noiseGain: 1 },
  low: { freq: 190, slide: 0.75, type: 'triangle', duration: 0.7, volume: 0.16, noiseFreq: 500, noiseGain: 0.2 },
  bleat: { freq: 420, slide: 1.15, type: 'sawtooth', duration: 0.4, volume: 0.14, noiseFreq: 1500, noiseGain: 0.25 },
  squeak: { freq: 1500, slide: 1.4, type: 'sine', duration: 0.16, volume: 0.1 },
  squish: { freq: 260, slide: 0.5, type: 'sine', duration: 0.3, volume: 0.14, noiseFreq: 900, noiseGain: 0.6 },
  ethereal: { freq: 240, slide: 1.3, type: 'sine', duration: 0.9, volume: 0.13, noiseFreq: 1800, noiseGain: 0.2 },
};

/** 生物类型 → 嗓音。没列出的按"低鸣"处理。 */
const MOB_VOICES: Readonly<Record<string, MobVoice>> = {
  zombie: MobVoice.GROAN,
  skeleton: MobVoice.RATTLE,
  creeper: MobVoice.HISS,
  spider: MobVoice.HISS,
  cow: MobVoice.LOW,
  pig: MobVoice.LOW,
  sheep: MobVoice.BLEAT,
  chicken: MobVoice.BLEAT,
  bat: MobVoice.SQUEAK,
  squid: MobVoice.SQUISH,
  slime: MobVoice.SQUISH,
  enderman: MobVoice.ETHEREAL,
};

/** 叫声情形。 */
export const MobSoundKind = { IDLE: 'idle', HURT: 'hurt', DEATH: 'death' } as const;
export type MobSoundKind = (typeof MobSoundKind)[keyof typeof MobSoundKind];

/** 受伤叫声更高更短，死亡叫声更低更长。 */
const KIND_PITCH: Readonly<Record<MobSoundKind, number>> = { idle: 1, hurt: 1.25, death: 0.8 };
const KIND_DURATION: Readonly<Record<MobSoundKind, number>> = { idle: 1, hurt: 0.6, death: 1.6 };

/** 幼崽声音更尖。 */
export const BABY_PITCH = 1.5;

/** 某种生物在某种情形下的叫声。 */
export function mobSound(mobType: string, kind: MobSoundKind): SoundSpec {
  const voice = VOICE_SPECS[MOB_VOICES[mobType] ?? MobVoice.LOW];
  const pitch = KIND_PITCH[kind];
  const duration = voice.duration * KIND_DURATION[kind];
  const layers: SoundLayer[] = [
    {
      kind: 'tone',
      type: voice.type,
      freqStart: voice.freq * pitch,
      freqEnd: voice.freq * pitch * voice.slide,
      duration,
      gain: 1,
    },
  ];
  if (voice.noiseFreq) {
    layers.push({
      kind: 'noise',
      filter: 'bandpass',
      freqStart: voice.noiseFreq * pitch,
      freqEnd: voice.noiseFreq * pitch * voice.slide,
      q: 1.5,
      duration,
      gain: voice.noiseGain ?? 0.3,
    });
  }
  return { layers, volume: voice.volume, pitchJitter: 0.12 };
}
