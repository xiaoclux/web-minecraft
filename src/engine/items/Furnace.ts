import { getItem } from './ItemRegistry';
import { canMerge, maxStackOf, type ItemStack } from './ItemStack';

/** 一次烧炼所需 tick。 */
export const SMELT_TICKS = 200;

/** 熔炉状态。 */
export interface FurnaceState {
  input: ItemStack | null;
  fuel: ItemStack | null;
  output: ItemStack | null;
  /** 当前燃料剩余燃烧 tick。 */
  burnTicks: number;
  /** 当前燃料总燃烧 tick（用于进度条）。 */
  burnTotal: number;
  cookTicks: number;
}

/** 新建空熔炉。 */
export function createFurnace(): FurnaceState {
  return { input: null, fuel: null, output: null, burnTicks: 0, burnTotal: 0, cookTicks: 0 };
}

function canSmelt(state: FurnaceState): boolean {
  if (!state.input) {
    return false;
  }
  const result = getItem(state.input.id)?.smeltsInto;
  if (!result) {
    return false;
  }
  if (!state.output) {
    return true;
  }
  return state.output.id === result && state.output.count < maxStackOf(result);
}

/** 熔炉每 tick 逻辑，返回是否有变化。 */
export function tickFurnace(state: FurnaceState): boolean {
  let changed = false;
  const smeltable = canSmelt(state);
  if (state.burnTicks > 0) {
    state.burnTicks--;
    changed = true;
  }
  if (state.burnTicks === 0 && smeltable && state.fuel) {
    const burn = getItem(state.fuel.id)?.burnTicks ?? 0;
    if (burn > 0) {
      state.burnTicks = burn;
      state.burnTotal = burn;
      state.fuel = state.fuel.count > 1 ? { ...state.fuel, count: state.fuel.count - 1 } : null;
      changed = true;
    }
  }
  if (state.burnTicks > 0 && smeltable) {
    state.cookTicks++;
    changed = true;
    if (state.cookTicks >= SMELT_TICKS) {
      state.cookTicks = 0;
      const input = state.input as ItemStack;
      const resultId = getItem(input.id)?.smeltsInto as string;
      const result: ItemStack = { id: resultId, count: 1 };
      if (state.output && canMerge(state.output, result)) {
        state.output = { ...state.output, count: state.output.count + 1 };
      } else {
        state.output = result;
      }
      state.input = input.count > 1 ? { ...input, count: input.count - 1 } : null;
    }
  } else if (state.cookTicks > 0) {
    state.cookTicks = Math.max(0, state.cookTicks - 2);
    changed = true;
  }
  return changed;
}
