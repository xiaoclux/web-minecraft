/**
 * 程序化背景音乐：C418 风格的稀疏钢琴 —— 慢速、大量留白、五声音阶里随机游走，
 * 偶尔叠一个柔和的和弦。每首曲子几十秒，放完静默一段时间再放下一首。
 * 另有洞穴环境音：玩家在地下且光线暗时偶尔来一记低沉的"洞穴回响"。
 */

import type { SoundManager } from './SoundManager';

/** 一个八度内的半音数。 */
const SEMITONES_PER_OCTAVE = 12;
/** 基准音 A4。 */
const A4_FREQUENCY = 440;
const A4_MIDI = 69;

/** 五声音阶（相对主音的半音数）：C D E G A，配上大七度的柔和感。 */
const SCALE_STEPS = [0, 2, 4, 7, 9, 11] as const;
/** 主音候选（MIDI 音高）：F3 / A3 / C4，换曲时随机挑一个。 */
const ROOT_NOTES: readonly number[] = [53, 57, 60];
/** 旋律音的八度范围（相对主音）。 */
const MIN_OCTAVE = 0;
const MAX_OCTAVE = 2;

/** 每个音的时长与间隔（秒）。 */
const NOTE_DURATION = 2.6;
const MIN_NOTE_GAP = 0.5;
const MAX_NOTE_GAP = 2.4;
/** 一首曲子的音符数。 */
const MIN_NOTES_PER_TRACK = 14;
const MAX_NOTES_PER_TRACK = 26;
/** 两首之间的静默（秒）。 */
const MIN_SILENCE = 45;
const MAX_SILENCE = 120;
/** 起手的静默：进游戏别立刻响。 */
const INITIAL_SILENCE = 20;
/** 叠和弦的概率与和弦音的音量比例。 */
const CHORD_CHANCE = 0.3;
const CHORD_GAIN = 0.5;
/** 单音音量。 */
const NOTE_GAIN = 0.16;
/** 钢琴音色：基频 + 两个泛音的相对音量。 */
const PARTIALS: readonly { ratio: number; gain: number }[] = [
  { ratio: 1, gain: 1 },
  { ratio: 2, gain: 0.35 },
  { ratio: 3, gain: 0.12 },
];
/** 起音与释音（秒）。 */
const ATTACK = 0.02;

/** 洞穴环境音：判定间隔（秒）与触发概率。 */
const AMBIENT_CHECK_SECONDS = 12;
const AMBIENT_CHANCE = 0.35;

/** MIDI 音高 → 频率。 */
function midiToFreq(midi: number): number {
  return A4_FREQUENCY * Math.pow(2, (midi - A4_MIDI) / SEMITONES_PER_OCTAVE);
}

/**
 * 背景音乐播放器：自己排程下一个音符，不占游戏 tick。
 * 音量由 SoundManager 的音乐总线控制（设置里可单独调）。
 */
export class MusicPlayer {
  private nextNoteAt = 0;
  private notesLeft = 0;
  private root = ROOT_NOTES[0];
  private scaleIndex = 0;
  private nextAmbientCheckAt = 0;
  /** 玩家是否在昏暗的地下（由 Game 每 tick 更新）。 */
  underground = false;
  enabled = true;

  constructor(private readonly sound: SoundManager) {}

  /**
   * 每帧调用：到点就排下一个音符 / 环境音。
   * @param random 0~1 随机源（与世界生成分开）
   */
  update(random: () => number): void {
    const ctx = this.sound.audioContext;
    const destination = this.sound.musicDestination;
    if (!this.enabled || !ctx || !destination || ctx.state !== 'running') {
      return;
    }
    const now = ctx.currentTime;
    if (this.nextNoteAt === 0) {
      this.nextNoteAt = now + INITIAL_SILENCE;
      this.nextAmbientCheckAt = now + AMBIENT_CHECK_SECONDS;
    }
    this.updateAmbient(ctx, destination, now, random);
    if (now < this.nextNoteAt) {
      return;
    }
    if (this.notesLeft <= 0) {
      this.startTrack(random);
    }
    this.playNote(ctx, destination, now, random);
  }

  /** 换一首：随机主音、随机长度。 */
  private startTrack(random: () => number): void {
    this.root = ROOT_NOTES[Math.floor(random() * ROOT_NOTES.length)];
    this.notesLeft = MIN_NOTES_PER_TRACK + Math.floor(random() * (MAX_NOTES_PER_TRACK - MIN_NOTES_PER_TRACK + 1));
    this.scaleIndex = Math.floor(random() * SCALE_STEPS.length);
  }

  private playNote(ctx: AudioContext, destination: AudioNode, now: number, random: () => number): void {
    // 在音阶上随机游走（多为相邻音，偶尔跳一下），比纯随机更像旋律
    const step = Math.floor(random() * 5) - 2;
    this.scaleIndex = Math.max(0, Math.min(SCALE_STEPS.length * (MAX_OCTAVE + 1) - 1, this.scaleIndex + step));
    const octave = MIN_OCTAVE + Math.floor(this.scaleIndex / SCALE_STEPS.length);
    const midi = this.root + SCALE_STEPS[this.scaleIndex % SCALE_STEPS.length] + octave * SEMITONES_PER_OCTAVE;
    this.scheduleTone(ctx, destination, midiToFreq(midi), now, NOTE_GAIN, NOTE_DURATION);
    if (random() < CHORD_CHANCE) {
      // 叠一个三度或五度
      const interval = random() < 0.5 ? 4 : 7;
      this.scheduleTone(ctx, destination, midiToFreq(midi + interval), now, NOTE_GAIN * CHORD_GAIN, NOTE_DURATION);
    }
    this.notesLeft--;
    const gap = MIN_NOTE_GAP + random() * (MAX_NOTE_GAP - MIN_NOTE_GAP);
    this.nextNoteAt = now + (this.notesLeft > 0 ? gap : MIN_SILENCE + random() * (MAX_SILENCE - MIN_SILENCE));
  }

  /** 排一个钢琴音：几个泛音 + 快起慢落的包络。 */
  private scheduleTone(
    ctx: AudioContext,
    destination: AudioNode,
    freq: number,
    start: number,
    gainValue: number,
    duration: number,
  ): void {
    for (const partial of PARTIALS) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * partial.ratio;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainValue * partial.gain), start + ATTACK);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain).connect(destination);
      osc.start(start);
      osc.stop(start + duration + 0.05);
    }
  }

  /** 洞穴环境音：地下昏暗处偶尔来一记低频回响。 */
  private updateAmbient(ctx: AudioContext, destination: AudioNode, now: number, random: () => number): void {
    if (now < this.nextAmbientCheckAt) {
      return;
    }
    this.nextAmbientCheckAt = now + AMBIENT_CHECK_SECONDS;
    if (!this.underground || random() >= AMBIENT_CHANCE) {
      return;
    }
    const base = 60 + random() * 70;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * 0.6, now + 3);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.6);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 3);
    osc.connect(gain).connect(destination);
    osc.start(now);
    osc.stop(now + 3.1);
  }
}
