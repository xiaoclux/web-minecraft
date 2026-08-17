import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/engine/blocks/BlockRegistry';
import { DAYLIGHT_SENSOR_INTERVAL_TICKS, REDSTONE_MAX_POWER } from '../src/engine/constants/redstone';
import { DaylightSensorSystem } from '../src/engine/systems/DaylightSensorSystem';
import { sourcePower } from '../src/engine/systems/RedstoneSystem';
import { BlockPositionTracker } from '../src/engine/world/BlockPositionTracker';
import { Chunk } from '../src/engine/world/Chunk';
import { packPos } from '../src/engine/world/posKey';
import { emptyWorld } from './helpers';

/** 跑够一个刷新周期。 */
function runInterval(system: DaylightSensorSystem): void {
  for (let i = 0; i < DAYLIGHT_SENSOR_INTERVAL_TICKS; i++) {
    system.tick();
  }
}

describe('BlockPositionTracker', () => {
  it('随方块放置 / 移除增量维护位置集合', () => {
    const world = emptyWorld(1);
    const tracker = new BlockPositionTracker(world, BlockId.FIRE);
    world.setBlock(1, 5, 1, BlockId.FIRE);
    world.setBlock(2, 5, 1, BlockId.STONE);
    expect(tracker.size).toBe(1);
    expect(tracker.positions.has(packPos(1, 5, 1))).toBe(true);
    world.setBlock(1, 5, 1, BlockId.AIR);
    expect(tracker.size).toBe(0);
  });

  it('chunk 加载时扫描已有方块，卸载时忘掉', () => {
    const world = emptyWorld(0);
    const tracker = new BlockPositionTracker(world, BlockId.DAYLIGHT_SENSOR);
    const chunk = new Chunk(1, 0);
    chunk.setWorld(20, 40, 3, BlockId.DAYLIGHT_SENSOR);
    world.addChunk(chunk);
    expect(tracker.positions.has(packPos(20, 40, 3))).toBe(true);
    world.removeChunk(1, 0);
    expect(tracker.size).toBe(0);
  });
});

describe('日光传感器', () => {
  it('露天白天输出满强度，夜里归零', () => {
    const world = emptyWorld(1);
    const host = { world, daylight: 1 };
    const system = new DaylightSensorSystem(host);
    world.setBlock(0, 10, 0, BlockId.DAYLIGHT_SENSOR);
    world.setSkyLight(0, 10, 0, 15);
    runInterval(system);
    expect(world.getMeta(0, 10, 0)).toBe(REDSTONE_MAX_POWER);
    expect(sourcePower(world, 0, 10, 0)).toBe(REDSTONE_MAX_POWER);

    host.daylight = 0;
    runInterval(system);
    expect(world.getMeta(0, 10, 0)).toBe(0);
    expect(sourcePower(world, 0, 10, 0)).toBe(0);
  });

  it('被遮住的传感器按实际天空光衰减', () => {
    const world = emptyWorld(1);
    const system = new DaylightSensorSystem({ world, daylight: 1 });
    world.setBlock(0, 10, 0, BlockId.DAYLIGHT_SENSOR);
    world.setSkyLight(0, 10, 0, 6);
    runInterval(system);
    expect(world.getMeta(0, 10, 0)).toBe(6);
  });
});
