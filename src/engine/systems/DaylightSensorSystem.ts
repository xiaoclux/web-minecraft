import { BlockId } from '../blocks/BlockRegistry';
import { DAYLIGHT_SENSOR_INTERVAL_TICKS, REDSTONE_MAX_POWER } from '../constants/redstone';
import { BlockPositionTracker } from '../world/BlockPositionTracker';
import { unpackPos } from '../world/posKey';
import type { World } from '../world/World';

/** 日光传感器需要的外部信息。 */
export interface DaylightSensorHost {
  readonly world: World;
  /** 当前日光系数 0~1（夜里为 0）。 */
  readonly daylight: number;
}

/**
 * 日光传感器：按固定间隔把"所在格的天空光 × 当前日光"写进 meta，
 * 红石那边通过 analogFromMeta 直接把 meta 当作输出强度读走。
 * 写 meta 走 world.setBlock 而不是 setMeta，这样会触发方块变更事件、让红石线路跟着刷新。
 */
export class DaylightSensorSystem {
  private readonly sensors: BlockPositionTracker;
  private readonly posOut = [0, 0, 0];
  private tickCount = 0;

  constructor(private readonly host: DaylightSensorHost) {
    this.sensors = new BlockPositionTracker(host.world, BlockId.DAYLIGHT_SENSOR);
  }

  /** 已知的传感器数量（测试用）。 */
  get count(): number {
    return this.sensors.size;
  }

  /** 该点传感器应输出的强度。 */
  levelAt(x: number, y: number, z: number): number {
    const sky = this.host.world.getSkyLight(x, y, z);
    return Math.min(REDSTONE_MAX_POWER, Math.round(sky * this.host.daylight));
  }

  /** 每游戏 tick 调用一次。 */
  tick(): void {
    this.tickCount++;
    if (this.tickCount % DAYLIGHT_SENSOR_INTERVAL_TICKS !== 0 || this.sensors.size === 0) {
      return;
    }
    const world = this.host.world;
    // setBlock 会触发变更事件回写集合，先拷一份再遍历
    for (const key of [...this.sensors.positions]) {
      unpackPos(key, this.posOut);
      const [x, y, z] = this.posOut;
      const level = this.levelAt(x, y, z);
      if (world.getMeta(x, y, z) !== level) {
        world.setBlock(x, y, z, BlockId.DAYLIGHT_SENSOR, level);
      }
    }
  }
}
