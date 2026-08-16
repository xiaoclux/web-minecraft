import { describe, expect, it } from 'vitest';
import {
  MOB_BABY_GROW_TICKS,
  MOB_BABY_SCALE,
  MOB_LOVE_TICKS,
  SHEAR_WOOL_MAX,
  SHEAR_WOOL_MIN,
  SHEEP_WOOL_REGROW_TICKS,
} from '../src/engine/constants/mobs';
import { SHEARS_DURABILITY, getItem } from '../src/engine/items/ItemRegistry';
import { RECIPES } from '../src/engine/items/Recipes';
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

describe('剪羊毛', () => {
  it('有毛的羊被剪后掉 1~3 羊毛并进入长毛倒计时', () => {
    const sheep = new Mob('sheep');
    const wool = sheep.shear(() => 0.5);
    expect(wool).toBeGreaterThanOrEqual(SHEAR_WOOL_MIN);
    expect(wool).toBeLessThanOrEqual(SHEAR_WOOL_MAX);
    expect(sheep.hasWool).toBe(false);
    expect(sheep.woolRegrowTicks).toBe(SHEEP_WOOL_REGROW_TICKS);
  });

  it('没毛的羊、幼崽和别的生物剪不出东西', () => {
    const sheep = new Mob('sheep');
    sheep.shear(() => 0);
    expect(sheep.shear(() => 0)).toBe(0);
    const baby = new Mob('sheep');
    baby.setBaby(true);
    expect(baby.shear(() => 0)).toBe(0);
    expect(new Mob('cow').shear(() => 0)).toBe(0);
  });

  it('剪刀有耐久且能合成', () => {
    expect(getItem('shears')?.durability).toBe(SHEARS_DURABILITY);
    expect(RECIPES.some((r) => r.result.id === 'shears')).toBe(true);
  });
});
