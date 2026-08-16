import { describe, expect, it } from 'vitest';
import { EffectId, INSTANT_BASE_AMOUNT, MIN_SPEED_MULTIPLIER } from '../src/engine/entities/effects';
import type { EntityContext } from '../src/engine/entities/EntityContext';
import { Mob } from '../src/engine/entities/Mob';
import { Player } from '../src/engine/player/Player';
import { emptyWorld } from './helpers';

function ctx(): EntityContext {
  return { world: emptyWorld(0), random: () => 0.5, playSound: () => {} } as unknown as EntityContext;
}

/** 跑 n 个 tick 的效果计时（不走完整 tick，避免牵扯物理）。 */
function tickEffects(entity: Player | Mob, n: number): void {
  for (let i = 0; i < n; i++) {
    (entity as unknown as { tickEffects(c: EntityContext): void }).tickEffects(ctx());
  }
}

describe('状态效果', () => {
  it('加效果后能查到等级，到时间自动消失', () => {
    const p = new Player();
    expect(p.effectLevel(EffectId.SPEED)).toBe(0);
    p.addEffect(EffectId.SPEED, 5, 1);
    expect(p.effectLevel(EffectId.SPEED)).toBe(2);
    expect(p.hasEffect(EffectId.SPEED)).toBe(true);
    tickEffects(p, 5);
    expect(p.hasEffect(EffectId.SPEED)).toBe(false);
  });

  it('同种效果等级高的赢，等级相同取时间长的', () => {
    const p = new Player();
    p.addEffect(EffectId.SPEED, 100, 1);
    p.addEffect(EffectId.SPEED, 999, 0);
    expect(p.effectLevel(EffectId.SPEED)).toBe(2);
    p.addEffect(EffectId.SPEED, 999, 1);
    expect(p.effects.get(EffectId.SPEED)?.ticks).toBe(999);
  });

  it('迅捷加速、缓慢减速，且不会完全走不动', () => {
    const p = new Player();
    expect(p.speedMultiplier).toBe(1);
    p.addEffect(EffectId.SPEED, 100, 1);
    expect(p.speedMultiplier).toBeCloseTo(1.4, 5);
    p.addEffect(EffectId.SLOWNESS, 100, 9);
    expect(p.speedMultiplier).toBe(MIN_SPEED_MULTIPLIER);
  });

  it('力量加伤害、虚弱减伤害', () => {
    const p = new Player();
    expect(p.meleeDamageBonus).toBe(0);
    p.addEffect(EffectId.STRENGTH, 100, 0);
    expect(p.meleeDamageBonus).toBe(3);
    p.addEffect(EffectId.WEAKNESS, 100, 0);
    expect(p.meleeDamageBonus).toBe(-1);
  });

  it('瞬间治疗当场加血、不驻留', () => {
    const p = new Player();
    p.health = 5;
    p.addEffect(EffectId.INSTANT_HEALTH, 100, 0);
    expect(p.health).toBe(5 + INSTANT_BASE_AMOUNT);
    expect(p.hasEffect(EffectId.INSTANT_HEALTH)).toBe(false);
  });

  it('生命恢复按周期回血，中毒按周期掉血但打不死', () => {
    const p = new Player();
    p.health = 10;
    p.addEffect(EffectId.REGENERATION, 200, 0);
    tickEffects(p, 50);
    expect(p.health).toBeGreaterThan(10);

    const q = new Player();
    q.health = 2;
    q.addEffect(EffectId.POISON, 400, 0);
    tickEffects(q, 300);
    expect(q.health).toBe(1);
  });

  it('喝牛奶式的清空会移除全部效果', () => {
    const p = new Player();
    p.addEffect(EffectId.SPEED, 100, 0);
    p.addEffect(EffectId.POISON, 100, 0);
    p.clearEffects();
    expect(p.effects.size).toBe(0);
  });

  it('效果随存档往返', () => {
    const p = new Player();
    p.addEffect(EffectId.NIGHT_VISION, 1234, 2);
    const restored = new Player();
    restored.loadEffects(p.serializeEffects());
    expect(restored.effectLevel(EffectId.NIGHT_VISION)).toBe(3);
    expect(restored.effects.get(EffectId.NIGHT_VISION)?.ticks).toBe(1234);
  });

  it('生物也能带效果', () => {
    const mob = new Mob('zombie');
    mob.addEffect(EffectId.STRENGTH, 100, 0);
    expect(mob.effectLevel(EffectId.STRENGTH)).toBe(1);
  });
});
