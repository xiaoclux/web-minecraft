import { MOUSE_RIGHT } from '../constants/keys';
import type { Screen } from '../events/GameState';
import type { FurnaceState } from './Furnace';
import { Inventory } from './Inventory';
import { getItem } from './ItemRegistry';
import { canMerge, maxStackOf, type ItemStack } from './ItemStack';
import { matchRecipe } from './Recipes';

/** 容器格引用。 */
export interface SlotRef {
  kind: 'inventory' | 'craft' | 'craftResult' | 'furnaceInput' | 'furnaceFuel' | 'furnaceOutput' | 'creative';
  index: number;
  /** 创造模式列表中点击的物品 id。 */
  itemId?: string;
}

/** 容器控制器需要从游戏获取的上下文。 */
export interface ContainerHost {
  readonly inventory: Inventory;
  readonly craftingGrid: (ItemStack | null)[];
  readonly craftGridSize: number;
  readonly openFurnace: FurnaceState | null;
  readonly currentScreen: Screen;
  readonly isCreative: boolean;
  /** 通知 UI 刷新。 */
  notifyChanged(): void;
}

const CRAFT_GRID_SIZE = 9;
const CRAFT_GRID_STRIDE = 3;
const HOTBAR_END = 9;
const INVENTORY_END = 36;
const MAX_SHIFT_CRAFTS = 64;

/** 背包 / 合成 / 熔炉的格子点击逻辑（与渲染无关，可单测）。 */
export class ContainerController {
  private cursorStack: ItemStack | null = null;

  constructor(private readonly host: ContainerHost) {}

  /** 光标物品。 */
  get cursor(): ItemStack | null {
    return this.cursorStack;
  }

  /**
   * 收回光标物品到背包（关闭界面时）。
   * 背包放不下时**保留在光标上**而不是丢进世界——玩家在界面里选中的东西不应该凭空掉到地上。
   * @returns 放不下的数量，0 表示已全部收回
   */
  returnCursor(): number {
    if (!this.cursorStack) {
      return 0;
    }
    const remaining = this.host.inventory.add(this.cursorStack);
    this.cursorStack = remaining > 0 ? { ...this.cursorStack, count: remaining } : null;
    this.host.notifyChanged();
    return remaining;
  }

  private getSlot(ref: SlotRef): ItemStack | null {
    switch (ref.kind) {
      case 'inventory':
        return this.host.inventory.get(ref.index);
      case 'craft':
        return this.host.craftingGrid[ref.index] ?? null;
      case 'craftResult':
        return this.craftResult();
      case 'furnaceInput':
        return this.host.openFurnace?.input ?? null;
      case 'furnaceFuel':
        return this.host.openFurnace?.fuel ?? null;
      case 'furnaceOutput':
        return this.host.openFurnace?.output ?? null;
      case 'creative':
        return ref.itemId ? { id: ref.itemId, count: 1 } : null;
      default:
        return null;
    }
  }

  private setSlot(ref: SlotRef, stack: ItemStack | null): void {
    const value = stack && stack.count > 0 ? stack : null;
    switch (ref.kind) {
      case 'inventory':
        this.host.inventory.set(ref.index, value);
        break;
      case 'craft':
        this.host.craftingGrid[ref.index] = value;
        break;
      case 'furnaceInput': {
        const f = this.host.openFurnace;
        if (f) {
          f.input = value;
        }
        break;
      }
      case 'furnaceFuel': {
        const f = this.host.openFurnace;
        if (f) {
          f.fuel = value;
        }
        break;
      }
      case 'furnaceOutput': {
        const f = this.host.openFurnace;
        if (f) {
          f.output = value;
        }
        break;
      }
      default:
        break;
    }
    this.host.notifyChanged();
  }

  /** 当前合成结果。 */
  craftResult(): ItemStack | null {
    const size = this.host.craftGridSize;
    const grid: (ItemStack | null)[] = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        grid.push(this.host.craftingGrid[r * CRAFT_GRID_STRIDE + c] ?? null);
      }
    }
    return matchRecipe(grid, size);
  }

  /**
   * 处理 UI 格子点击。
   * @param button 0 左键（整组）/ 2 右键（一半 / 单个）
   * @param shift 是否 shift（快速移动）
   */
  handleSlotClick(ref: SlotRef, button: number, shift: boolean): void {
    if (ref.kind === 'creative') {
      this.handleCreativeClick(ref, shift);
      return;
    }
    if (ref.kind === 'craftResult' || ref.kind === 'furnaceOutput') {
      this.takeOutput(ref, shift);
      return;
    }
    const slot = this.getSlot(ref);
    if (shift) {
      this.quickMove(ref, slot);
      return;
    }
    if (ref.kind === 'furnaceFuel' && this.cursorStack && !getItem(this.cursorStack.id)?.burnTicks) {
      return;
    }
    if (!this.cursorStack) {
      if (!slot) {
        return;
      }
      if (button === MOUSE_RIGHT) {
        const half = Math.ceil(slot.count / 2);
        this.cursorStack = { ...slot, count: half };
        this.setSlot(ref, { ...slot, count: slot.count - half });
      } else {
        this.cursorStack = slot;
        this.setSlot(ref, null);
      }
      this.host.notifyChanged();
      return;
    }
    const cursor = this.cursorStack;
    if (!slot) {
      if (button === MOUSE_RIGHT) {
        this.setSlot(ref, { ...cursor, count: 1 });
        this.cursorStack = cursor.count > 1 ? { ...cursor, count: cursor.count - 1 } : null;
      } else {
        this.setSlot(ref, cursor);
        this.cursorStack = null;
      }
      this.host.notifyChanged();
      return;
    }
    if (canMerge(slot, cursor)) {
      const max = maxStackOf(slot.id);
      const move = button === MOUSE_RIGHT ? Math.min(1, max - slot.count) : Math.min(cursor.count, max - slot.count);
      if (move > 0) {
        this.setSlot(ref, { ...slot, count: slot.count + move });
        this.cursorStack = cursor.count - move > 0 ? { ...cursor, count: cursor.count - move } : null;
      }
      this.host.notifyChanged();
      return;
    }
    // 交换
    this.setSlot(ref, cursor);
    this.cursorStack = slot;
    this.host.notifyChanged();
  }

  private handleCreativeClick(ref: SlotRef, shift: boolean): void {
    if (!ref.itemId) {
      return;
    }
    const stack: ItemStack = { id: ref.itemId, count: maxStackOf(ref.itemId) };
    if (shift) {
      this.host.inventory.add(stack);
    } else if (this.cursorStack && this.cursorStack.id === ref.itemId) {
      this.cursorStack = null;
    } else {
      this.cursorStack = stack;
    }
    this.host.notifyChanged();
  }

  /** 创造模式：删除光标物品（点击空白/删除区）。 */
  clearCursor(): void {
    if (this.host.isCreative) {
      this.cursorStack = null;
      this.host.notifyChanged();
    }
  }

  private takeOutput(ref: SlotRef, shift: boolean): void {
    const result = this.getSlot(ref);
    if (!result) {
      return;
    }
    if (shift) {
      // 尽可能多次合成
      let guard = 0;
      while (guard++ < MAX_SHIFT_CRAFTS) {
        const r = this.getSlot(ref);
        if (!r) {
          break;
        }
        const remaining = this.host.inventory.add({ ...r });
        if (remaining > 0) {
          this.host.inventory.removeItems(r.id, r.count - remaining);
          break;
        }
        this.consumeOutput(ref);
        if (ref.kind === 'furnaceOutput') {
          break;
        }
      }
      this.host.notifyChanged();
      return;
    }
    if (this.cursorStack) {
      if (!canMerge(this.cursorStack, result) || this.cursorStack.count + result.count > maxStackOf(result.id)) {
        return;
      }
      this.cursorStack = { ...this.cursorStack, count: this.cursorStack.count + result.count };
    } else {
      this.cursorStack = { ...result };
    }
    this.consumeOutput(ref);
    this.host.notifyChanged();
  }

  private consumeOutput(ref: SlotRef): void {
    if (ref.kind === 'craftResult') {
      for (let i = 0; i < CRAFT_GRID_SIZE; i++) {
        const s = this.host.craftingGrid[i];
        if (s) {
          this.host.craftingGrid[i] = s.count > 1 ? { ...s, count: s.count - 1 } : null;
        }
      }
      return;
    }
    if (ref.kind === 'furnaceOutput') {
      const f = this.host.openFurnace;
      if (f) {
        f.output = null;
      }
    }
  }

  private quickMove(ref: SlotRef, slot: ItemStack | null): void {
    if (!slot) {
      return;
    }
    if (ref.kind === 'inventory') {
      const screen = this.host.currentScreen;
      if (screen === 'furnace') {
        const f = this.host.openFurnace;
        if (f) {
          const def = getItem(slot.id);
          const target: SlotRef | null = def?.smeltsInto
            ? { kind: 'furnaceInput', index: 0 }
            : def?.burnTicks
              ? { kind: 'furnaceFuel', index: 0 }
              : null;
          if (target) {
            const existing = this.getSlot(target);
            if (!existing) {
              this.setSlot(target, slot);
              this.setSlot(ref, null);
              return;
            }
            if (canMerge(existing, slot)) {
              const move = Math.min(slot.count, maxStackOf(slot.id) - existing.count);
              this.setSlot(target, { ...existing, count: existing.count + move });
              this.setSlot(ref, { ...slot, count: slot.count - move });
              return;
            }
          }
        }
      }
      // 快捷栏 <-> 背包主体
      const isHotbar = ref.index < HOTBAR_END;
      const start = isHotbar ? HOTBAR_END : 0;
      const end = isHotbar ? INVENTORY_END : HOTBAR_END;
      const moved = this.moveIntoRange(slot, start, end);
      this.setSlot(ref, moved);
      return;
    }
    // 从容器/合成格移回背包
    const remaining = this.host.inventory.add(slot);
    this.setSlot(ref, remaining > 0 ? { ...slot, count: remaining } : null);
  }

  private moveIntoRange(stack: ItemStack, start: number, end: number): ItemStack | null {
    let remaining = stack.count;
    const inv = this.host.inventory;
    const max = maxStackOf(stack.id);
    for (let i = start; i < end && remaining > 0; i++) {
      const s = inv.get(i);
      if (s && canMerge(s, stack) && s.count < max) {
        const move = Math.min(max - s.count, remaining);
        inv.set(i, { ...s, count: s.count + move });
        remaining -= move;
      }
    }
    for (let i = start; i < end && remaining > 0; i++) {
      if (!inv.get(i)) {
        const move = Math.min(max, remaining);
        inv.set(i, { ...stack, count: move });
        remaining -= move;
      }
    }
    return remaining > 0 ? { ...stack, count: remaining } : null;
  }

  /**
   * 关闭界面时把合成格物品放回背包；放不下的留在原格，同样不丢进世界。
   * @returns 放不下的总数量，0 表示已全部收回
   */
  returnCraftingItems(): number {
    let leftover = 0;
    for (let i = 0; i < CRAFT_GRID_SIZE; i++) {
      const s = this.host.craftingGrid[i];
      if (!s) {
        continue;
      }
      const remaining = this.host.inventory.add(s);
      this.host.craftingGrid[i] = remaining > 0 ? { ...s, count: remaining } : null;
      leftover += remaining;
    }
    return leftover;
  }

  /**
   * 清空光标与合成格并返回其中的物品（玩家死亡时使用）。
   * @returns 被取出的物品，调用方决定是掉落还是丢弃
   */
  drainWorkspace(): ItemStack[] {
    const stacks: ItemStack[] = [];
    if (this.cursorStack) {
      stacks.push(this.cursorStack);
      this.cursorStack = null;
    }
    for (let i = 0; i < CRAFT_GRID_SIZE; i++) {
      const s = this.host.craftingGrid[i];
      if (s) {
        stacks.push(s);
        this.host.craftingGrid[i] = null;
      }
    }
    if (stacks.length > 0) {
      this.host.notifyChanged();
    }
    return stacks;
  }

  // ---------------------------------------------------------------- 死亡 / 复活
}
