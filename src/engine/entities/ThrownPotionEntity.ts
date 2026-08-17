import type { ItemStack } from '../items/ItemStack';
import { ThrownEntity } from './ThrownEntity';

/** 扔出去的喷溅药水：碎在哪里由 Game 结算范围效果。 */
export class ThrownPotionEntity extends ThrownEntity {
  readonly type = 'thrown_potion';

  constructor(
    /** 扔出的药水物品（渲染图标与结算效果都用它）。 */
    readonly stack: ItemStack,
    throwerId: number,
    id?: number,
  ) {
    super(throwerId, id);
  }
}
