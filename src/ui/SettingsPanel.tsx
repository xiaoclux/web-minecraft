import { useEffect, useState } from 'react';
import {
  MAX_VOLUME,
  MAX_MOUSE_SENSITIVITY,
  MAX_TOUCH_LOOK_SENSITIVITY,
  MIN_MOUSE_SENSITIVITY,
  MIN_TOUCH_LOOK_SENSITIVITY,
  MOUSE_SENSITIVITY_STEP,
  TOUCH_LOOK_SENSITIVITY_STEP,
  TOUCH_MEDIA_QUERY,
} from '../engine/constants/ui';
import {
  BINDING_ACTIONS,
  bindKey,
  resetSettings,
  settingsStore,
  updateSettings,
  type BindingAction,
} from '../engine/settings/Settings';
import { BINDING_LABELS, keyLabel } from './keyLabels';
import { SliderRow } from './SliderRow';
import { useMediaQuery } from './useMediaQuery';
import { useStore } from './useGameStore';

interface SettingsPanelProps {
  onClose: () => void;
}

/** 灵敏度滑块显示成 0~100 的整数，避免暴露弧度小数。 */
/** 音量滑杆步长。 */
const VOLUME_STEP = 0.05;

function percent(value: number, min: number, max: number): number {
  return Math.round(((value - min) / (max - min)) * 100);
}

/** 设置面板：按键绑定、灵敏度、触屏按钮开关。主菜单与暂停菜单共用。 */
export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const settings = useStore(settingsStore);
  const [capturing, setCapturing] = useState<BindingAction | null>(null);
  const isTouch = useMediaQuery(TOUCH_MEDIA_QUERY);

  useEffect(() => {
    if (!capturing) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      e.preventDefault();
      if (e.code !== 'Escape') {
        bindKey(capturing, e.code);
      }
      setCapturing(null);
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [capturing]);

  return (
    <div className="overlay center">
      <div className="panel menu-panel settings-panel">
        <h2>设置</h2>
        <div className="key-bindings">
          {BINDING_ACTIONS.map((action) => (
            <div className="key-row" key={action}>
              <span>{BINDING_LABELS[action]}</span>
              <button
                className={`key-button${capturing === action ? ' capturing' : ''}`}
                onClick={() => setCapturing(action)}
              >
                {capturing === action ? '请按键…' : keyLabel(settings.keys[action])}
              </button>
            </div>
          ))}
        </div>
        <p className="muted">Esc（菜单）、数字键 1-9（快捷栏）与鼠标左/中/右键固定不可修改。</p>
        <SliderRow
          label="总音量"
          min={0}
          max={MAX_VOLUME}
          step={VOLUME_STEP}
          value={settings.masterVolume}
          display={`${Math.round((settings.masterVolume / MAX_VOLUME) * 100)}%`}
          onChange={(masterVolume) => updateSettings({ masterVolume })}
        />
        <SliderRow
          label="音效音量"
          min={0}
          max={MAX_VOLUME}
          step={VOLUME_STEP}
          value={settings.sfxVolume}
          display={`${Math.round((settings.sfxVolume / MAX_VOLUME) * 100)}%`}
          onChange={(sfxVolume) => updateSettings({ sfxVolume })}
        />
        <SliderRow
          label="音乐音量"
          min={0}
          max={MAX_VOLUME}
          step={VOLUME_STEP}
          value={settings.musicVolume}
          display={`${Math.round((settings.musicVolume / MAX_VOLUME) * 100)}%`}
          onChange={(musicVolume) => updateSettings({ musicVolume })}
        />
        <SliderRow
          label="鼠标灵敏度"
          min={MIN_MOUSE_SENSITIVITY}
          max={MAX_MOUSE_SENSITIVITY}
          step={MOUSE_SENSITIVITY_STEP}
          value={settings.mouseSensitivity}
          display={percent(settings.mouseSensitivity, MIN_MOUSE_SENSITIVITY, MAX_MOUSE_SENSITIVITY)}
          onChange={(mouseSensitivity) => updateSettings({ mouseSensitivity })}
        />
        {isTouch && (
          <>
            <SliderRow
              label="触屏视角灵敏度"
              min={MIN_TOUCH_LOOK_SENSITIVITY}
              max={MAX_TOUCH_LOOK_SENSITIVITY}
              step={TOUCH_LOOK_SENSITIVITY_STEP}
              value={settings.touchLookSensitivity}
              display={percent(settings.touchLookSensitivity, MIN_TOUCH_LOOK_SENSITIVITY, MAX_TOUCH_LOOK_SENSITIVITY)}
              onChange={(touchLookSensitivity) => updateSettings({ touchLookSensitivity })}
            />
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.touchControlsEnabled}
                onChange={(e) => updateSettings({ touchControlsEnabled: e.target.checked })}
              />
              显示触屏按钮
            </label>
          </>
        )}
        <button className="menu-button" onClick={() => resetSettings()}>
          恢复默认
        </button>
        <button className="menu-button" onClick={onClose}>
          返回
        </button>
      </div>
    </div>
  );
}
