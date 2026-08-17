import { ThrownEntity } from './ThrownEntity';

/** 扔出去的雪球 / 鸡蛋：命中效果由 Game 按物品结算。 */
export class ThrownItemEntity extends ThrownEntity {
  readonly type = 'thrown_item';

  constructor(
    /** 扔的是什么（'snowball' / 'egg'），渲染与结算都看它。 */
    readonly itemId: string,
    throwerId: number,
    id?: number,
  ) {
    super(throwerId, id);
  }
}
