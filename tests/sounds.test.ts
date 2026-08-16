import { describe, expect, it } from 'vitest';
import { BLOCK_DEFS, BlockId, getBlock } from '../src/engine/blocks/BlockRegistry';
import { SoundGroup, breakSound, digSound, placeSound, soundGroupOf, stepSound } from '../src/engine/blocks/blockSounds';
import { MobSoundKind, mobSound } from '../src/engine/entities/mobSounds';
import { SOUNDS } from '../src/engine/render/SoundManager';

describe('方块材质音效', () => {
  it('按名字与工具分到合理的材质组', () => {
    expect(soundGroupOf(getBlock(BlockId.STONE))).toBe(SoundGroup.STONE);
    expect(soundGroupOf(getBlock(BlockId.GLASS))).toBe(SoundGroup.GLASS);
    expect(soundGroupOf(getBlock(BlockId.SAND))).toBe(SoundGroup.SAND);
    expect(soundGroupOf(getBlock(BlockId.GRASS))).toBe(SoundGroup.GRASS);
    expect(soundGroupOf(getBlock(BlockId.LOG))).toBe(SoundGroup.WOOD);
    expect(soundGroupOf(getBlock(BlockId.WOOL))).toBe(SoundGroup.CLOTH);
    expect(soundGroupOf(getBlock(BlockId.IRON_BLOCK))).toBe(SoundGroup.METAL);
    // 砂岩不能被 sand 规则吃掉
    expect(soundGroupOf(getBlock(BlockId.SANDSTONE))).toBe(SoundGroup.STONE);
  });

  it('每个方块都能拿到四种音效，且参数合法', () => {
    for (const def of BLOCK_DEFS) {
      const group = soundGroupOf(def);
      for (const spec of [breakSound(group), placeSound(group), digSound(group), stepSound(group)]) {
        expect(spec.volume).toBeGreaterThan(0);
        expect(spec.layers.length).toBeGreaterThan(0);
        for (const layer of spec.layers) {
          expect(layer.duration).toBeGreaterThan(0);
          expect(layer.freqStart).toBeGreaterThan(0);
          expect(layer.freqEnd).toBeGreaterThan(0);
        }
      }
    }
  });

  it('脚步比破坏轻，挖掘声最轻', () => {
    const group = SoundGroup.STONE;
    expect(stepSound(group).volume).toBeLessThan(breakSound(group).volume);
    expect(digSound(group).volume).toBeLessThan(breakSound(group).volume);
  });
});

describe('生物叫声', () => {
  it('受伤比闲置音高、死亡比闲置低沉且更长', () => {
    const idle = mobSound('zombie', MobSoundKind.IDLE);
    const hurt = mobSound('zombie', MobSoundKind.HURT);
    const death = mobSound('zombie', MobSoundKind.DEATH);
    expect(hurt.layers[0].freqStart).toBeGreaterThan(idle.layers[0].freqStart);
    expect(death.layers[0].freqStart).toBeLessThan(idle.layers[0].freqStart);
    expect(death.layers[0].duration).toBeGreaterThan(idle.layers[0].duration);
  });

  it('未知生物回落到默认嗓音而不是崩溃', () => {
    const spec = mobSound('unknown_mob', MobSoundKind.IDLE);
    expect(spec.layers.length).toBeGreaterThan(0);
    expect(spec.volume).toBeGreaterThan(0);
  });
});

describe('通用音效表', () => {
  it('每条音效的层参数都合法', () => {
    for (const [name, spec] of Object.entries(SOUNDS)) {
      expect(spec.volume, name).toBeGreaterThan(0);
      expect(spec.layers.length, name).toBeGreaterThan(0);
      for (const layer of spec.layers) {
        expect(layer.duration, name).toBeGreaterThan(0);
        expect(layer.gain, name).toBeGreaterThan(0);
      }
    }
  });
});
