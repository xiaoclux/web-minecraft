/**
 * 漏斗：每隔几 tick 从上方容器里抽一件东西，再往自己朝向的容器里塞一件。
 * 与 1.8.9 一致：漏斗只跟"容器方块实体"打交道（箱子 / 熔炉 / 漏斗 / 发射器），
 * 也会吸走落在它上面的掉落物。
 */

import { BlockEntityType, type BlockEntity } from '../world/BlockEntityStore';
import { canMerge, maxStackOf, type ItemStack } from '../items/ItemStack';

/** 一个容器的槽位数组；不是容器返回 null。 */
export function containerSlots(entity: BlockEntity | null): (ItemStack | null)[] | null {
  if (!entity) {
    return null;
  }
  switch (entity.type) {
    case BlockEntityType.CHEST:
    case BlockEntityType.HOPPER:
    case BlockEntityType.DISPENSER:
      return entity.items;
    case BlockEntityType.FURNACE:
      // 熔炉：漏斗从上面进原料、从下面取产物，这里统一暴露三个槽
      return [entity.state.input, entity.state.fuel, entity.state.output];
    default:
      return null;
  }
}

/**
 * 往槽位数组里塞一件物品（优先叠到已有堆上）。
 * @returns 是否塞进去了
 */
export function insertOne(slots: (ItemStack | null)[], stack: ItemStack): boolean {
  const max = maxStackOf(stack.id);
  for (const slot of slots) {
    if (slot && canMerge(slot, stack) && slot.count < max) {
      slot.count++;
      return true;
    }
  }
  for (let i = 0; i < slots.length; i++) {
    if (!slots[i]) {
      slots[i] = { ...stack, count: 1 };
      return true;
    }
  }
  return false;
}

/**
 * 从槽位数组里取走一件物品。
 * @returns 取到的物品；空容器返回 null
 */
export function extractOne(slots: (ItemStack | null)[]): ItemStack | null {
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (!slot) {
      continue;
    }
    const taken: ItemStack = { ...slot, count: 1 };
    slots[i] = slot.count > 1 ? { ...slot, count: slot.count - 1 } : null;
    return taken;
  }
  return null;
}

/** 容器里还有没有东西。 */
export function isEmpty(slots: (ItemStack | null)[]): boolean {
  return slots.every((slot) => slot === null);
}
