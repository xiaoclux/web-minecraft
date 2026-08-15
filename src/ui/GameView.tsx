import { useEffect, useRef, useState } from 'react';
import { Game } from '../engine/Game';
import { Screen } from '../engine/events/GameState';
import type { SaveManager, WorldMeta, WorldSave } from '../engine/save/SaveManager';
import { DeathScreen } from './DeathScreen';
import { DebugOverlay } from './DebugOverlay';
import { Hud } from './Hud';
import { InventoryScreen } from './InventoryScreen';
import { PauseMenu } from './PauseMenu';
import { useStore } from './useGameStore';

interface GameViewProps {
  meta: WorldMeta;
  save: WorldSave | null;
  saveManager: SaveManager;
  onExit: () => void;
}

/** 让浏览器先绘制"加载中"再执行同步的世界生成。 */
const START_DELAY_MS = 30;

/** 游戏画面容器：创建 Game 实例并挂载 UI 覆盖层。 */
export function GameView({ meta, save, saveManager, onExit }: GameViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    let instance: Game | null = null;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) {
        return;
      }
      try {
        instance = new Game({ meta, save, canvas, saveManager, onExit });
        instance.start();
        if (import.meta.env.DEV) {
          // 开发模式下暴露实例，便于在控制台/自动化脚本中调试
          (window as Window & { __mcGame?: Game }).__mcGame = instance;
        }
        setGame(instance);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }, START_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      instance?.dispose();
    };
  }, [meta, save, saveManager, onExit]);

  return (
    <div className="game-root">
      <canvas ref={canvasRef} className="game-canvas" onClick={() => game?.requestPointerLock()} />
      {error && (
        <div className="overlay center">
          <div className="panel menu-panel">
            <h2>启动失败</h2>
            <p>{error}</p>
            <button className="menu-button" onClick={onExit}>
              返回主菜单
            </button>
          </div>
        </div>
      )}
      {!game && !error && (
        <div className="overlay center loading">
          <div className="loading-text">生成世界中…</div>
        </div>
      )}
      {game && <GameOverlays game={game} />}
    </div>
  );
}

function GameOverlays({ game }: { game: Game }) {
  const state = useStore(game.store);
  const showInventory =
    state.screen === Screen.INVENTORY || state.screen === Screen.CRAFTING || state.screen === Screen.FURNACE;
  return (
    <>
      {state.isUnderwater && <div className="underwater-tint" />}
      <Hud game={game} state={state} />
      {state.debug && <DebugOverlay info={state.debug} />}
      {showInventory && <InventoryScreen game={game} state={state} />}
      {state.screen === Screen.PAUSE && <PauseMenu game={game} />}
      {state.screen === Screen.DEATH && <DeathScreen game={game} state={state} />}
      {!game.isTouch && !state.isPointerLocked && state.screen === Screen.NONE && (
        <div className="overlay center click-hint" onClick={() => game.requestPointerLock()}>
          <div className="loading-text">点击画面开始</div>
        </div>
      )}
    </>
  );
}
