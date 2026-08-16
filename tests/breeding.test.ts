import { describe, expect, it } from 'vitest';
import { MOB_BABY_GROW_TICKS, MOB_BABY_SCALE, MOB_LOVE_TICKS } from '../src/engine/constants/mobs';
import { Mob } from '../src/engine/entities/Mob';
import { MOB_DEFS } from '../src/engine/entities/MobDefs';

describe('动物繁殖', () => {
  it('喂对了食物才会进入求爱状态', () => {
    const cow = new Mob('cow');
    expect(cow.canBreedWith('wheat')).toBe(true);
    expect(cow.canBreedWith('wheat_seeds')).toBe(false);
    const chicken = new Mob('chicken');
    expect(chicken.canBreedWith('wheat_seeds')).toBe(true);
    expect(chicken.canBreedWith('wheat')).toBe(false);
  });

  it('敌对生物不能繁殖', () => {
    expect(new Mob('zombie').canBreedWith('wheat')).toBe(false);
    expect(MOB_DEFS.zombie.breedingItems).toBeUndefined();
  });

  it('求爱中的动物不会被重复喂食', () => {
    const cow = new Mob('cow');
    cow.enterLove();
    expect(cow.loveTicks).toBe(MOB_LOVE_TICKS);
    expect(cow.canBreedWith('wheat')).toBe(false);
  });

  it('幼崽体型减半、不能繁殖，长大后恢复', () => {
    const cow = new Mob('cow');
    const def = MOB_DEFS.cow;
    cow.setBaby(true);
    expect(cow.isBaby).toBe(true);
    expect(cow.width).toBeCloseTo(def.width * MOB_BABY_SCALE, 5);
    expect(cow.height).toBeCloseTo(def.height * MOB_BABY_SCALE, 5);
    expect(cow.canBreedWith('wheat')).toBe(false);
    cow.setBaby(false);
    expect(cow.width).toBeCloseTo(def.width, 5);
  });

  it('幼崽状态随存档往返', () => {
    const cow = new Mob('cow');
    cow.setBaby(true, 1234);
    cow.setPosition(1, 2, 3);
    const restored = Mob.deserialize(cow.serialize());
    expect(restored.isBaby).toBe(true);
    expect(restored.growTicks).toBe(1234);
    expect(restored.width).toBeCloseTo(MOB_DEFS.cow.width * MOB_BABY_SCALE, 5);
  });

  it('幼崽默认按 20 分钟长大', () => {
    const cow = new Mob('cow');
    cow.setBaby(true);
    expect(cow.growTicks).toBe(MOB_BABY_GROW_TICKS);
  });
});
