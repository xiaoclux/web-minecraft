import { describe, expect, it } from 'vitest';
import { EffectId } from '../src/engine/entities/effects';
import { BREWING_BOTTLE_COUNT, createBrewingStand, tickBrewing } from '../src/engine/items/Brewing';
import { getItem } from '../src/engine/items/ItemRegistry';
import { BREW_TICKS, BrewingIngredient, POTION_DEFS, brewResult, potionItemId, potionOfItem } from '../src/engine/items/potions';

describe('药水数据', () => {
  it('每种药水都有普通与喷溅两个物品，且能反查回种类', () => {
    for (const potion of Object.values(POTION_DEFS)) {
      for (const splash of [false, true]) {
        const id = potionItemId(potion.id, splash);
        expect(getItem(id)?.potion).toBe(potion.id);
        expect(potionOfItem(id)).toEqual({ potion, splash });
      }
    }
    expect(potionOfItem('sugar')).toBeNull();
  });

  it('增强档等级为 II，延长档时长更长', () => {
    expect(POTION_DEFS.speed_strong.amplifier).toBe(1);
    expect(POTION_DEFS.speed_long.ticks).toBeGreaterThan(POTION_DEFS.speed.ticks);
    expect(POTION_DEFS.speed.effect).toBe(EffectId.SPEED);
  });
});

describe('酿造规则', () => {
  const water = potionItemId('water');
  const awkward = potionItemId('awkward');

  it('水瓶 + 下界疣 = 粗制药水，粗制 + 糖 = 迅捷', () => {
    expect(brewResult(water, BrewingIngredient.NETHER_WART)).toBe(awkward);
    expect(brewResult(awkward, BrewingIngredient.SUGAR)).toBe(potionItemId('speed'));
    expect(brewResult(water, BrewingIngredient.SUGAR)).toBeNull();
  });

  it('红石延长、萤石增强、火药变喷溅，且不能重复', () => {
    const speed = potionItemId('speed');
    expect(brewResult(speed, BrewingIngredient.REDSTONE)).toBe(potionItemId('speed_long'));
    expect(brewResult(speed, BrewingIngredient.GLOWSTONE_DUST)).toBe(potionItemId('speed_strong'));
    expect(brewResult(potionItemId('speed_long'), BrewingIngredient.REDSTONE)).toBeNull();
    expect(brewResult(speed, BrewingIngredient.GUNPOWDER)).toBe(potionItemId('speed', true));
    expect(brewResult(potionItemId('speed', true), BrewingIngredient.GUNPOWDER)).toBeNull();
    // 喷溅药水继续酿还是喷溅
    expect(brewResult(potionItemId('awkward', true), BrewingIngredient.SUGAR)).toBe(potionItemId('speed', true));
  });

  it('发酵蛛眼把正面效果反转，档位跟着走', () => {
    expect(brewResult(water, BrewingIngredient.FERMENTED_SPIDER_EYE)).toBe(potionItemId('weakness'));
    expect(brewResult(potionItemId('speed_long'), BrewingIngredient.FERMENTED_SPIDER_EYE)).toBe(
      potionItemId('slowness_long'),
    );
    // 迟缓没有增强档 → 退回基础档
    expect(brewResult(potionItemId('speed_strong'), BrewingIngredient.FERMENTED_SPIDER_EYE)).toBe(
      potionItemId('slowness'),
    );
    expect(brewResult(potionItemId('fire_resistance'), BrewingIngredient.FERMENTED_SPIDER_EYE)).toBeNull();
  });
});

describe('酿造台', () => {
  it('放好原料与瓶子后按时酿完，消耗一个原料，三个瓶一起变', () => {
    const state = createBrewingStand();
    state.ingredient = { id: BrewingIngredient.NETHER_WART, count: 2 };
    state.bottles[0] = { id: potionItemId('water'), count: 1 };
    state.bottles[2] = { id: potionItemId('water'), count: 1 };
    for (let i = 0; i < BREW_TICKS - 1; i++) {
      expect(tickBrewing(state)).toBe(true);
    }
    expect(state.bottles[0]?.id).toBe(potionItemId('water'));
    tickBrewing(state);
    expect(state.bottles[0]?.id).toBe(potionItemId('awkward'));
    expect(state.bottles[1]).toBeNull();
    expect(state.bottles[2]?.id).toBe(potionItemId('awkward'));
    expect(state.ingredient?.count).toBe(1);
    expect(state.brewTicks).toBe(0);
    expect(state.bottles.length).toBe(BREWING_BOTTLE_COUNT);
  });

  it('原料对瓶子无效时不酿，拿走原料进度归零', () => {
    const state = createBrewingStand();
    state.ingredient = { id: BrewingIngredient.SUGAR, count: 1 };
    state.bottles[0] = { id: potionItemId('water'), count: 1 };
    expect(tickBrewing(state)).toBe(false);
    state.ingredient = { id: BrewingIngredient.NETHER_WART, count: 1 };
    tickBrewing(state);
    tickBrewing(state);
    expect(state.brewTicks).toBe(2);
    state.ingredient = null;
    expect(tickBrewing(state)).toBe(true);
    expect(state.brewTicks).toBe(0);
  });
});
