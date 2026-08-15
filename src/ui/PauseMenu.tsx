import { useState } from 'react';
import type { Game } from '../engine/Game';
import { GAME_MODE_LABELS } from '../engine/constants/game';

interface PauseMenuProps {
  game: Game;
}

const MIN_RENDER_DISTANCE = 3;
const MAX_RENDER_DISTANCE = 16;

/** 暂停菜单。 */
export function PauseMenu({ game }: PauseMenuProps) {
  const [distance, setDistance] = useState(game.currentRenderDistance);
  const [isSaving, setIsSaving] = useState(false);
  const handleSave = async (): Promise<void> => {
    setIsSaving(true);
    try {
      await game.save();
    } catch {
      // Game.save 内已 toast 提示
    } finally {
      setIsSaving(false);
    }
  };
  const handleExit = (): void => {
    void game.saveAndExit();
  };
  return (
    <div className="overlay center">
      <div className="panel menu-panel">
        <h2>游戏暂停</h2>
        <p className="muted">
          {game.meta.name} · {GAME_MODE_LABELS[game.meta.mode]} · 种子 {game.meta.seed}
        </p>
        <button className="menu-button" onClick={() => game.resume()}>
          回到游戏
        </button>
        <label className="slider-row">
          渲染距离：{distance} 区块
          <input
            type="range"
            min={MIN_RENDER_DISTANCE}
            max={MAX_RENDER_DISTANCE}
            value={distance}
            onChange={(e) => {
              const v = Number(e.target.value);
              setDistance(v);
              game.setRenderDistance(v);
            }}
          />
        </label>
        <button className="menu-button" onClick={() => void handleSave()} disabled={isSaving}>
          {isSaving ? '保存中…' : '保存游戏'}
        </button>
        <button className="menu-button danger" onClick={handleExit}>
          保存并退出到主菜单
        </button>
        <div className="help">
          <p>WASD 移动 · 空格 跳跃 · Shift 潜行 · Ctrl 疾跑</p>
          <p>左键 挖掘/攻击 · 右键 放置/使用 · 滚轮/数字键 切换物品</p>
          <p>E 背包 · Q 丢弃 · F3 调试 · 创造模式双击空格飞行</p>
        </div>
      </div>
    </div>
  );
}
