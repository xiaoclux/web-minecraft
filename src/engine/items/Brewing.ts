import type { ItemStack } from './ItemStack';
import { BREW_TICKS, brewResult } from './potions';

/** 酿造台的瓶位数。 */
export const BREWING_BOTTLE_COUNT = 3;

/** 酿造台状态。 */
export interface BrewingState {
  ingredient: ItemStack | null;
  bottles: (ItemStack | null)[];
  /** 已酿造的 tick，0 表示没在酿。 */
  brewTicks: number;
}

/** 新建空酿造台。 */
export function createBrewingStand(): BrewingState {
  return { ingredient: null, bottles: new Array<ItemStack | null>(BREWING_BOTTLE_COUNT).fill(null), brewTicks: 0 };
}

/** 当前原料能不能对至少一个瓶起作用。 */
export function canBrew(state: BrewingState): boolean {
  if (!state.ingredient) {
    return false;
  }
  const ingredientId = state.ingredient.id;
  return state.bottles.some((bottle) => bottle !== null && brewResult(bottle.id, ingredientId) !== null);
}

/**
 * 酿造台每 tick 逻辑，返回是否有变化。
 * 与 1.8.9 一致：三个瓶同时酿、酿完消耗一个原料；中途拿走原料或瓶子则进度归零。
 */
export function tickBrewing(state: BrewingState): boolean {
  if (!canBrew(state)) {
    if (state.brewTicks === 0) {
      return false;
    }
    state.brewTicks = 0;
    return true;
  }
  state.brewTicks++;
  if (state.brewTicks < BREW_TICKS) {
    return true;
  }
  const ingredient = state.ingredient as ItemStack;
  for (let i = 0; i < state.bottles.length; i++) {
    const bottle = state.bottles[i];
    if (!bottle) {
      continue;
    }
    const result = brewResult(bottle.id, ingredient.id);
    if (result) {
      state.bottles[i] = { id: result, count: bottle.count };
    }
  }
  state.ingredient = ingredient.count > 1 ? { ...ingredient, count: ingredient.count - 1 } : null;
  state.brewTicks = 0;
  return true;
}
