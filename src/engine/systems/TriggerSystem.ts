import { BlockId } from '../blocks/BlockRegistry';
import { FACINGS } from '../blocks/blockShapes';
import {
  PRESSURE_PLATE_RANGE,
  REDSTONE_POWERED_BIT,
  TRIGGER_CHECK_INTERVAL_TICKS,
  TRIPWIRE_MAX_LENGTH,
} from '../constants/redstone';
import { BlockPositionTracker } from '../world/BlockPositionTracker';
import { unpackPos } from '../world/posKey';
import type { World } from '../world/World';

/** 触发器需要的外部信息。 */
export interface TriggerHost {
  readonly world: World;
  /** 逐个访问玩家与生物的位置，回调返回 true 表示"找到了、可以停"。 */
  someEntityAt(visit: (x: number, y: number, z: number) => boolean): boolean;
}

/**
 * 靠"有没有人踩上去"驱动的红石元件：压力板、绊线、绊线钩。
 * 它们的位置由 BlockPositionTracker 维护（读档 / 世界生成放下的也算），每隔几 tick 统一检测一次。
 *
 * 绊线钩与 1.8.9 的差别：原版的钩要求线真的连到自己身上，这里按"从钩沿朝向直着数过去的连续绊线"判断，
 * 直线布线的效果一致，弯折的线不支持（原版也只能直线连）。
 */
export class TriggerSystem {
  private readonly plates: BlockPositionTracker;
  private readonly wires: BlockPositionTracker;
  private readonly hooks: BlockPositionTracker;
  private readonly posOut = [0, 0, 0];
  private tickCount = 0;

  constructor(private readonly host: TriggerHost) {
    this.plates = new BlockPositionTracker(host.world, BlockId.STONE_PRESSURE_PLATE);
    this.wires = new BlockPositionTracker(host.world, BlockId.TRIPWIRE);
    this.hooks = new BlockPositionTracker(host.world, BlockId.TRIPWIRE_HOOK);
  }

  /** 每游戏 tick 调用一次。 */
  tick(): void {
    this.tickCount++;
    if (this.tickCount % TRIGGER_CHECK_INTERVAL_TICKS !== 0) {
      return;
    }
    if (this.plates.size > 0) {
      this.updateByOccupancy(this.plates, BlockId.STONE_PRESSURE_PLATE);
    }
    if (this.wires.size > 0) {
      this.updateByOccupancy(this.wires, BlockId.TRIPWIRE);
    }
    if (this.hooks.size > 0) {
      this.updateHooks();
    }
  }

  /** 踩上去就通电的那一类（压力板 / 绊线）。 */
  private updateByOccupancy(positions: BlockPositionTracker, id: number): void {
    // setBlock 会触发变更事件回写集合，先拷一份再遍历
    for (const key of [...positions.positions]) {
      unpackPos(key, this.posOut);
      const [x, y, z] = this.posOut;
      this.setPowered(id, x, y, z, this.isOccupied(x, y, z));
    }
  }

  /**
   * 这一格里有没有玩家 / 生物。
   * @returns 站在格子中心 PRESSURE_PLATE_RANGE 半径内、且脚高在这一层就算
   */
  private isOccupied(x: number, y: number, z: number): boolean {
    const cx = x + 0.5;
    const cz = z + 0.5;
    return this.host.someEntityAt(
      (ex, ey, ez) =>
        Math.abs(ex - cx) <= PRESSURE_PLATE_RANGE && Math.abs(ez - cz) <= PRESSURE_PLATE_RANGE && Math.abs(ey - y) < 1,
    );
  }

  /** 每个钩：沿朝向数过去的连续绊线里有通电的，钩就通电。 */
  private updateHooks(): void {
    for (const key of [...this.hooks.positions]) {
      unpackPos(key, this.posOut);
      const [x, y, z] = this.posOut;
      this.setPowered(BlockId.TRIPWIRE_HOOK, x, y, z, this.isLineTriggered(x, y, z));
    }
  }

  private isLineTriggered(x: number, y: number, z: number): boolean {
    const world = this.host.world;
    // 钩朝向的反方向就是线延伸出去的方向（钩背靠墙、面朝线）
    const [fx, fz] = FACINGS[world.getMeta(x, y, z) & (FACINGS.length - 1)];
    for (let i = 1; i <= TRIPWIRE_MAX_LENGTH; i++) {
      const nx = x + fx * i;
      const nz = z + fz * i;
      if (world.getBlock(nx, y, nz) !== BlockId.TRIPWIRE) {
        return false;
      }
      if ((world.getMeta(nx, y, nz) & REDSTONE_POWERED_BIT) !== 0) {
        return true;
      }
    }
    return false;
  }

  private setPowered(id: number, x: number, y: number, z: number, powered: boolean): void {
    const world = this.host.world;
    const meta = world.getMeta(x, y, z);
    if (((meta & REDSTONE_POWERED_BIT) !== 0) === powered) {
      return;
    }
    world.setBlock(x, y, z, id, powered ? meta | REDSTONE_POWERED_BIT : meta & ~REDSTONE_POWERED_BIT);
  }
}
