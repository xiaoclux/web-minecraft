import { describe, expect, it } from 'vitest';
import { AchievementId, AchievementSystem, StatId } from '../src/engine/systems/Achievements';

function setup() {
  const unlocked: string[] = [];
  const system = new AchievementSystem((def) => unlocked.push(def.id));
  return { system, unlocked };
}

describe('成就与统计', () => {
  it('没有前置成就时不解锁，前置完成后才给', () => {
    const { system, unlocked } = setup();
    system.onCrafted('crafting_table', 1);
    expect(unlocked).toEqual([]);
    system.onOpenInventory();
    system.onItemObtained('oak_log');
    system.onCrafted('crafting_table', 1);
    system.onCrafted('stone_pickaxe', 1);
    expect(unlocked).toEqual([
      AchievementId.TAKING_INVENTORY,
      AchievementId.MINE_WOOD,
      AchievementId.BUILD_WORKBENCH,
      AchievementId.BUILD_PICKAXE,
      AchievementId.BUILD_BETTER_PICKAXE,
    ]);
    // 重复触发不再通知
    system.onCrafted('crafting_table', 1);
    expect(unlocked.length).toBe(5);
    expect(system.unlockedCount).toBe(5);
  });

  it('统计累加并随存档往返；游戏时长不改 version', () => {
    const { system } = setup();
    system.addStat(StatId.BLOCKS_MINED, 3);
    system.addStat(StatId.BLOCKS_MINED);
    const version = system.version;
    system.tickPlayTime();
    system.tickPlayTime();
    expect(system.version).toBe(version);
    expect(system.stat(StatId.PLAY_TICKS)).toBe(2);
    system.onOpenInventory();
    const data = system.serialize();
    const { system: restored } = setup();
    restored.load({ ...data, unlocked: [...data.unlocked, 'not_a_real_one'] });
    expect(restored.stat(StatId.BLOCKS_MINED)).toBe(4);
    expect(restored.has(AchievementId.TAKING_INVENTORY)).toBe(true);
    expect(restored.unlockedCount).toBe(1);
  });
});
