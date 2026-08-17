import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/engine/blocks/BlockRegistry';
import { Mob } from '../src/engine/entities/Mob';
import { MobType } from '../src/engine/entities/MobDefs';
import { ServerEntityWorld } from '../src/net/ServerEntityWorld';
import type { World } from '../src/engine/world/World';
import { emptyWorld } from './helpers';

/** 一片有草地面的世界，够刷怪器落脚。 */
function grassWorld(): World {
  const world = emptyWorld(4);
  for (let x = -60; x <= 60; x++) {
    for (let z = -60; z <= 60; z++) {
      world.setBlock(x, 9, z, BlockId.GRASS);
    }
  }
  return world;
}

describe('服务端生物世界', () => {
  it('没有玩家在线时不刷怪', () => {
    const world = grassWorld();
    const server = new ServerEntityWorld({ world, currentTime: () => 0, playerPositions: () => [] });
    for (let i = 0; i < 200; i++) {
      server.tickWorld();
    }
    expect(server.entities.size).toBe(0);
  });

  it('有玩家在线就会刷出生物，并出现在快照里', () => {
    const world = grassWorld();
    const server = new ServerEntityWorld({
      world,
      currentTime: () => 0,
      playerPositions: () => [{ id: 1, x: 0.5, y: 10, z: 0.5 }],
    });
    for (let i = 0; i < 200; i++) {
      server.tickWorld();
    }
    expect(server.entities.size).toBeGreaterThan(0);
    const snapshot = server.snapshot();
    expect(snapshot.length).toBe(server.entities.size);
    expect(snapshot[0]).toHaveProperty('kind');
    expect(snapshot[0]).toHaveProperty('yaw');
  });

  it('生物追离自己最近的那个玩家', () => {
    const world = grassWorld();
    const players = [
      { id: 1, x: -30.5, y: 10, z: 0.5 },
      { id: 2, x: 30.5, y: 10, z: 0.5 },
    ];
    const server = new ServerEntityWorld({ world, currentTime: () => 18000, playerPositions: () => players });
    const zombie = new Mob(MobType.ZOMBIE);
    zombie.setPosition(24.5, 10, 0.5);
    server.spawnEntity(zombie);
    const startDistToNear = Math.abs(zombie.x - players[1].x);
    for (let i = 0; i < 200; i++) {
      server.tickWorld();
    }
    // 该往 +x（2 号玩家）那边走，而不是掉头去追远处的 1 号
    expect(Math.abs(zombie.x - players[1].x)).toBeLessThan(startDistToNear);
  });

  it('所有人都下线后清空实体', () => {
    const world = grassWorld();
    let online = [{ id: 1, x: 0.5, y: 10, z: 0.5 }];
    const server = new ServerEntityWorld({ world, currentTime: () => 0, playerPositions: () => online });
    for (let i = 0; i < 200; i++) {
      server.tickWorld();
    }
    expect(server.entities.size).toBeGreaterThan(0);
    online = [];
    for (let i = 0; i < 40; i++) {
      server.tickWorld();
    }
    expect(server.entities.size).toBe(0);
  });
});
