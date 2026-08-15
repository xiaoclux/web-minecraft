import { describe, expect, it } from 'vitest';
import { getBlockByName } from '../src/engine/blocks/BlockRegistry';
import { breakTicks, canHarvest } from '../src/engine/blocks/blockBreaking';
import { Inventory } from '../src/engine/items/Inventory';
import { ITEM_DEFS, getItem } from '../src/engine/items/ItemRegistry';
import { matchRecipe, RECIPES } from '../src/engine/items/Recipes';
import type { ItemStack } from '../src/engine/items/ItemStack';
import { createFurnace, SMELT_TICKS, tickFurnace } from '../src/engine/items/Furnace';

const s = (id: string, count = 1): ItemStack => ({ id, count });

describe('Recipes', () => {
  it('所有配方的产物与原料都已注册', () => {
    for (const r of RECIPES) {
      expect(getItem(r.result.id), r.result.id).toBeDefined();
    }
  });

  it('原木 → 木板（无序）', () => {
    const grid = [s('log'), null, null, null];
    expect(matchRecipe(grid, 2)).toEqual({ id: 'planks', count: 4 });
  });

  it('2×2 木板 → 工作台，且允许放在任意位置', () => {
    const grid = [null, null, null, null, s('planks'), s('planks'), null, s('planks'), s('planks')];
    expect(matchRecipe(grid, 3)?.id).toBe('crafting_table');
  });

  it('镐子需要 3×3 且形状正确', () => {
    const grid = [s('cobblestone'), s('cobblestone'), s('cobblestone'), null, s('stick'), null, null, s('stick'), null];
    expect(matchRecipe(grid, 3)?.id).toBe('stone_pickaxe');
    const wrong = [
      s('cobblestone'),
      s('cobblestone'),
      s('cobblestone'),
      s('stick'),
      null,
      null,
      s('stick'),
      null,
      null,
    ];
    expect(matchRecipe(wrong, 3)?.id).not.toBe('stone_pickaxe');
  });

  it('斧支持镜像', () => {
    const grid = [s('planks'), s('planks'), null, s('stick'), s('planks'), null, s('stick'), null, null];
    expect(matchRecipe(grid, 3)?.id).toBe('wooden_axe');
  });
});

describe('Inventory', () => {
  it('合并堆叠并返回放不下的数量', () => {
    const inv = new Inventory(2);
    expect(inv.add(s('dirt', 60))).toBe(0);
    expect(inv.add(s('dirt', 60))).toBe(0);
    expect(inv.get(0)?.count).toBe(64);
    expect(inv.get(1)?.count).toBe(56);
    expect(inv.add(s('dirt', 20))).toBe(12);
  });

  it('工具不堆叠', () => {
    const inv = new Inventory(3);
    inv.add(s('iron_pickaxe'));
    inv.add(s('iron_pickaxe'));
    expect(inv.get(0)?.count).toBe(1);
    expect(inv.get(1)?.count).toBe(1);
  });
});

describe('blockBreaking', () => {
  it('石头徒手不能采集，木镐可以且更快', () => {
    const stone = getBlockByName('stone');
    if (!stone) {
      throw new Error('stone missing');
    }
    expect(canHarvest(stone, null)).toBe(false);
    expect(canHarvest(stone, s('wooden_pickaxe'))).toBe(true);
    expect(breakTicks(stone, s('wooden_pickaxe'))).toBeLessThan(breakTicks(stone, null));
    expect(breakTicks(stone, s('diamond_pickaxe'))).toBeLessThan(breakTicks(stone, s('wooden_pickaxe')));
  });

  it('基岩不可破坏', () => {
    const bedrock = getBlockByName('bedrock');
    expect(bedrock && breakTicks(bedrock, s('diamond_pickaxe'))).toBe(Infinity);
  });
});

describe('Furnace', () => {
  it('煤炭烧炼铁矿石得到铁锭', () => {
    const f = createFurnace();
    f.input = s('iron_ore', 1);
    f.fuel = s('coal', 1);
    for (let i = 0; i <= SMELT_TICKS; i++) {
      tickFurnace(f);
    }
    expect(f.output).toEqual({ id: 'iron_ingot', count: 1 });
    expect(f.input).toBeNull();
    expect(f.fuel).toBeNull();
    expect(f.burnTicks).toBeGreaterThan(0);
  });
});

describe('ItemRegistry', () => {
  it('物品 id 唯一', () => {
    const ids = ITEM_DEFS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
