import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/engine/blocks/BlockRegistry';
import { EnderCrystalEntity } from '../src/engine/entities/EnderCrystalEntity';
import { DragonPhase, EnderDragonEntity } from '../src/engine/entities/EnderDragonEntity';
import { DRAGON_HEAL_INTERVAL_TICKS, DRAGON_MAX_HEALTH } from '../src/engine/constants/mobs';
import { StrongholdGenerator, STRONGHOLD_COUNT } from '../src/engine/world/structures/StrongholdGenerator';
import { Chunk } from '../src/engine/world/Chunk';
import { mobContext } from './helpers';


describe('末影龙', () => {
  it('每颗存活的水晶都会给龙回血，水晶没了就不回', () => {
    const dragon = new EnderDragonEntity(0, 0);
    dragon.health = 100;
    const crystals = [new EnderCrystalEntity(), new EnderCrystalEntity()];
    const withCrystals = mobContext({ crystalsNear: () => crystals });
    for (let i = 0; i < DRAGON_HEAL_INTERVAL_TICKS; i++) {
      dragon.tick(withCrystals);
    }
    expect(dragon.health).toBe(102);
    crystals.forEach((c) => (c.isDead = true));
    const before = dragon.health;
    for (let i = 0; i < DRAGON_HEAL_INTERVAL_TICKS; i++) {
      dragon.tick(withCrystals);
    }
    expect(dragon.health).toBe(before);
  });

  it('冷却结束后从盘旋转入俯冲', () => {
    const dragon = new EnderDragonEntity(0, 0);
    expect(dragon.phase).toBe(DragonPhase.CIRCLE);
    const c = mobContext();
    for (let i = 0; i < 200; i++) {
      dragon.tick(c);
    }
    expect(dragon.phase).toBe(DragonPhase.CHARGE);
  });

  it('死亡时上报击杀事件，血条比例随血量变化', () => {
    const dragon = new EnderDragonEntity(0, 0);
    expect(dragon.maxHealth).toBe(DRAGON_MAX_HEALTH);
    expect(dragon.healthRatio).toBe(1);
    let killed = false;
    const c = mobContext({ onEntityKilled: () => { killed = true; } });
    dragon.hurt(c, DRAGON_MAX_HEALTH, null);
    expect(killed).toBe(true);
    expect(dragon.healthRatio).toBe(0);
  });

  it('水晶被打碎会爆炸并消失', () => {
    const crystal = new EnderCrystalEntity();
    let exploded = false;
    const c = mobContext({ explode: () => { exploded = true; } });
    crystal.destroyByAttack(c, 1);
    expect(crystal.isDead).toBe(true);
    expect(exploded).toBe(true);
    // 已经碎了就不会再炸一次
    exploded = false;
    crystal.destroyByAttack(c, 1);
    expect(exploded).toBe(false);
  });
});

describe('要塞', () => {
  it('每个世界固定三座，位置只由种子决定', () => {
    const a = new StrongholdGenerator('abc');
    const b = new StrongholdGenerator('abc');
    expect(a.all.length).toBe(STRONGHOLD_COUNT);
    expect(a.all).toEqual(b.all);
    expect(new StrongholdGenerator('xyz').all).not.toEqual(a.all);
  });

  it('最近的要塞按距离选', () => {
    const generator = new StrongholdGenerator('abc');
    const target = generator.all[1];
    const nearest = generator.nearest(target.centerX, target.centerZ);
    expect(nearest).toEqual(target);
  });

  it('传送门房里有 12 块框架围成的方环', () => {
    const generator = new StrongholdGenerator('abc');
    const stronghold = generator.all[0];
    const chunk = new Chunk(Math.floor(stronghold.centerX / 16), Math.floor(stronghold.centerZ / 16), true);
    generator.placeInChunk(chunk);
    let frames = 0;
    for (let y = stronghold.y - 1; y <= stronghold.y + 6; y++) {
      for (let lz = 0; lz < 16; lz++) {
        for (let lx = 0; lx < 16; lx++) {
          if (chunk.getLocal(lx, y, lz) === BlockId.END_PORTAL_FRAME) frames++;
        }
      }
    }
    // 方环共 12 块，可能被 chunk 边界切开，所以只要求至少有一块且不超过 12
    expect(frames).toBeGreaterThan(0);
    expect(frames).toBeLessThanOrEqual(12);
  });
});
