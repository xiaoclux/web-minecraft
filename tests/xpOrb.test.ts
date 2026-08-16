import { describe, expect, it } from 'vitest';
import { XP_ORB_ATTRACT_RANGE, XP_ORB_PICKUP_RANGE } from '../src/engine/constants/game';
import type { EntityContext } from '../src/engine/entities/EntityContext';
import { XpOrbEntity } from '../src/engine/entities/XpOrbEntity';
import { Player } from '../src/engine/player/Player';
import { emptyWorld } from './helpers';

/** 只提供经验球用得到的那部分上下文。 */
function ctxWith(player: Player): EntityContext {
  return {
    world: emptyWorld(0),
    player,
    playSound: () => {},
  } as unknown as EntityContext;
}

describe('经验球', () => {
  it('碰到玩家就加经验并消失', () => {
    const player = new Player();
    player.setPosition(0, 10, 0);
    const orb = new XpOrbEntity(5);
    orb.setPosition(0, 10, 0);
    orb.tick(ctxWith(player));
    expect(player.xp).toBe(5);
    expect(orb.isDead).toBe(true);
  });

  it('在吸引范围内会朝玩家加速', () => {
    const player = new Player();
    player.setPosition(0, 10, 0);
    const orb = new XpOrbEntity(1);
    orb.setPosition(XP_ORB_ATTRACT_RANGE - 1, 10, 0);
    orb.tick(ctxWith(player));
    expect(orb.vx).toBeLessThan(0);
    expect(orb.isDead).toBe(false);
  });

  it('太远则不受影响', () => {
    const player = new Player();
    player.setPosition(0, 10, 0);
    const orb = new XpOrbEntity(1);
    orb.setPosition(XP_ORB_ATTRACT_RANGE + 5, 10, 0);
    orb.tick(ctxWith(player));
    expect(orb.vx).toBe(0);
  });

  it('拾取半径小于吸引半径', () => {
    expect(XP_ORB_PICKUP_RANGE).toBeLessThan(XP_ORB_ATTRACT_RANGE);
  });

  it('存档往返保留经验数量', () => {
    const orb = new XpOrbEntity(9);
    orb.setPosition(1, 2, 3);
    const restored = XpOrbEntity.deserialize(orb.serialize());
    expect(restored.amount).toBe(9);
    expect(restored.x).toBe(1);
  });
});
