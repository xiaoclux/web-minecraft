import { describe, expect, it } from 'vitest';
import { MOB_DEFS, MobType } from '../src/engine/entities/MobDefs';
import { MOB_MODELS } from '../src/engine/render/MobModels';
import { FireballEntity, FireballKind } from '../src/engine/entities/FireballEntity';
import { Mob } from '../src/engine/entities/Mob';
import type { EntityContext } from '../src/engine/entities/EntityContext';
import { emptyWorld } from './helpers';

const NETHER_MOBS: MobType[] = [
  MobType.ZOMBIE_PIGMAN,
  MobType.GHAST,
  MobType.BLAZE,
  MobType.MAGMA_CUBE,
  MobType.WITHER_SKELETON,
];

function ctx(overrides: Partial<EntityContext> = {}): EntityContext {
  return {
    world: emptyWorld(0),
    random: () => 0.5,
    playSound: () => {},
    playMobSound: () => {},
    livingEntitiesNear: () => [],
    spawnEntity: () => {},
    ...overrides,
  } as unknown as EntityContext;
}

/** 用固定的随机值杀掉一只猪人，返回掉了哪些物品 id。 */
function killDrops(random: number): string[] {
  const dropped: string[] = [];
  const pigman = new Mob(MobType.ZOMBIE_PIGMAN);
  pigman.hurt(
    ctx({
      random: () => random,
      dropItem: (_x: number, _y: number, _z: number, stack: { id: string }) => dropped.push(stack.id),
      onEntityKilled: () => {},
    }),
    999,
    null,
  );
  return dropped;
}

describe('下界生物', () => {
  it('僵尸猪人小概率掉落金剑', () => {
    const sword = MOB_DEFS.zombie_pigman.drops.find((d) => d.item === 'golden_sword');
    expect(sword).toBeDefined();
    expect(sword?.chance).toBeLessThan(0.1);
    expect(killDrops(0.5)).not.toContain('golden_sword');
    expect(killDrops(0.01)).toContain('golden_sword');
  });

  it('五种下界生物都免疫火、都只在下界生成、都有模型', () => {
    for (const type of NETHER_MOBS) {
      const def = MOB_DEFS[type];
      expect(def.fireImmune, type).toBe(true);
      expect(def.dimensions, type).toEqual(['nether']);
      expect(MOB_MODELS[type], type).toBeDefined();
      expect(MOB_MODELS[type].parts.length, type).toBeGreaterThan(0);
    }
  });

  it('僵尸猪人是中立的，被打后连同附近同族一起被激怒', () => {
    expect(MOB_DEFS.zombie_pigman.neutral).toBe(true);
    const a = new Mob(MobType.ZOMBIE_PIGMAN);
    const b = new Mob(MobType.ZOMBIE_PIGMAN);
    const other = new Mob(MobType.ZOMBIE);
    a.setPosition(0, 0, 0);
    b.setPosition(2, 0, 0);
    other.setPosition(2, 0, 0);
    expect(a.angerTicks).toBe(0);
    a.hurt(ctx({ livingEntitiesNear: () => [b, other] }), 1, b, true);
    expect(a.angerTicks).toBeGreaterThan(0);
    expect(b.angerTicks).toBeGreaterThan(0);
    // 不同种族不会被波及
    expect(other.angerTicks).toBe(0);
  });

  it('凋灵骷髅带凋零、烈焰人带点燃', () => {
    expect(MOB_DEFS.wither_skeleton.witherTicks).toBeGreaterThan(0);
    expect(MOB_DEFS.blaze.igniteTicks).toBeGreaterThan(0);
  });

  it('恶魂扔大火球、烈焰人扔小火球', () => {
    expect(MOB_DEFS.ghast.ranged).toBe('fireball');
    expect(MOB_DEFS.blaze.ranged).toBe('small_fireball');
  });
});

describe('火球', () => {
  it('大火球比小火球大，被弹回后方向反转且归属换人', () => {
    const large = new FireballEntity(FireballKind.LARGE, 1);
    const small = new FireballEntity(FireballKind.SMALL, 1);
    expect(large.width).toBeGreaterThan(small.width);
    large.vx = 3;
    large.vz = -4;
    large.reflect(99);
    expect(large.vx).toBe(-3);
    expect(large.vz).toBe(4);
    expect(large.shooterId).toBe(99);
    expect(large.reflected).toBe(true);
  });

  it('火球不受重力、不进存档', () => {
    const ball = new FireballEntity(FireballKind.SMALL, 1);
    expect(ball.hasGravity).toBe(false);
    expect(ball.serialize()).toBeNull();
  });
});
