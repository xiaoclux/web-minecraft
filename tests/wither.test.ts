import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/engine/blocks/BlockRegistry';
import { EffectId } from '../src/engine/entities/effects';
import type { EntityContext } from '../src/engine/entities/EntityContext';
import { WitherEntity, WitherPhase } from '../src/engine/entities/WitherEntity';
import { WitherSkullEntity } from '../src/engine/entities/WitherSkullEntity';
import { WITHER_CHARGE_TICKS, WITHER_MAX_HEALTH, WITHER_SHOOT_COOLDOWN_TICKS } from '../src/engine/constants/mobs';
import { Difficulty } from '../src/engine/constants/game';
import { Player } from '../src/engine/player/Player';
import {
  BEACON_MAX_LEVEL,
  beaconLevel,
  beaconOptionsFor,
  beaconRange,
  hasSkyAccess,
} from '../src/engine/systems/BeaconSystem';
import { Chunk } from '../src/engine/world/Chunk';
import { World } from '../src/engine/world/World';
import { emptyWorld } from './helpers';

function ctx(overrides: Partial<EntityContext> = {}): EntityContext {
  const player = new Player();
  player.setPosition(0, 64, 0);
  const spawned: unknown[] = [];
  return {
    world: emptyWorld(0),
    player,
    difficulty: Difficulty.NORMAL,
    random: () => 0.5,
    playSound: () => {},
    playMobSound: () => {},
    livingEntitiesNear: () => [],
    crystalsNear: () => [],
    spawnEntity: (e: unknown) => spawned.push(e),
    explode: () => {},
    hurtPlayer: () => {},
    onEntityKilled: () => {},
    __spawned: spawned,
    ...overrides,
  } as unknown as EntityContext;
}

describe('凋灵', () => {
  it('召唤后先蓄力，半血涨到满血才开打', () => {
    const wither = new WitherEntity();
    expect(wither.phase).toBe(WitherPhase.CHARGING);
    expect(wither.health).toBe(WITHER_MAX_HEALTH / 2);
    const c = ctx();
    for (let i = 0; i < WITHER_CHARGE_TICKS; i++) {
      wither.tick(c);
    }
    expect(wither.phase).toBe(WitherPhase.FIGHTING);
    expect(wither.health).toBe(WITHER_MAX_HEALTH);
    expect(wither.healthRatio).toBe(1);
  });

  it('战斗阶段按冷却发射凋灵之首', () => {
    const wither = new WitherEntity();
    const spawned: unknown[] = [];
    const c = ctx({ spawnEntity: (e) => spawned.push(e) });
    wither.setPosition(0, 68, 5);
    for (let i = 0; i < WITHER_CHARGE_TICKS; i++) {
      wither.tick(c);
    }
    wither.tick(c);
    expect(spawned.length).toBe(1);
    expect(spawned[0]).toBeInstanceOf(WitherSkullEntity);
    // 冷却期间不再发射
    for (let i = 0; i < WITHER_SHOOT_COOLDOWN_TICKS; i++) {
      wither.tick(c);
    }
    expect(spawned.length).toBe(1);
    wither.tick(c);
    expect(spawned.length).toBe(2);
  });

  it('凋灵之首命中会造成伤害并附加凋零', () => {
    const target = new Player();
    target.setPosition(0, 64, 0);
    const skull = new WitherSkullEntity(999);
    skull.setPosition(0, 64.5, 0);
    skull.vx = 0.01;
    const c = ctx({ livingEntitiesNear: () => [target] });
    const before = target.health;
    skull.move(c, 1);
    expect(target.health).toBeLessThan(before);
    expect(target.hasEffect(EffectId.WITHER)).toBe(true);
    expect(skull.isDead).toBe(true);
  });
});

describe('信标', () => {
  function pyramidWorld(levels: number): { world: World; x: number; y: number; z: number } {
    const world = new World(true);
    for (let cx = -1; cx <= 1; cx++) {
      for (let cz = -1; cz <= 1; cz++) {
        world.addChunk(new Chunk(cx, cz, true));
      }
    }
    const x = 4;
    const y = 40;
    const z = 4;
    for (let i = 1; i <= levels; i++) {
      for (let dz = -i; dz <= i; dz++) {
        for (let dx = -i; dx <= i; dx++) {
          world.setBlock(x + dx, y - i, z + dz, BlockId.IRON_BLOCK);
        }
      }
    }
    world.setBlock(x, y, z, BlockId.BEACON);
    return { world, x, y, z };
  }

  it('金字塔每多铺满一层等级加一，上限四级', () => {
    for (const levels of [1, 2, 3, 4]) {
      const { world, x, y, z } = pyramidWorld(levels);
      expect(beaconLevel(world, x, y, z)).toBe(levels);
    }
    const { world, x, y, z } = pyramidWorld(BEACON_MAX_LEVEL + 1);
    expect(beaconLevel(world, x, y, z)).toBe(BEACON_MAX_LEVEL);
  });

  it('层没铺满就不算这一级', () => {
    const { world, x, y, z } = pyramidWorld(2);
    world.setBlock(x + 2, y - 2, z + 2, BlockId.AIR);
    expect(beaconLevel(world, x, y, z)).toBe(1);
  });

  it('上方被挡住就不生效，玻璃不算挡', () => {
    const { world, x, y, z } = pyramidWorld(1);
    expect(hasSkyAccess(world, x, y, z)).toBe(true);
    world.setBlock(x, y + 5, z, BlockId.GLASS);
    expect(hasSkyAccess(world, x, y, z)).toBe(true);
    world.setBlock(x, y + 6, z, BlockId.STONE);
    expect(hasSkyAccess(world, x, y, z)).toBe(false);
  });

  it('等级越高可选效果越多、范围越远', () => {
    expect(beaconOptionsFor(1).map((o) => o.effect)).toEqual([EffectId.SPEED]);
    expect(beaconOptionsFor(4).length).toBeGreaterThan(beaconOptionsFor(1).length);
    expect(beaconRange(4)).toBeGreaterThan(beaconRange(1));
  });
});
