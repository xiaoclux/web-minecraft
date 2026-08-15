import { ITEM_DESPAWN_TICKS, ITEM_DROP_SIZE, ITEM_PICKUP_DELAY_TICKS, ITEM_PICKUP_RANGE } from '../constants/game';
import { canMerge, maxStackOf, type ItemStack } from '../items/ItemStack';
import { Entity, type EntitySaveData } from './Entity';
import type { EntityContext } from './EntityContext';

/** 掉落物。 */
export class ItemDropEntity extends Entity {
  readonly type = 'item';
  pickupDelay = ITEM_PICKUP_DELAY_TICKS;

  constructor(
    public stack: ItemStack,
    id?: number,
  ) {
    super(id);
    this.width = ITEM_DROP_SIZE;
    this.height = ITEM_DROP_SIZE;
  }

  override move(ctx: EntityContext, dt: number): void {
    super.move(ctx, dt);
    this.applyHorizontalFriction(dt);
    if (this.inWater) {
      this.vy += 6 * dt;
    }
  }

  override tick(ctx: EntityContext): void {
    super.tick(ctx);
    if (this.pickupDelay > 0) {
      this.pickupDelay--;
    }
    if (this.age > ITEM_DESPAWN_TICKS) {
      this.isDead = true;
      return;
    }
    if (this.pickupDelay === 0 && !ctx.player.isDead) {
      const player = ctx.player;
      const dx = player.x - this.x;
      const dy = player.y + player.height / 2 - this.y;
      const dz = player.z - this.z;
      const range = ITEM_PICKUP_RANGE;
      if (dx * dx + dy * dy + dz * dz < range * range) {
        const remaining = player.inventory.add(this.stack);
        if (remaining < this.stack.count) {
          ctx.playSound('pickup', this.x, this.y, this.z);
          player.onPickup(this.stack.id, this.stack.count - remaining);
        }
        if (remaining === 0) {
          this.isDead = true;
        } else {
          this.stack = { ...this.stack, count: remaining };
        }
      }
    }
  }

  /** 尝试与附近同类掉落物合并。 */
  tryMerge(other: ItemDropEntity): boolean {
    if (other === this || other.isDead || !canMerge(this.stack, other.stack)) {
      return false;
    }
    const max = maxStackOf(this.stack.id);
    if (this.stack.count + other.stack.count > max) {
      return false;
    }
    this.stack = { ...this.stack, count: this.stack.count + other.stack.count };
    other.isDead = true;
    return true;
  }

  /** 序列化。 */
  serialize(): EntitySaveData {
    return { ...this.serializeBase(), stack: this.stack, pickupDelay: this.pickupDelay };
  }

  /** 反序列化。 */
  static deserialize(data: EntitySaveData): ItemDropEntity {
    const stack = data.stack as ItemStack;
    const e = new ItemDropEntity({ ...stack }, data.id);
    e.setPosition(data.x, data.y, data.z);
    e.age = data.age;
    return e;
  }
}
