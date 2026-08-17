import { describe, expect, it } from 'vitest';
import { Mob } from '../src/engine/entities/Mob';
import { MobType } from '../src/engine/entities/MobDefs';
import { ThrownItemEntity } from '../src/engine/entities/ThrownItemEntity';
import { mobContext } from './helpers';

describe('投掷物', () => {
  it('撞到实心方块就停下，落点是撞上之前的位置', () => {
    const context = mobContext();
    context.world.setBlock(2, 10, 0, 1);
    const snowball = new ThrownItemEntity('snowball', 999);
    snowball.setPosition(0, 10.5, 0.5);
    snowball.vx = 12;
    for (let i = 0; i < 40 && !snowball.impact; i++) {
      snowball.move(context, 0.05);
    }
    expect(snowball.impact).not.toBeNull();
    expect(snowball.impact!.x).toBeLessThan(2);
    expect(snowball.hitEntity).toBeNull();
  });

  it('穿过生物包围盒时记下被砸中的那只', () => {
    const cow = new Mob(MobType.COW);
    cow.setPosition(1.5, 10, 0.5);
    const context = mobContext({ livingEntitiesNear: () => [cow] });
    const egg = new ThrownItemEntity('egg', 999);
    egg.setPosition(0, 10.5, 0.5);
    egg.vx = 12;
    for (let i = 0; i < 40 && !egg.impact; i++) {
      egg.move(context, 0.01);
    }
    expect(egg.hitEntity).toBe(cow);
  });

  it('不会砸到扔它的人自己', () => {
    const thrower = new Mob(MobType.COW);
    thrower.setPosition(1, 10.2, 0.5);
    const context = mobContext({ livingEntitiesNear: () => [thrower] });
    const snowball = new ThrownItemEntity('snowball', thrower.id);
    snowball.setPosition(0, 10.5, 0.5);
    snowball.vx = 12;
    for (let i = 0; i < 10; i++) {
      snowball.move(context, 0.02);
    }
    expect(snowball.hitEntity).toBeNull();
  });
});
