import { BlockId } from '../blocks/BlockRegistry';
import {
  COMPARATOR_DELAY_TICKS,
  COMPARATOR_OUTPUT_MASK,
  COMPARATOR_OUTPUT_SHIFT,
  CONTAINER_SIGNAL_MAX,
} from '../constants/redstone';
import { maxStackOf } from '../items/ItemStack';
import { BlockPositionTracker } from '../world/BlockPositionTracker';
import type { BlockEntityStore } from '../world/BlockEntityStore';
import { unpackPos } from '../world/posKey';
import type { World } from '../world/World';
import { comparatorOutput } from './RedstoneSystem';

/** 比较器需要的外部信息。 */
export interface ComparatorHost {
  readonly world: World;
  readonly blockEntities: BlockEntityStore;
}

/**
 * 比较器：把算出来的输出强度写进 meta 高 4 位，红石那边通过 sourcePower 读走。
 *
 * 为什么要按固定间隔整体重算：比较器还要读背后容器的充盈度，而往箱子里放东西不会产生方块变更事件，
 * 只靠红石的"方块变了才重算"抓不到。比较器数量很少，每 2 tick 扫一遍的代价可以忽略。
 */
export class ComparatorSystem {
  private readonly comparators: BlockPositionTracker;
  private readonly posOut = [0, 0, 0];
  private tickCount = 0;

  constructor(private readonly host: ComparatorHost) {
    this.comparators = new BlockPositionTracker(host.world, BlockId.COMPARATOR);
  }

  /** 已知的比较器数量（测试用）。 */
  get count(): number {
    return this.comparators.size;
  }

  /** 每游戏 tick 调用一次。 */
  tick(): void {
    this.tickCount++;
    if (this.tickCount % COMPARATOR_DELAY_TICKS !== 0 || this.comparators.size === 0) {
      return;
    }
    // 写 meta 会触发方块变更事件回写集合，先拷一份再遍历
    for (const key of [...this.comparators.positions]) {
      unpackPos(key, this.posOut);
      this.update(this.posOut[0], this.posOut[1], this.posOut[2]);
    }
  }

  /** 重算某个比较器的输出并写回 meta（只在变化时写，免得和红石重算互相触发）。 */
  update(x: number, y: number, z: number): void {
    const world = this.host.world;
    const meta = world.getMeta(x, y, z);
    const level = comparatorOutput(world, x, y, z, (bx, by, bz) => this.containerSignalAt(bx, by, bz));
    if (level === ((meta >> COMPARATOR_OUTPUT_SHIFT) & COMPARATOR_OUTPUT_MASK)) {
      return;
    }
    const next = (meta & ~(COMPARATOR_OUTPUT_MASK << COMPARATOR_OUTPUT_SHIFT)) | (level << COMPARATOR_OUTPUT_SHIFT);
    world.setBlock(x, y, z, BlockId.COMPARATOR, next);
  }

  /**
   * 容器充盈度对应的红石强度：空容器 0，只要有东西至少 1，装满 15（1.8.9 规则）。
   * @returns 该位置不是容器时返回 0
   */
  private containerSignalAt(x: number, y: number, z: number): number {
    const entity = this.host.blockEntities.get(x, y, z);
    const items = entity && 'items' in entity ? entity.items : null;
    if (!items || items.length === 0) {
      return 0;
    }
    let fullness = 0;
    for (const stack of items) {
      if (stack) {
        fullness += stack.count / maxStackOf(stack.id);
      }
    }
    if (fullness === 0) {
      return 0;
    }
    return Math.min(CONTAINER_SIGNAL_MAX, 1 + Math.floor((fullness / items.length) * (CONTAINER_SIGNAL_MAX - 1)));
  }
}
