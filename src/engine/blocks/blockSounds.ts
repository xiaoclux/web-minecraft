/**
 * 方块音效组：破坏 / 放置 / 走在上面的声音按材质分组（与 1.8.9 的 Block.SoundType 对应）。
 * 组别由方块自己声明；没声明的按"最有效工具 + 是否石质"猜一个合理默认值。
 */

import type { SoundSpec } from '../render/SoundManager';
import { ToolType, type BlockDef } from './BlockRegistry';

/** 材质音效组。 */
export const SoundGroup = {
  STONE: 'stone',
  WOOD: 'wood',
  GRAVEL: 'gravel',
  GRASS: 'grass',
  SAND: 'sand',
  CLOTH: 'cloth',
  GLASS: 'glass',
  METAL: 'metal',
  SNOW: 'snow',
  LADDER: 'ladder',
} as const;
export type SoundGroup = (typeof SoundGroup)[keyof typeof SoundGroup];

/** 一个音效组的三种声音参数：基频、噪声中心频率、音量。 */
interface GroupSpec {
  /** 噪声滤波中心频率（Hz）：越高越"脆"。 */
  noiseFreq: number;
  /** 敲击音的基频。 */
  toneFreq: number;
  /** 滤波器 Q：越大越"窄"越像金属 / 玻璃。 */
  q: number;
  volume: number;
}

const GROUP_SPECS: Readonly<Record<SoundGroup, GroupSpec>> = {
  stone: { noiseFreq: 1400, toneFreq: 220, q: 1.2, volume: 0.16 },
  wood: { noiseFreq: 900, toneFreq: 300, q: 1.5, volume: 0.15 },
  gravel: { noiseFreq: 2200, toneFreq: 160, q: 0.8, volume: 0.14 },
  grass: { noiseFreq: 2600, toneFreq: 180, q: 0.7, volume: 0.12 },
  sand: { noiseFreq: 3200, toneFreq: 140, q: 0.6, volume: 0.11 },
  cloth: { noiseFreq: 1200, toneFreq: 150, q: 0.6, volume: 0.1 },
  glass: { noiseFreq: 5200, toneFreq: 900, q: 4, volume: 0.16 },
  metal: { noiseFreq: 3800, toneFreq: 700, q: 5, volume: 0.16 },
  snow: { noiseFreq: 1800, toneFreq: 200, q: 0.6, volume: 0.1 },
  ladder: { noiseFreq: 1100, toneFreq: 320, q: 1.5, volume: 0.12 },
};

/** 按方块名前缀猜音效组（没有显式声明时用）。 */
const NAME_HINTS: readonly [RegExp, SoundGroup][] = [
  [/glass|ice/, SoundGroup.GLASS],
  [/(^|_)(iron|gold|diamond)_block$|anvil|rail/, SoundGroup.METAL],
  [/wool|carpet|bed|tnt/, SoundGroup.CLOTH],
  [/sand(?!stone)/, SoundGroup.SAND],
  [/gravel|clay/, SoundGroup.GRAVEL],
  [/snow/, SoundGroup.SNOW],
  [/ladder/, SoundGroup.LADDER],
  [/grass|leaves|sapling|flower|dandelion|poppy|crop|wheat|carrot|potato|cane|cactus|vine|mushroom/, SoundGroup.GRASS],
  [/log|plank|wood|door|fence|bookshelf|chest|crafting|jukebox|note/, SoundGroup.WOOD],
];

/** 方块的材质音效组。 */
export function soundGroupOf(def: BlockDef): SoundGroup {
  if (def.soundGroup) {
    return def.soundGroup;
  }
  for (const [pattern, group] of NAME_HINTS) {
    if (pattern.test(def.name)) {
      return group;
    }
  }
  if (def.tool === ToolType.AXE) {
    return SoundGroup.WOOD;
  }
  if (def.tool === ToolType.SHOVEL) {
    return SoundGroup.GRAVEL;
  }
  return SoundGroup.STONE;
}

/** 破坏音：一记闷响 + 材质噪声。 */
export function breakSound(group: SoundGroup): SoundSpec {
  const g = GROUP_SPECS[group];
  return {
    volume: g.volume,
    pitchJitter: 0.12,
    layers: [
      {
        kind: 'noise',
        filter: 'bandpass',
        freqStart: g.noiseFreq,
        freqEnd: g.noiseFreq * 0.4,
        q: g.q,
        duration: 0.18,
        gain: 1,
      },
      { kind: 'tone', type: 'triangle', freqStart: g.toneFreq, freqEnd: g.toneFreq * 0.5, duration: 0.12, gain: 0.5 },
    ],
  };
}

/** 放置音：比破坏更短更闷。 */
export function placeSound(group: SoundGroup): SoundSpec {
  const g = GROUP_SPECS[group];
  return {
    volume: g.volume * 0.85,
    pitchJitter: 0.1,
    layers: [
      {
        kind: 'noise',
        filter: 'bandpass',
        freqStart: g.noiseFreq * 0.8,
        freqEnd: g.noiseFreq * 0.35,
        q: g.q,
        duration: 0.1,
        gain: 1,
      },
      {
        kind: 'tone',
        type: 'triangle',
        freqStart: g.toneFreq * 1.2,
        freqEnd: g.toneFreq * 0.7,
        duration: 0.07,
        gain: 0.6,
      },
    ],
  };
}

/** 挖掘中的连续碎响（每隔几 tick 播一次）。 */
export function digSound(group: SoundGroup): SoundSpec {
  const g = GROUP_SPECS[group];
  return {
    volume: g.volume * 0.5,
    pitchJitter: 0.2,
    layers: [
      {
        kind: 'noise',
        filter: 'bandpass',
        freqStart: g.noiseFreq * 0.9,
        freqEnd: g.noiseFreq * 0.5,
        q: g.q,
        duration: 0.07,
        gain: 1,
      },
    ],
  };
}

/** 脚步声：很轻的一下材质噪声。 */
export function stepSound(group: SoundGroup): SoundSpec {
  const g = GROUP_SPECS[group];
  return {
    volume: g.volume * 0.45,
    pitchJitter: 0.25,
    layers: [
      {
        kind: 'noise',
        filter: 'bandpass',
        freqStart: g.noiseFreq * 0.7,
        freqEnd: g.noiseFreq * 0.3,
        q: g.q,
        duration: 0.08,
        gain: 1,
      },
    ],
  };
}
