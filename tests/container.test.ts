import { describe, expect, it } from 'vitest';
import { ContainerController, type ContainerHost } from '../src/engine/items/ContainerController';
import { createFurnace, type FurnaceState } from '../src/engine/items/Furnace';
import { Inventory } from '../src/engine/items/Inventory';
import { maxStackOf, type ItemStack } from '../src/engine/items/ItemStack';

const LEFT = 0;
const RIGHT = 2;
const INVENTORY_SLOTS = 36;

function setup(screen: 'inventory' | 'crafting' | 'furnace' = 'inventory', isCreative = false) {
  const inventory = new Inventory();
  const craftingGrid: (ItemStack | null)[] = new Array<ItemStack | null>(9).fill(null);
  const furnace: FurnaceState = createFurnace();
  const dropped: ItemStack[] = [];
  let changes = 0;
  const host: ContainerHost = {
    inventory,
    craftingGrid,
    craftGridSize: screen === 'crafting' ? 3 : 2,
    openFurnace: screen === 'furnace' ? furnace : null,
    currentScreen: screen,
    isCreative,
    dropAtPlayer: (s) => dropped.push(s),
    notifyChanged: () => changes++,
  };
  const ctrl = new ContainerController(host);
  return { inventory, craftingGrid, furnace, dropped, ctrl, changes: () => changes };
}

describe('ContainerController', () => {
  it('左键拿起整组、右键放下一个', () => {
    const { inventory, ctrl } = setup();
    inventory.set(0, { id: 'dirt', count: 10 });
    ctrl.handleSlotClick({ kind: 'inventory', index: 0 }, LEFT, false);
    expect(ctrl.cursor).toEqual({ id: 'dirt', count: 10 });
    expect(inventory.get(0)).toBeNull();
    ctrl.handleSlotClick({ kind: 'inventory', index: 5 }, RIGHT, false);
    expect(inventory.get(5)).toEqual({ id: 'dirt', count: 1 });
    expect(ctrl.cursor?.count).toBe(9);
  });

  it('右键拿起一半、同类合并、不同类交换', () => {
    const { inventory, ctrl } = setup();
    inventory.set(0, { id: 'dirt', count: 9 });
    inventory.set(1, { id: 'stone', count: 3 });
    ctrl.handleSlotClick({ kind: 'inventory', index: 0 }, RIGHT, false);
    expect(ctrl.cursor?.count).toBe(5);
    expect(inventory.get(0)?.count).toBe(4);
    ctrl.handleSlotClick({ kind: 'inventory', index: 0 }, LEFT, false);
    expect(inventory.get(0)?.count).toBe(9);
    expect(ctrl.cursor).toBeNull();
    ctrl.handleSlotClick({ kind: 'inventory', index: 0 }, LEFT, false);
    ctrl.handleSlotClick({ kind: 'inventory', index: 1 }, LEFT, false);
    expect(inventory.get(1)).toEqual({ id: 'dirt', count: 9 });
    expect(ctrl.cursor).toEqual({ id: 'stone', count: 3 });
  });

  it('合成：原木放入合成格并取出木板，shift 全部合成', () => {
    const { inventory, ctrl } = setup();
    inventory.set(0, { id: 'log', count: 3 });
    ctrl.handleSlotClick({ kind: 'inventory', index: 0 }, LEFT, false);
    ctrl.handleSlotClick({ kind: 'craft', index: 0 }, LEFT, false);
    expect(ctrl.craftResult()).toEqual({ id: 'planks', count: 4 });
    ctrl.handleSlotClick({ kind: 'craftResult', index: 0 }, LEFT, true);
    expect(inventory.countOf('planks')).toBe(12);
    expect(ctrl.craftResult()).toBeNull();
  });

  it('关闭时合成格与光标物品放回背包', () => {
    const { inventory, ctrl } = setup();
    inventory.set(0, { id: 'log', count: 2 });
    ctrl.handleSlotClick({ kind: 'inventory', index: 0 }, LEFT, false);
    ctrl.handleSlotClick({ kind: 'craft', index: 1 }, RIGHT, false);
    expect(ctrl.returnCraftingItems()).toBe(0);
    expect(ctrl.returnCursor()).toBe(0);
    expect(inventory.countOf('log')).toBe(2);
    expect(ctrl.cursor).toBeNull();
  });

  it('背包满时收回光标不会掉落物品，物品保留在光标上', () => {
    const { inventory, ctrl, dropped } = setup();
    inventory.set(0, { id: 'dirt', count: 10 });
    ctrl.handleSlotClick({ kind: 'inventory', index: 0 }, LEFT, false);
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      inventory.set(i, { id: 'stone', count: maxStackOf('stone') });
    }
    expect(ctrl.returnCursor()).toBe(10);
    expect(ctrl.cursor).toEqual({ id: 'dirt', count: 10 });
    expect(dropped).toHaveLength(0);
  });

  it('背包满时收回合成格物品会留在原格且不掉落', () => {
    const { inventory, craftingGrid, ctrl, dropped } = setup();
    craftingGrid[0] = { id: 'log', count: 3 };
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      inventory.set(i, { id: 'stone', count: maxStackOf('stone') });
    }
    expect(ctrl.returnCraftingItems()).toBe(3);
    expect(craftingGrid[0]).toEqual({ id: 'log', count: 3 });
    expect(dropped).toHaveLength(0);
  });

  it('死亡时清空光标与合成格并交出物品', () => {
    const { craftingGrid, ctrl } = setup();
    craftingGrid[0] = { id: 'log', count: 1 };
    ctrl.handleSlotClick({ kind: 'craft', index: 0 }, LEFT, false);
    craftingGrid[1] = { id: 'dirt', count: 2 };
    const stacks = ctrl.drainWorkspace();
    expect(stacks).toEqual([
      { id: 'log', count: 1 },
      { id: 'dirt', count: 2 },
    ]);
    expect(ctrl.cursor).toBeNull();
    expect(craftingGrid[1]).toBeNull();
  });

  it('熔炉：shift 点击矿石进入入料、燃料进入燃料格，燃料格拒绝非燃料', () => {
    const { inventory, furnace, ctrl } = setup('furnace');
    inventory.set(0, { id: 'iron_ore', count: 4 });
    inventory.set(1, { id: 'coal', count: 2 });
    inventory.set(2, { id: 'dirt', count: 1 });
    ctrl.handleSlotClick({ kind: 'inventory', index: 0 }, LEFT, true);
    ctrl.handleSlotClick({ kind: 'inventory', index: 1 }, LEFT, true);
    expect(furnace.input).toEqual({ id: 'iron_ore', count: 4 });
    expect(furnace.fuel).toEqual({ id: 'coal', count: 2 });
    ctrl.handleSlotClick({ kind: 'inventory', index: 2 }, LEFT, false);
    ctrl.handleSlotClick({ kind: 'furnaceFuel', index: 0 }, LEFT, false);
    expect(furnace.fuel?.id).toBe('coal');
    expect(ctrl.cursor?.id).toBe('dirt');
  });

  it('创造模式：点击列表得到整组，再点同物品清空光标', () => {
    const { ctrl, inventory } = setup('inventory', true);
    ctrl.handleSlotClick({ kind: 'creative', index: 0, itemId: 'stone' }, LEFT, false);
    expect(ctrl.cursor).toEqual({ id: 'stone', count: 64 });
    ctrl.handleSlotClick({ kind: 'creative', index: 0, itemId: 'stone' }, LEFT, false);
    expect(ctrl.cursor).toBeNull();
    ctrl.handleSlotClick({ kind: 'creative', index: 0, itemId: 'torch' }, LEFT, true);
    expect(inventory.countOf('torch')).toBe(64);
  });
});
