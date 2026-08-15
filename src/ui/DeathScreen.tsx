import type { Game } from '../engine/Game';
import type { GameUiState } from '../engine/events/GameState';

interface DeathScreenProps {
  game: Game;
  state: GameUiState;
}

/** 死亡界面。 */
export function DeathScreen({ game, state }: DeathScreenProps) {
  return (
    <div className="overlay center death">
      <div className="death-content">
        <h1>{state.isHardcoreDeath ? '游戏结束！' : '你死了！'}</h1>
        {state.deathMessage && <p>{state.deathMessage}</p>}
        {state.isHardcoreDeath ? (
          <>
            <p className="muted">极限模式：世界将被删除。</p>
            <button className="menu-button" onClick={() => void game.deleteAndExit()}>
              删除世界并返回主菜单
            </button>
          </>
        ) : (
          <>
            <button className="menu-button" onClick={() => game.respawn()}>
              重生
            </button>
            <button className="menu-button" onClick={() => void game.saveAndExit()}>
              返回主菜单
            </button>
          </>
        )}
      </div>
    </div>
  );
}
