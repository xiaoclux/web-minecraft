import type { EntityContext } from './EntityContext';
import type { LivingEntity } from './LivingEntity';

/** 找"被投掷物 / 箭砸中的生物"时的搜索半径：只要能覆盖最大生物的半宽就够。 */
const HIT_SEARCH_RADIUS = 2;

/**
 * 找出包围盒罩住点 (x, y, z) 的第一只活体（箭、雪球、药水共用的命中判定）。
 * @param ignoreId 发射者的实体 id：出手时投掷物就在他自己的包围盒里，不能算命中
 */
export function findLivingEntityAt(
  ctx: EntityContext,
  x: number,
  y: number,
  z: number,
  ignoreId: number,
): LivingEntity | null {
  for (const e of ctx.livingEntitiesNear(x, y, z, HIT_SEARCH_RADIUS)) {
    if (e.id === ignoreId || e.isDying) {
      continue;
    }
    if (e.box().containsPoint(x, y, z)) {
      return e;
    }
  }
  return null;
}
