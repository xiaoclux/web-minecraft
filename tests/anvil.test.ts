import { describe, expect, it } from 'vitest';
import { anvilResult, maxDurabilityOf, repairMaterialOf } from '../src/engine/items/Anvil';
import { EnchantmentId, enchantLevel } from '../src/engine/items/enchantments';
import { requireItem } from '../src/engine/items/ItemRegistry';
import type { ItemStack } from '../src/engine/items/ItemStack';

const pick = (damage = 0, enchants?: Record<string, number>): ItemStack => ({ id: 'iron_pickaxe', count: 1, damage, enchants });

describe('铁砧', () => {
  it('铁镐用铁锭修，每个铁锭补 25%，用到修满为止', () => {
    expect(repairMaterialOf(requireItem('iron_pickaxe'))).toBe('iron_ingot');
    expect(repairMaterialOf(requireItem('leather_boots'))).toBe('leather');
    const max = maxDurabilityOf(requireItem('iron_pickaxe'));
    const result = anvilResult(pick(max - 10), { id: 'iron_ingot', count: 5 }, '');
    expect(result).not.toBeNull();
    expect(result!.rightConsumed).toBe(4);
    expect(result!.cost).toBe(4);
    expect(result!.output.damage).toBeUndefined();
  });

  it('两把同样的镐合并：耐久相加再加 12%，附魔取高 / 同级 +1，冲突的不并', () => {
    const max = maxDurabilityOf(requireItem('iron_pickaxe'));
    const result = anvilResult(
      pick(max - 50, { efficiency: 2, fortune: 1 }),
      pick(max - 50, { efficiency: 2, silk_touch: 1, unbreaking: 3 }),
      '',
    );
    expect(result).not.toBeNull();
    const out = result!.output;
    expect(enchantLevel(out, EnchantmentId.EFFICIENCY)).toBe(3);
    expect(enchantLevel(out, EnchantmentId.UNBREAKING)).toBe(3);
    expect(enchantLevel(out, EnchantmentId.FORTUNE)).toBe(1);
    expect(enchantLevel(out, EnchantmentId.SILK_TOUCH)).toBe(0);
    expect(max - (out.damage ?? 0)).toBe(Math.min(max, 100 + Math.floor(max * 0.12)));
    expect(result!.rightConsumed).toBe(1);
  });

  it('附魔书只把适用的附魔转到物品上；改名花 1 级；什么都没变返回 null', () => {
    const book: ItemStack = { id: 'enchanted_book', count: 1, enchants: { sharpness: 3, efficiency: 1 } };
    const result = anvilResult(pick(), book, '');
    expect(enchantLevel(result!.output, EnchantmentId.EFFICIENCY)).toBe(1);
    expect(enchantLevel(result!.output, EnchantmentId.SHARPNESS)).toBe(0);

    const renamed = anvilResult(pick(), null, '  我的镐  ');
    expect(renamed!.output.name).toBe('我的镐');
    expect(renamed!.cost).toBe(1);
    expect(anvilResult(pick(), null, '')).toBeNull();
    expect(anvilResult(pick(), { id: 'dirt', count: 1 }, '')).toBeNull();
  });
});
