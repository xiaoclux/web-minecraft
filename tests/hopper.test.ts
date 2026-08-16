import { describe, expect, it } from 'vitest';
import { BlockEntityType } from '../src/engine/world/BlockEntityStore';
import { containerSlots, extractOne, insertOne, isEmpty } from '../src/engine/systems/HopperSystem';
import { createFurnace } from '../src/engine/items/Furnace';
import type { ItemStack } from '../src/engine/items/ItemStack';

function slots(n: number): (ItemStack | null)[] {
  return new Array<ItemStack | null>(n).fill(null);
}

describe('容器搬运', () => {
  it('箱子 / 漏斗 / 发射器都能被当作容器读写，别的方块实体不行', () => {
    expect(containerSlots({ type: BlockEntityType.CHEST, items: slots(27) })).toHaveLength(27);
    expect(containerSlots({ type: BlockEntityType.HOPPER, items: slots(5), cooldown: 0 })).toHaveLength(5);
    expect(containerSlots({ type: BlockEntityType.DISPENSER, items: slots(9) })).toHaveLength(9);
    expect(containerSlots({ type: BlockEntityType.FURNACE, state: createFurnace() })).toHaveLength(3);
    expect(containerSlots({ type: BlockEntityType.BEACON })).toBeNull();
    expect(containerSlots(null)).toBeNull();
  });

  it('插入时优先叠到已有堆上，满了再占空格', () => {
    const items = slots(3);
    items[0] = { id: 'coal', count: 63 };
    expect(insertOne(items, { id: 'coal', count: 1 })).toBe(true);
    expect(items[0]).toEqual({ id: 'coal', count: 64 });
    // 已满：换到空格
    expect(insertOne(items, { id: 'coal', count: 1 })).toBe(true);
    expect(items[1]).toEqual({ id: 'coal', count: 1 });
  });

  it('容器满了就插不进去', () => {
    const items: (ItemStack | null)[] = [{ id: 'stone', count: 64 }];
    expect(insertOne(items, { id: 'coal', count: 1 })).toBe(false);
    expect(items[0]).toEqual({ id: 'stone', count: 64 });
  });

  it('每次只取一件，取空后槽位归 null', () => {
    const items: (ItemStack | null)[] = [{ id: 'diamond', count: 2 }];
    expect(extractOne(items)).toEqual({ id: 'diamond', count: 1 });
    expect(items[0]).toEqual({ id: 'diamond', count: 1 });
    expect(extractOne(items)).toEqual({ id: 'diamond', count: 1 });
    expect(items[0]).toBeNull();
    expect(extractOne(items)).toBeNull();
    expect(isEmpty(items)).toBe(true);
  });
});
