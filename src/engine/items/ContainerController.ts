import { MOUSE_RIGHT } from '../constants/keys';
import type { Screen } from '../events/GameState';
import type { BrewingState } from './Brewing';
import type { FurnaceState } from './Furnace';
import { Inventory } from './Inventory';
import { getItem } from './ItemRegistry';
import { canMerge, maxStackOf, type ItemStack } from './ItemStack';
import { isBrewingIngredient, potionOfItem } from './potions';
import { isEnchantable } from './enchantments';
import { ENCHANT_ITEM_SLOT, LAPIS_ITEM_ID } from './EnchantingTable';
import { matchRecipe } from './Recipes';

/** 容器格引用。 */
export interface SlotRef {
  kind:
    | 'inventory'
    | 'craft'
    | 'craftResult'
    | 'furnaceInput'
    | 'furnaceFuel'
    | 'furnaceOutput'
    | 'brewIngredient'
    | 'brewBottle'
    | 'enchanting'
    | 'anvil'
    | 'anvilResult'
    | 'chest'
    | 'armor'
    | 'creative';
  index: number;
  /** 创造模式列表中点击的物品 id。 */
  itemId?: string;
}

/** 容器控制器需要从游戏获取的上下文。 */
export interface ContainerHost {
  readonly inventory: Inventory;
  readonly craftingGrid: (ItemStack | null)[];
  readonly craftGridSize: number;
  /** 附魔台的两个格子：[待附魔物品, 青金石]。与合成格一样归玩家临时持有，关界面时收回。 */
  readonly enchantingSlots: (ItemStack | null)[];
  /** 铁砧的两个输入格：[左, 右]，同样临时持有。 */
  readonly anvilSlots: (ItemStack | null)[];
  /** 铁砧当前可取走的产物（不合法 / 等级不够时为 null）。 */
  anvilOutput(): ItemStack | null;
  /** 玩家取走铁砧产物：扣输入与等级。 */
  consumeAnvilInputs(): void;
  readonly openFurnace: FurnaceState | null;
  /** 打开中的酿造台（未打开时为 null）。 */
  readonly openBrewingStand: BrewingState | null;
  /** 打开中的箱子内容（未打开箱子时为 null）。 */
  readonly openChestItems: (ItemStack | null)[] | null;
  readonly currentScreen: Screen;
  readonly isCreative: boolean;
  /** 通知 UI 刷新。 */
  notifyChanged(): void;
  /** 玩家从产物格 / 容器格取走了物品（成就与统计用）。 */
  onOutputTaken(kind: SlotRef['kind'], stack: ItemStack): void;
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
      case 'brewIngredient':
        return this.host.openBrewingStand?.ingredient ?? null;
      case 'brewBottle':
        return this.host.openBrewingStand?.bottles[ref.index] ?? null;
      case 'enchanting':
        return this.host.enchantingSlots[ref.index] ?? null;
      case 'anvil':
        return this.host.anvilSlots[ref.index] ?? null;
      case 'anvilResult':
        return this.host.anvilOutput();
      case 'chest':
        return this.host.openChestItems?.[ref.index] ?? null;
      case 'armor':
        return this.host.inventory.getArmor(ref.index);
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
      case 'brewIngredient': {
        const b = this.host.openBrewingStand;
        if (b) {
          b.ingredient = value;
        }
        break;
      }
      case 'brewBottle': {
        const b = this.host.openBrewingStand;
        if (b) {
          b.bottles[ref.index] = value;
        }
        break;
      }
      case 'enchanting':
        this.host.enchantingSlots[ref.index] = value;
        break;
      case 'anvil':
        this.host.anvilSlots[ref.index] = value;
        break;
      case 'chest': {
        const items = this.host.openChestItems;
        if (items) {
          items[ref.index] = value;
        }
        break;
      }
      case 'armor':
        this.host.inventory.setArmor(ref.index, value);
        break;
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
    if (ref.kind === 'craftResult' || ref.kind === 'furnaceOutput' || ref.kind === 'anvilResult') {
      this.takeOutput(ref, shift);
      return;
    }
    const slot = this.getSlot(ref);
    if (shift) {
      this.quickMove(ref, slot);
      return;
    }
    if (this.cursorStack && !this.acceptsStack(ref, this.cursorStack)) {
      return;
    }
    if (!this.cursorStack) {
      if (!slot) {
        return;
      }
      if (ref.kind === 'brewBottle') {
        this.host.onOutputTaken(ref.kind, slot);
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

  /** 有格子类型限制的容器格能不能放下该物品（燃料格只收燃料、瓶位只收药水……）。 */
  private acceptsStack(ref: SlotRef, stack: ItemStack): boolean {
    switch (ref.kind) {
      case 'furnaceFuel':
        return getItem(stack.id)?.burnTicks !== undefined;
      case 'armor':
        return getItem(stack.id)?.armor?.slot === ref.index;
      case 'brewIngredient':
        return isBrewingIngredient(stack.id);
      case 'brewBottle':
        return potionOfItem(stack.id) !== null;
      case 'enchanting':
        return ref.index === ENCHANT_ITEM_SLOT ? isEnchantable(stack.id) : stack.id === LAPIS_ITEM_ID;
      default:
        return true;
    }
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
        this.host.onOutputTaken(ref.kind, r);
        if (ref.kind !== 'craftResult') {
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
    this.host.onOutputTaken(ref.kind, result);
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
      return;
    }
    if (ref.kind === 'anvilResult') {
      this.host.consumeAnvilInputs();
    }
  }

  private quickMove(ref: SlotRef, slot: ItemStack | null): void {
    if (!slot) {
      return;
    }
    if (ref.kind === 'inventory') {
      const screen = this.host.currentScreen;
      if (screen === 'furnace' && this.host.openFurnace) {
        const def = getItem(slot.id);
        const target: SlotRef | null = def?.smeltsInto
          ? { kind: 'furnaceInput', index: 0 }
          : def?.burnTicks
            ? { kind: 'furnaceFuel', index: 0 }
            : null;
        if (target && this.moveIntoSlot(ref, slot, target)) {
          return;
        }
      }
      if (screen === 'brewing' && this.host.openBrewingStand) {
        if (isBrewingIngredient(slot.id) && this.moveIntoSlot(ref, slot, { kind: 'brewIngredient', index: 0 })) {
          return;
        }
        if (potionOfItem(slot.id)) {
          const bottles = this.host.openBrewingStand.bottles;
          for (let i = 0; i < bottles.length; i++) {
            if (!bottles[i] && this.moveIntoSlot(ref, slot, { kind: 'brewBottle', index: i })) {
              return;
            }
          }
        }
      }
      const armorSlot = getItem(slot.id)?.armor?.slot;
      if (armorSlot !== undefined && !this.host.inventory.getArmor(armorSlot)) {
        this.host.inventory.setArmor(armorSlot, slot);
        this.setSlot(ref, null);
        return;
      }
      if (screen === 'chest') {
        // 箱子界面里 shift 只在背包与箱子之间搬运；箱子满了就原地不动
        const moved = this.moveIntoChest(slot);
        if (moved === null || moved.count < slot.count) {
          this.setSlot(ref, moved);
        }
        return;
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
    if (ref.kind === 'brewBottle') {
      this.host.onOutputTaken(ref.kind, slot);
    }
    const remaining = this.host.inventory.add(slot);
    this.setSlot(ref, remaining > 0 ? { ...slot, count: remaining } : null);
  }

  /** shift 点击：把 ref 格里的物品搬到 target 格（空则整组放入，同类则合并）。返回是否搬动了。 */
  private moveIntoSlot(ref: SlotRef, slot: ItemStack, target: SlotRef): boolean {
    const existing = this.getSlot(target);
    if (!existing) {
      this.setSlot(target, slot);
      this.setSlot(ref, null);
      return true;
    }
    if (!canMerge(existing, slot)) {
      return false;
    }
    const move = Math.min(slot.count, maxStackOf(slot.id) - existing.count);
    if (move <= 0) {
      return false;
    }
    this.setSlot(target, { ...existing, count: existing.count + move });
    this.setSlot(ref, { ...slot, count: slot.count - move });
    return true;
  }

  /** 把物品塞进打开中的箱子；返回剩下的部分（没有箱子或塞不下时原样返回）。 */
  private moveIntoChest(stack: ItemStack): ItemStack | null {
    const items = this.host.openChestItems;
    if (!items) {
      return stack;
    }
    let remaining = stack.count;
    const max = maxStackOf(stack.id);
    for (let i = 0; i < items.length && remaining > 0; i++) {
      const s = items[i];
      if (s && canMerge(s, stack) && s.count < max) {
        const move = Math.min(max - s.count, remaining);
        items[i] = { ...s, count: s.count + move };
        remaining -= move;
      }
    }
    for (let i = 0; i < items.length && remaining > 0; i++) {
      if (!items[i]) {
        const move = Math.min(max, remaining);
        items[i] = { ...stack, count: move };
        remaining -= move;
      }
    }
    return remaining > 0 ? { ...stack, count: remaining } : null;
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
    return (
      this.returnSlots(this.host.craftingGrid) +
      this.returnSlots(this.host.enchantingSlots) +
      this.returnSlots(this.host.anvilSlots)
    );
  }

  /** 把一组临时格子里的物品收回背包，返回放不下的数量。 */
  private returnSlots(slots: (ItemStack | null)[]): number {
    let leftover = 0;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (!s) {
        continue;
      }
      const remaining = this.host.inventory.add(s);
      slots[i] = remaining > 0 ? { ...s, count: remaining } : null;
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
    for (const slots of [this.host.craftingGrid, this.host.enchantingSlots, this.host.anvilSlots]) {
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        if (s) {
          stacks.push(s);
          slots[i] = null;
        }
      }
    }
    if (stacks.length > 0) {
      this.host.notifyChanged();
    }
    return stacks;
  }

  // ---------------------------------------------------------------- 死亡 / 复活
}
