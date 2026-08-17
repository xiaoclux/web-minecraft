import { BlockId } from '../blocks/BlockRegistry';
import { FACINGS, FACING_MASK } from '../blocks/blockShapes';
import {
  PRESSURE_PLATE_RANGE,
  REDSTONE_POWERED_BIT,
  TRIGGER_CHECK_INTERVAL_TICKS,
  TRIPWIRE_MAX_LENGTH,
} from '../constants/redstone';
import { BlockPositionTracker } from '../world/BlockPositionTracker';
import { packPos, unpackPos } from '../world/posKey';
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
  /** 本轮检测里"有人踩着"的格子（packPos），每轮清空复用。 */
  private readonly occupied = new Set<number>();
  /** 遍历时的位置拷贝（setBlock 会触发变更事件回写集合，不能边遍历边改）。 */
  private readonly scratchKeys: number[] = [];
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
    if (this.plates.size > 0 || this.wires.size > 0) {
      this.collectOccupiedCells();
      this.refresh(this.plates, BlockId.STONE_PRESSURE_PLATE, this.isOccupied);
      this.refresh(this.wires, BlockId.TRIPWIRE, this.isOccupied);
    }
    this.refresh(this.hooks, BlockId.TRIPWIRE_HOOK, this.isLineTriggered);
  }

  /** 把 tracker 里每个方块的通电位刷成 isOn 的结果。 */
  private refresh(
    tracker: BlockPositionTracker,
    id: number,
    isOn: (x: number, y: number, z: number) => boolean,
  ): void {
    const keys = this.scratchKeys;
    keys.length = 0;
    for (const key of tracker.positions) {
      keys.push(key);
    }
    for (const key of keys) {
      unpackPos(key, this.posOut);
      const [x, y, z] = this.posOut;
      this.setPowered(id, x, y, z, isOn(x, y, z));
    }
  }

  /**
   * 一趟遍历玩家与生物，把每个实体"踩着"的格子记下来：
   * 水平方向离格子中心 PRESSURE_PLATE_RANGE 以内、脚高与格子同层就算。
   * 这样压力板再多也只遍历一次实体，而不是每块板扫一遍。
   */
  private collectOccupiedCells(): void {
    const occupied = this.occupied;
    occupied.clear();
    this.host.someEntityAt((ex, ey, ez) => {
      const minX = Math.ceil(ex - 0.5 - PRESSURE_PLATE_RANGE);
      const maxX = Math.floor(ex - 0.5 + PRESSURE_PLATE_RANGE);
      const minZ = Math.ceil(ez - 0.5 - PRESSURE_PLATE_RANGE);
      const maxZ = Math.floor(ez - 0.5 + PRESSURE_PLATE_RANGE);
      // |ey - y| < 1 的整数 y
      const minY = Math.floor(ey - 1) + 1;
      const maxY = Math.ceil(ey + 1) - 1;
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          for (let x = minX; x <= maxX; x++) {
            occupied.add(packPos(x, y, z));
          }
        }
      }
      return false;
    });
  }

  private readonly isOccupied = (x: number, y: number, z: number): boolean => this.occupied.has(packPos(x, y, z));

  /** 钩：沿朝向数过去的连续绊线里有通电的，钩就通电。 */
  private readonly isLineTriggered = (x: number, y: number, z: number): boolean => {
    const world = this.host.world;
    // 钩朝向的反方向就是线延伸出去的方向（钩背靠墙、面朝线）
    const [fx, fz] = FACINGS[world.getMeta(x, y, z) & FACING_MASK];
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
  };

  private setPowered(id: number, x: number, y: number, z: number, powered: boolean): void {
    setPoweredBit(this.host.world, x, y, z, id, powered);
  }
}

/** 只在通电位与目标不一致时改写方块的通电位（陷阱箱、压力板、绊线钩共用）。 */
export function setPoweredBit(world: World, x: number, y: number, z: number, id: number, powered: boolean): void {
  const meta = world.getMeta(x, y, z);
  if (((meta & REDSTONE_POWERED_BIT) !== 0) === powered) {
    return;
  }
  world.setBlock(x, y, z, id, powered ? meta | REDSTONE_POWERED_BIT : meta & ~REDSTONE_POWERED_BIT);
}
