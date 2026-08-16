import { describe, expect, it } from 'vitest';
import { getBlockByName } from '../src/engine/blocks/BlockRegistry';
import { breakTicks, canHarvest } from '../src/engine/blocks/blockBreaking';
import { Inventory } from '../src/engine/items/Inventory';
import { ITEM_DEFS, TOOL_MATERIALS, getItem } from '../src/engine/items/ItemRegistry';
import { matchRecipe, RECIPES } from '../src/engine/items/Recipes';
import type { ItemStack } from '../src/engine/items/ItemStack';
import { createFurnace, SMELT_TICKS, tickFurnace } from '../src/engine/items/Furnace';
import { Player } from '../src/engine/player/Player';
import type { EntityContext } from '../src/engine/entities/EntityContext';

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

describe('护甲', () => {
  it('每点护甲减伤 4%，20 点封顶', () => {
    const player = new Player();
    expect(player.armorPoints).toBe(0);
    // 全套钻石 = 3 + 8 + 6 + 3 = 20 点
    player.inventory.setArmor(0, { id: 'diamond_helmet', count: 1 });
    player.inventory.setArmor(1, { id: 'diamond_chestplate', count: 1 });
    player.inventory.setArmor(2, { id: 'diamond_leggings', count: 1 });
    player.inventory.setArmor(3, { id: 'diamond_boots', count: 1 });
    expect(player.armorPoints).toBe(20);
  });

  it('受伤后各件盔甲都掉耐久，耐久耗尽的部件消失', () => {
    const player = new Player();
    player.inventory.setArmor(0, { id: 'leather_helmet', count: 1, damage: 54 });
    player.inventory.setArmor(1, { id: 'iron_chestplate', count: 1 });
    const ctx = { world: null } as unknown as EntityContext;
    player.hurt(ctx, 8, null);
    // 皮革头盔耐久 55，再掉 2 点就损毁
    expect(player.inventory.getArmor(0)).toBeNull();
    expect(player.inventory.getArmor(1)?.damage).toBe(2);
    // 皮革头盔 1 + 铁胸甲 6 = 7 点护甲 → 减伤 28%（损毁的那件仍为这一下提供保护）
    expect(player.health).toBeCloseTo(20 - 8 * 0.72, 4);
  });
});

describe('工具材质', () => {
  it('五种材质都有全套工具与配方', () => {
    const results = new Set(RECIPES.map((r) => r.result.id));
    for (const mat of TOOL_MATERIALS) {
      for (const type of ['pickaxe', 'axe', 'shovel', 'sword', 'hoe']) {
        const id = `${mat.id}_${type}`;
        expect(getItem(id), id).toBeDefined();
        expect(results.has(id), id).toBe(true);
      }
    }
  });

  it('金工具挖得快但脆，挖掘等级和木头一样', () => {
    const gold = getItem('golden_pickaxe')?.tool;
    const wood = getItem('wooden_pickaxe')?.tool;
    const diamond = getItem('diamond_pickaxe')?.tool;
    expect(gold?.tier).toBe(wood?.tier);
    expect(gold?.speed).toBeGreaterThan(diamond?.speed ?? 0);
    expect(gold?.durability).toBeLessThan(wood?.durability ?? 0);
  });

  it('金镐挖不到钻石（挖掘等级不够）', () => {
    expect(canHarvest(getBlockByName('diamond_ore')!, s('golden_pickaxe'))).toBe(false);
    expect(canHarvest(getBlockByName('diamond_ore')!, s('iron_pickaxe'))).toBe(true);
  });
});
