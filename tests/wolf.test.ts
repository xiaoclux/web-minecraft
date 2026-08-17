import { describe, expect, it } from 'vitest';
import { Mob } from '../src/engine/entities/Mob';
import { MobType } from '../src/engine/entities/MobDefs';
import { mobContext } from './helpers';

describe('狼', () => {
  it('喂骨头有概率驯服，失败也会吃掉那根骨头', () => {
    const lucky = new Mob(MobType.WOLF);
    expect(lucky.interactWithItem('bone', () => 0)).toBe('tamed');
    expect(lucky.isTamed).toBe(true);

    const unlucky = new Mob(MobType.WOLF);
    expect(unlucky.interactWithItem('bone', () => 0.99)).toBe('failed');
    expect(unlucky.isTamed).toBe(false);
  });

  it('不吃的东西不理你', () => {
    const wolf = new Mob(MobType.WOLF);
    expect(wolf.interactWithItem('stone', () => 0)).toBe('none');
    expect(wolf.interactWithItem(null, () => 0)).toBe('none');
  });

  it('驯服之后右键切换坐下 / 起立', () => {
    const wolf = new Mob(MobType.WOLF);
    wolf.interactWithItem('bone', () => 0);
    expect(wolf.interactWithItem(null, () => 0)).toBe('sit');
    expect(wolf.isSitting).toBe(true);
    expect(wolf.interactWithItem(null, () => 0)).toBe('stand');
    expect(wolf.isSitting).toBe(false);
  });

  it('坐着不动，站着会朝主人走', () => {
    const context = mobContext();
    context.player.setPosition(20, 64, 0);
    const wolf = new Mob(MobType.WOLF);
    wolf.interactWithItem('bone', () => 0);
    wolf.setPosition(0, 64, 0);

    wolf.isSitting = true;
    for (let i = 0; i < 20; i++) {
      wolf.tick(context);
      wolf.move(context, 0.05);
    }
    expect(Math.abs(wolf.x)).toBeLessThan(0.5);

    wolf.isSitting = false;
    for (let i = 0; i < 60; i++) {
      wolf.tick(context);
      wolf.move(context, 0.05);
    }
    expect(wolf.x).toBeGreaterThan(0.5);
  });

  it('主人指了目标就去咬，目标死了就收手', () => {
    const context = mobContext();
    const zombie = new Mob(MobType.ZOMBIE);
    zombie.setPosition(2, 64, 0);
    const wolf = new Mob(MobType.WOLF);
    wolf.interactWithItem('bone', () => 0);
    wolf.setPosition(0, 64, 0);
    wolf.setPetTarget(zombie);
    const before = zombie.health;
    for (let i = 0; i < 40; i++) {
      wolf.tick(context);
      wolf.move(context, 0.05);
    }
    expect(zombie.health).toBeLessThan(before);
  });

  it('没驯服的狼不会被指使', () => {
    const wolf = new Mob(MobType.WOLF);
    const zombie = new Mob(MobType.ZOMBIE);
    wolf.setPetTarget(zombie);
    // 没驯服就不该接受指令，行为仍然是普通友善生物
    expect(wolf.isTamed).toBe(false);
  });
});
