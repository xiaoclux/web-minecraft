/**
 * 村民职业与交易表。
 *
 * 取自 1.8.9 的一档交易（等级 1），价格取区间中值，省掉了"交易次数用完锁死再刷新"的机制：
 * 这里每笔交易可以做有限次数，用完这一笔就不能再做了。
 */

/** 一笔交易：给出 give，换回 receive。 */
export interface TradeOffer {
  /** 玩家要付出的（1~2 样）。 */
  give: readonly { readonly id: string; readonly count: number }[];
  /** 玩家换到的。 */
  receive: { readonly id: string; readonly count: number };
  /** 这笔交易还能做几次。 */
  uses: number;
}

/** 村民职业。 */
export const VillagerProfession = {
  FARMER: 'farmer',
  LIBRARIAN: 'librarian',
  BLACKSMITH: 'blacksmith',
  BUTCHER: 'butcher',
} as const;
export type VillagerProfession = (typeof VillagerProfession)[keyof typeof VillagerProfession];

/** 每笔交易的默认可用次数。 */
const DEFAULT_USES = 8;

const trade = (
  give: readonly { id: string; count: number }[],
  receive: { id: string; count: number },
): TradeOffer => ({ give, receive, uses: DEFAULT_USES });

const EMERALD = (count: number): { id: string; count: number } => ({ id: 'emerald', count });

/** 各职业的交易表。 */
export const VILLAGER_TRADES: Record<VillagerProfession, readonly TradeOffer[]> = {
  farmer: [
    trade([{ id: 'wheat', count: 20 }], EMERALD(1)),
    trade([{ id: 'carrot', count: 22 }], EMERALD(1)),
    trade([{ id: 'potato', count: 24 }], EMERALD(1)),
    trade([EMERALD(1)], { id: 'bread', count: 3 }),
  ],
  librarian: [
    trade([{ id: 'paper', count: 24 }], EMERALD(1)),
    trade([EMERALD(1)], { id: 'book', count: 1 }),
    trade([EMERALD(9)], { id: 'enchanted_book', count: 1 }),
  ],
  blacksmith: [
    trade([{ id: 'coal', count: 16 }], EMERALD(1)),
    trade([EMERALD(7)], { id: 'iron_pickaxe', count: 1 }),
    trade([EMERALD(4)], { id: 'iron_sword', count: 1 }),
    trade([EMERALD(12)], { id: 'iron_chestplate', count: 1 }),
  ],
  butcher: [
    trade([{ id: 'porkchop', count: 14 }], EMERALD(1)),
    trade([{ id: 'beef', count: 14 }], EMERALD(1)),
    trade([EMERALD(1)], { id: 'cooked_porkchop', count: 5 }),
  ],
};

/** 所有职业（生成村民时随机挑一个）。 */
export const VILLAGER_PROFESSIONS: readonly VillagerProfession[] = Object.values(VillagerProfession);

/** 按职业造一份新的交易表：每个村民各有一份 uses 计数，give / receive 只读所以共享即可。 */
export function rollTrades(profession: VillagerProfession): TradeOffer[] {
  return VILLAGER_TRADES[profession].map((offer) => ({ ...offer }));
}
