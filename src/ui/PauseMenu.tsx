import { useState } from 'react';
import type { Game } from '../engine/Game';
import { Screen } from '../engine/events/GameState';
import { GAME_MODE_LABELS } from '../engine/constants/game';
import { settingsStore } from '../engine/settings/Settings';
import { keyLabel } from './keyLabels';
import { SettingsPanel } from './SettingsPanel';
import { SliderRow } from './SliderRow';
import { useStore } from './useGameStore';

interface PauseMenuProps {
  game: Game;
}

const MIN_RENDER_DISTANCE = 3;
const MAX_RENDER_DISTANCE = 16;

/** 暂停菜单。 */
export function PauseMenu({ game }: PauseMenuProps) {
  const settings = useStore(settingsStore);
  const [showSettings, setShowSettings] = useState(false);
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
  if (showSettings) {
    return <SettingsPanel onClose={() => setShowSettings(false)} />;
  }
  const key = (action: keyof typeof settings.keys): string => keyLabel(settings.keys[action]);
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
        <SliderRow
          label="渲染距离"
          min={MIN_RENDER_DISTANCE}
          max={MAX_RENDER_DISTANCE}
          value={distance}
          display={`${distance} 区块`}
          onChange={(v) => {
            setDistance(v);
            game.setRenderDistance(v);
          }}
        />
        <button className="menu-button" onClick={() => setShowSettings(true)}>
          设置
        </button>
        <button className="menu-button" onClick={() => game.openScreen(Screen.STATS)}>
          成就与统计
        </button>
        <button className="menu-button" onClick={() => void handleSave()} disabled={isSaving}>
          {isSaving ? '保存中…' : '保存游戏'}
        </button>
        <button className="menu-button danger" onClick={handleExit}>
          保存并退出到主菜单
        </button>
        {game.isTouch ? (
          <div className="help">
            <p>左下摇杆 移动 · 拖动屏幕 转视角 · 轻点 放置/使用</p>
            <p>右下按钮 挖掘 / 跳跃 / 潜行 · 点快捷栏 切换物品</p>
            <p>顶部按钮 背包 / 丢弃 / 暂停 · 背包内长按格子 = 右键</p>
          </div>
        ) : (
          <div className="help">
            <p>
              {key('forward')}
              {key('left')}
              {key('back')}
              {key('right')} 移动 · {key('jump')} 跳跃 · {key('sneak')} 潜行 · {key('sprint')} 疾跑
            </p>
            <p>左键 挖掘/攻击 · 右键 放置/使用 · 滚轮/数字键 切换物品</p>
            <p>
              {key('inventory')} 背包 · {key('drop')} 丢弃 · {key('debug')} 调试 · 创造模式双击{key('jump')}飞行
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
