import { describe, expect, it } from 'vitest';
import { getItem } from '../src/engine/items/ItemRegistry';
import { Mob } from '../src/engine/entities/Mob';
import { MobType } from '../src/engine/entities/MobDefs';
import { VILLAGER_PROFESSIONS, VILLAGER_TRADES, rollTrades } from '../src/engine/entities/villagerTrades';

describe('村民交易表', () => {
  it('交易里出现的物品 id 都真实存在', () => {
    for (const profession of VILLAGER_PROFESSIONS) {
      for (const offer of VILLAGER_TRADES[profession]) {
        for (const give of offer.give) {
          expect(getItem(give.id), `${profession} 收的 ${give.id}`).toBeDefined();
        }
        expect(getItem(offer.receive.id), `${profession} 给的 ${offer.receive.id}`).toBeDefined();
      }
    }
  });

  it('每个村民拿到的是自己那一份，用掉次数不会互相影响', () => {
    const a = rollTrades('farmer');
    const b = rollTrades('farmer');
    a[0].uses = 0;
    expect(b[0].uses).toBeGreaterThan(0);
  });
});

describe('村民', () => {
  it('安排职业时会拿到那一行的交易表', () => {
    const villager = new Mob(MobType.VILLAGER);
    expect(villager.trades).toEqual([]);
    villager.setProfession('blacksmith');
    expect(villager.profession).toBe('blacksmith');
    expect(villager.trades.length).toBe(VILLAGER_TRADES.blacksmith.length);
  });

  it('存档能带上职业与剩余交易次数', () => {
    const villager = new Mob(MobType.VILLAGER);
    villager.setProfession('farmer');
    villager.trades[0].uses = 3;
    const restored = Mob.deserialize(villager.serialize());
    expect(restored.profession).toBe('farmer');
    expect(restored.trades[0].uses).toBe(3);
  });
});
