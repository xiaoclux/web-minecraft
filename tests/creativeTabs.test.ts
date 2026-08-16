import { describe, expect, it } from 'vitest';
import { CREATIVE_TAB_DEFS, CreativeTab, creativeItems, creativeTabOf } from '../src/engine/items/creativeTabs';
import { ITEM_DEFS, requireItem } from '../src/engine/items/ItemRegistry';

describe('创造物品栏分页', () => {
  it('常见物品落在直觉上的页里', () => {
    expect(creativeTabOf(requireItem('stone'))).toBe(CreativeTab.BUILDING);
    expect(creativeTabOf(requireItem('wool'))).toBe(CreativeTab.DECORATION);
    expect(creativeTabOf(requireItem('redstone_lamp'))).toBe(CreativeTab.REDSTONE);
    expect(creativeTabOf(requireItem('piston'))).toBe(CreativeTab.REDSTONE);
    expect(creativeTabOf(requireItem('rail'))).toBe(CreativeTab.TRANSPORT);
    expect(creativeTabOf(requireItem('minecart'))).toBe(CreativeTab.TRANSPORT);
    expect(creativeTabOf(requireItem('bread'))).toBe(CreativeTab.FOOD);
    expect(creativeTabOf(requireItem('iron_pickaxe'))).toBe(CreativeTab.TOOLS);
    expect(creativeTabOf(requireItem('iron_sword'))).toBe(CreativeTab.COMBAT);
    expect(creativeTabOf(requireItem('diamond_helmet'))).toBe(CreativeTab.COMBAT);
    expect(creativeTabOf(requireItem('blaze_powder'))).toBe(CreativeTab.BREWING);
    expect(creativeTabOf(requireItem('potion_speed'))).toBe(CreativeTab.BREWING);
    expect(creativeTabOf(requireItem('iron_ingot'))).toBe(CreativeTab.MATERIALS);
  });

  it('除搜索页外每个物品都恰好属于一页，且没有空页', () => {
    const tabs = CREATIVE_TAB_DEFS.filter((t) => t.id !== CreativeTab.SEARCH);
    let total = 0;
    for (const tab of tabs) {
      const items = creativeItems(ITEM_DEFS, tab.id, '');
      expect(items.length, tab.label).toBeGreaterThan(0);
      total += items.length;
    }
    expect(total).toBe(ITEM_DEFS.length);
  });

  it('搜索页按 id 与中文名匹配，空关键词给出全部', () => {
    expect(creativeItems(ITEM_DEFS, CreativeTab.SEARCH, '').length).toBe(ITEM_DEFS.length);
    const byId = creativeItems(ITEM_DEFS, CreativeTab.SEARCH, 'diamond');
    expect(byId.every((d) => d.id.includes('diamond'))).toBe(true);
    expect(byId.length).toBeGreaterThan(1);
    const byLabel = creativeItems(ITEM_DEFS, CreativeTab.SEARCH, '钻石');
    expect(byLabel.length).toBeGreaterThan(1);
    expect(creativeItems(ITEM_DEFS, CreativeTab.SEARCH, 'zzzz')).toEqual([]);
  });
});
