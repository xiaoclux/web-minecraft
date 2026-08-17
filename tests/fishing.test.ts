import { describe, expect, it } from 'vitest';
import { FISHING_MAX_WAIT_TICKS, FISHING_MIN_WAIT_TICKS } from '../src/engine/constants/game';
import { FishingBobberEntity } from '../src/engine/entities/FishingBobberEntity';
import { Mob } from '../src/engine/entities/Mob';
import { MobType } from '../src/engine/entities/MobDefs';
import { getItem } from '../src/engine/items/ItemRegistry';
import { LootTable, rollOne } from '../src/engine/world/structures/LootTables';
import { BlockId } from '../src/engine/blocks/BlockRegistry';
import { fillLayer, mobContext } from './helpers';

describe('钓鱼', () => {
  it('浮漂落到水面就停住并开始等咬钩', () => {
    const context = mobContext();
    fillLayer(context.world, 9, 4, BlockId.WATER);
    const bobber = new FishingBobberEntity();
    bobber.setPosition(0.5, 12, 0.5);
    for (let i = 0; i < 100 && !bobber.inWaterSurface; i++) {
      bobber.move(context, 0.05);
    }
    expect(bobber.inWaterSurface).toBe(true);
    expect(bobber.y).toBeCloseTo(10, 1);
    expect(bobber.hasBite).toBe(false);
  });

  it('等够时间就咬钩', () => {
    const context = mobContext();
    fillLayer(context.world, 9, 4, BlockId.WATER);
    const bobber = new FishingBobberEntity();
    bobber.setPosition(0.5, 12, 0.5);
    for (let i = 0; i < 100 && !bobber.inWaterSurface; i++) {
      bobber.move(context, 0.05);
    }
    for (let i = 0; i < FISHING_MAX_WAIT_TICKS + 2; i++) {
      bobber.tick(context);
    }
    expect(bobber.hasBite).toBe(true);
  });

  it('砸到地上这一竿就废了', () => {
    const context = mobContext();
    for (let x = -4; x <= 4; x++) {
      for (let z = -4; z <= 4; z++) {
        context.world.setBlock(x, 9, z, BlockId.STONE);
      }
    }
    const bobber = new FishingBobberEntity();
    bobber.setPosition(0.5, 12, 0.5);
    for (let i = 0; i < 100 && !bobber.isDead; i++) {
      bobber.move(context, 0.05);
    }
    expect(bobber.isDead).toBe(true);
    expect(bobber.inWaterSurface).toBe(false);
  });

  it('等待时间落在 1.8.9 的 5~30 秒区间里', () => {
    expect(FISHING_MIN_WAIT_TICKS).toBe(100);
    expect(FISHING_MAX_WAIT_TICKS).toBe(600);
  });

  it('一竿必有收获，钓上来的都是真实存在的物品', () => {
    for (let i = 0; i < 200; i++) {
      const stack = rollOne(LootTable.FISHING, () => i / 200);
      expect(stack.count).toBeGreaterThan(0);
      expect(getItem(stack.id)).toBeDefined();
    }
  });

  it('豹猫吃生鱼、狼吃骨头，互相不认对方的东西', () => {
    const cat = new Mob(MobType.OCELOT);
    expect(cat.interactWithItem('bone', () => 0)).toBe('none');
    expect(cat.interactWithItem('fish', () => 0)).toBe('tamed');
    const wolf = new Mob(MobType.WOLF);
    expect(wolf.interactWithItem('fish', () => 0)).toBe('none');
  });
});
