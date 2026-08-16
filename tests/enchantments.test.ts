import { describe, expect, it } from 'vitest';
import { BlockId, getBlock } from '../src/engine/blocks/BlockRegistry';
import { breakTicks, rollDrops } from '../src/engine/blocks/blockBreaking';
import {
  ENCHANTMENT_DEFS,
  EnchantmentId,
  canEnchant,
  describeEnchants,
  enchantLevel,
  enchantsCompatible,
  isEnchantable,
  unbreakingSkips,
} from '../src/engine/items/enchantments';
import { applyEnchants, enchantCosts, rollEnchantments, rollOptions } from '../src/engine/items/EnchantingTable';
import { requireItem } from '../src/engine/items/ItemRegistry';
import { canMerge, cloneStack, type ItemStack } from '../src/engine/items/ItemStack';

const pickaxe = (enchants?: Record<string, number>): ItemStack => ({ id: 'iron_pickaxe', count: 1, enchants });

describe('附魔数据', () => {
  it('附魔只能加在对应类别的物品上', () => {
    expect(canEnchant(requireItem('iron_sword'), ENCHANTMENT_DEFS.sharpness)).toBe(true);
    expect(canEnchant(requireItem('iron_pickaxe'), ENCHANTMENT_DEFS.sharpness)).toBe(false);
    expect(canEnchant(requireItem('iron_pickaxe'), ENCHANTMENT_DEFS.efficiency)).toBe(true);
    expect(canEnchant(requireItem('iron_helmet'), ENCHANTMENT_DEFS.protection)).toBe(true);
    expect(canEnchant(requireItem('iron_helmet'), ENCHANTMENT_DEFS.unbreaking)).toBe(true);
    expect(isEnchantable('book')).toBe(true);
    expect(isEnchantable('dirt')).toBe(false);
  });

  it('冲突附魔不能共存', () => {
    expect(enchantsCompatible(EnchantmentId.SILK_TOUCH, EnchantmentId.FORTUNE)).toBe(false);
    expect(enchantsCompatible(EnchantmentId.PROTECTION, EnchantmentId.FIRE_PROTECTION)).toBe(false);
    expect(enchantsCompatible(EnchantmentId.SHARPNESS, EnchantmentId.KNOCKBACK)).toBe(true);
  });

  it('附魔物品不能合并，复制时附魔表独立', () => {
    const a = pickaxe({ efficiency: 2 });
    expect(canMerge(a, pickaxe())).toBe(false);
    const b = cloneStack(a);
    b.enchants!.efficiency = 5;
    expect(enchantLevel(a, EnchantmentId.EFFICIENCY)).toBe(2);
    expect(describeEnchants(a)).toBe('效率 II');
  });
});

describe('附魔效果', () => {
  it('效率越高挖得越快', () => {
    const stone = getBlock(BlockId.STONE);
    const plain = breakTicks(stone, pickaxe());
    const fast = breakTicks(stone, pickaxe({ efficiency: 5 }));
    expect(fast).toBeLessThan(plain);
  });

  it('精准采集掉方块本身，时运让矿物掉得更多', () => {
    const stone = getBlock(BlockId.STONE);
    expect(rollDrops(stone, 0, pickaxe(), () => 0.5)).toEqual([{ id: 'cobblestone', count: 1 }]);
    expect(rollDrops(stone, 0, pickaxe({ silk_touch: 1 }), () => 0.5)).toEqual([{ id: 'stone', count: 1 }]);
    const coal = getBlock(BlockId.COAL_ORE);
    const fortune = rollDrops(coal, 0, pickaxe({ fortune: 3 }), () => 0.99);
    expect(fortune[0].id).toBe('coal');
    expect(fortune[0].count).toBe(4);
    // 时运不影响掉自己的方块
    expect(rollDrops(stone, 0, pickaxe({ fortune: 3 }), () => 0.99)).toEqual([{ id: 'cobblestone', count: 1 }]);
  });

  it('耐久附魔按概率免损', () => {
    expect(unbreakingSkips(0, false, () => 0)).toBe(false);
    expect(unbreakingSkips(3, false, () => 0.5)).toBe(true);
    expect(unbreakingSkips(3, false, () => 0.9)).toBe(false);
    // 盔甲先过 60% 的"不受影响"判定
    expect(unbreakingSkips(3, true, () => 0.1)).toBe(false);
  });
});

describe('附魔台', () => {
  it('书架越多三档消耗越高，且不超过 30 级', () => {
    const rng = () => 0.999;
    const none = enchantCosts(0, rng);
    const full = enchantCosts(15, rng);
    expect(none[0]).toBeLessThanOrEqual(none[1]);
    expect(none[1]).toBeLessThanOrEqual(none[2]);
    expect(full[2]).toBe(30);
    expect(full[2]).toBeGreaterThan(none[2]);
  });

  it('抽出的附魔都适用于该物品、互不冲突、不超过最高等级', () => {
    let seed = 1;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let i = 0; i < 200; i++) {
      const enchants = rollEnchantments(requireItem('diamond_pickaxe'), 30, rng);
      const ids = Object.keys(enchants) as EnchantmentId[];
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) {
        expect(canEnchant(requireItem('diamond_pickaxe'), ENCHANTMENT_DEFS[id])).toBe(true);
        expect(enchants[id]).toBeLessThanOrEqual(ENCHANTMENT_DEFS[id].maxLevel);
        for (const other of ids) {
          if (other !== id) {
            expect(enchantsCompatible(id, other)).toBe(true);
          }
        }
      }
    }
  });

  it('书附魔后变成附魔书；已附魔物品不再出选项', () => {
    const book = applyEnchants({ id: 'book', count: 1 }, { sharpness: 3 });
    expect(book.id).toBe('enchanted_book');
    expect(enchantLevel(book, EnchantmentId.SHARPNESS)).toBe(3);
    expect(rollOptions(book, 0, () => 0.5)).toBeNull();
    expect(rollOptions({ id: 'dirt', count: 1 }, 0, () => 0.5)).toBeNull();
    expect(rollOptions({ id: 'iron_sword', count: 1 }, 0, () => 0.5)?.length).toBe(3);
  });
});
