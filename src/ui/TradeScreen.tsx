import type { Game } from '../engine/Game';
import type { GameUiState } from '../engine/events/GameState';
import { getItem } from '../engine/items/ItemRegistry';
import { ItemIcon } from './ItemIcon';

interface TradeScreenProps {
  game: Game;
  state: GameUiState;
}

/** 一笔交易付得起吗（背包里的数量够不够）。 */
function canAfford(game: Game, give: readonly { id: string; count: number }[]): boolean {
  return give.every((need) => game.player.inventory.countOf(need.id) >= need.count);
}

/** 村民交易界面：左边是要付的东西，右边是换到的东西，点一下成交。 */
export function TradeScreen({ game, state }: TradeScreenProps) {
  // inventoryVersion 变化（成交也会 bump）时重新算"付不付得起"
  void state.inventoryVersion;
  return (
    <div className="overlay center">
      <div className="panel menu-panel trade-panel">
        <h2>交易</h2>
        <div className="trade-list">
          {game.villagerTrades.map((offer, i) => {
            const affordable = offer.uses > 0 && canAfford(game, offer.give);
            return (
              <button
                key={`${offer.receive.id}-${i}`}
                className={`trade-row${affordable ? '' : ' disabled'}`}
                disabled={!affordable}
                onClick={() => game.tradeWith(i)}
              >
                <span className="trade-side">
                  {offer.give.map((give) => (
                    <span key={give.id} className="trade-item">
                      <ItemIcon stack={{ id: give.id, count: give.count }} size={28} />
                      <span>{getItem(give.id)?.label ?? give.id}</span>
                    </span>
                  ))}
                </span>
                <span className="trade-arrow">→</span>
                <span className="trade-side">
                  <span className="trade-item">
                    <ItemIcon stack={{ id: offer.receive.id, count: offer.receive.count }} size={28} />
                    <span>{getItem(offer.receive.id)?.label ?? offer.receive.id}</span>
                  </span>
                </span>
                <span className="trade-uses">{offer.uses > 0 ? `剩 ${offer.uses} 次` : '卖光了'}</span>
              </button>
            );
          })}
        </div>
        <button className="menu-button" onClick={() => game.closeScreen()}>
          离开
        </button>
      </div>
    </div>
  );
}
