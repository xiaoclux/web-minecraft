import { BlockId, getBlock } from '../blocks/BlockRegistry';
import { packPos, unpackPos } from '../world/posKey';
import type { World } from '../world/World';

/** 放方块时可以直接顶掉的"软"方块（空气、水、草丛），也是重力方块能落进去的格子。 */
export const REPLACEABLE_BLOCKS: ReadonlySet<number> = new Set<number>([
  BlockId.AIR,
  BlockId.WATER,
  BlockId.TALL_GRASS,
]);

/**
 * 重力方块（沙子 / 沙砾）：订阅世界变更，凡是"重力方块出现在软方块上方"或
 * "重力方块脚下被掏空"都排队，下一 tick 让它一口气落到底。
 * 自己订阅而不是靠调用方逐处 push，这样活塞推、爆炸炸、客人隔着网络放的沙子都一样会掉。
 */
export class GravitySystem {
  private pending = new Set<number>();
  private readonly posOut = [0, 0, 0];
  private readonly unsubscribers: (() => void)[];

  constructor(private readonly world: World) {
    this.unsubscribers = [
      world.onBlockChange((x, y, z, _oldId, newId) => this.onChanged(x, y, z, newId)),
      world.onBatchChange((changes) => {
        for (const change of changes) {
          this.onChanged(change.x, change.y, change.z, change.newId);
        }
      }),
    ];
  }

  /** 排队待落的方块数（测试用）。 */
  get pendingCount(): number {
    return this.pending.size;
  }

  private onChanged(x: number, y: number, z: number, newId: number): void {
    if (getBlock(newId).hasGravity) {
      this.pending.add(packPos(x, y, z));
    }
    if (REPLACEABLE_BLOCKS.has(newId) && getBlock(this.world.getBlock(x, y + 1, z)).hasGravity) {
      this.pending.add(packPos(x, y + 1, z));
    }
  }

  /** 每游戏 tick 调用一次：让排队的重力方块下落，落完检查上面是否还有要跟着掉的。 */
  tick(): void {
    if (this.pending.size === 0) {
      return;
    }
    const batch = this.pending;
    // 下落本身会触发变更事件、往新集合里排队（链式下落）
    this.pending = new Set();
    const world = this.world;
    for (const key of batch) {
      unpackPos(key, this.posOut);
      const [x, y, z] = this.posOut;
      const id = world.getBlock(x, y, z);
      if (!getBlock(id).hasGravity) {
        continue;
      }
      let targetY = y;
      while (targetY - 1 >= 0 && REPLACEABLE_BLOCKS.has(world.getBlock(x, targetY - 1, z))) {
        targetY--;
      }
      if (targetY === y) {
        continue;
      }
      const meta = world.getMeta(x, y, z);
      world.setBlock(x, y, z, BlockId.AIR);
      world.setBlock(x, targetY, z, id, meta);
    }
  }

  /** 取消订阅。 */
  dispose(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers.length = 0;
    this.pending.clear();
  }
}
