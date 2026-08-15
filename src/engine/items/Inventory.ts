import { HOTBAR_SIZE, INVENTORY_SIZE } from '../constants/game';
import { canMerge, cloneStack, maxStackOf, type ItemStack } from './ItemStack';

/**
 * 玩家背包：36 格（前 9 格为快捷栏）。
 * 所有修改方法都会返回是否成功，并触发 onChange。
 */
export class Inventory {
  readonly slots: (ItemStack | null)[];
  private listeners = new Set<() => void>();

  constructor(size = INVENTORY_SIZE) {
    this.slots = new Array<ItemStack | null>(size).fill(null);
  }

  /** 订阅变更。 */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 通知变更。 */
  notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  get(slot: number): ItemStack | null {
    return this.slots[slot] ?? null;
  }

  set(slot: number, stack: ItemStack | null): void {
    this.slots[slot] = stack && stack.count > 0 ? stack : null;
    this.notify();
  }

  /**
   * 添加物品，优先合并已有堆，再填空格；返回未能放入的数量。
   */
  add(stack: ItemStack): number {
    let remaining = stack.count;
    const max = maxStackOf(stack.id);
    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      const existing = this.slots[i];
      if (existing && canMerge(existing, stack) && existing.count < max) {
        const move = Math.min(max - existing.count, remaining);
        existing.count += move;
        remaining -= move;
      }
    }
    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      if (!this.slots[i]) {
        const move = Math.min(max, remaining);
        this.slots[i] = { ...cloneStack(stack), count: move };
        remaining -= move;
      }
    }
    this.notify();
    return remaining;
  }

  /** 从指定格减少数量。 */
  consume(slot: number, count = 1): void {
    const stack = this.slots[slot];
    if (!stack) {
      return;
    }
    stack.count -= count;
    if (stack.count <= 0) {
      this.slots[slot] = null;
    }
    this.notify();
  }

  /** 统计某物品总数。 */
  countOf(id: string): number {
    let total = 0;
    for (const s of this.slots) {
      if (s && s.id === id) {
        total += s.count;
      }
    }
    return total;
  }

  /** 移除若干个指定物品（跨格），返回是否足够。 */
  removeItems(id: string, count: number): boolean {
    if (this.countOf(id) < count) {
      return false;
    }
    let remaining = count;
    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const take = Math.min(s.count, remaining);
        s.count -= take;
        remaining -= take;
        if (s.count <= 0) {
          this.slots[i] = null;
        }
      }
    }
    this.notify();
    return true;
  }

  /** 清空。 */
  clear(): void {
    this.slots.fill(null);
    this.notify();
  }

  /** 取出所有物品（用于死亡掉落）。 */
  drainAll(): ItemStack[] {
    const out = this.slots.filter((s): s is ItemStack => s !== null);
    this.slots.fill(null);
    this.notify();
    return out;
  }

  /** 快捷栏格数。 */
  get hotbarSize(): number {
    return HOTBAR_SIZE;
  }

  /** 序列化。 */
  toJSON(): (ItemStack | null)[] {
    return this.slots.map((s) => (s ? cloneStack(s) : null));
  }

  /** 反序列化。 */
  load(data: (ItemStack | null)[]): void {
    for (let i = 0; i < this.slots.length; i++) {
      this.slots[i] = data[i] ? cloneStack(data[i] as ItemStack) : null;
    }
    this.notify();
  }
}
