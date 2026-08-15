import { memo, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { Game } from '../engine/Game';
import { KEY_ESCAPE, MOUSE_LEFT, MOUSE_RIGHT } from '../engine/constants/keys';
import {
  TOUCH_JOYSTICK_DEADZONE,
  TOUCH_JOYSTICK_RADIUS_PX,
  TOUCH_TAP_MOVE_PX,
  TOUCH_TAP_MS,
} from '../engine/constants/ui';
import { settingsStore } from '../engine/settings/Settings';
import { useStore } from './useGameStore';

interface TouchControlsProps {
  game: Game;
}

/** 拖动中的指针：起点、上一次位置与按下时刻。 */
interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startAt: number;
}

function beginDrag(e: ReactPointerEvent<HTMLElement>): DragState {
  e.currentTarget.setPointerCapture(e.pointerId);
  return {
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    lastX: e.clientX,
    lastY: e.clientY,
    startAt: performance.now(),
  };
}

/** 事件是否属于正在跟踪的那根手指。 */
function isTracked(state: DragState | null, e: ReactPointerEvent<HTMLElement>): state is DragState {
  return state !== null && state.pointerId === e.pointerId;
}

/** 触屏视角区：拖动转视角，轻点等于右键（放置 / 使用）。 */
function LookArea({ game }: TouchControlsProps) {
  const drag = useRef<DragState | null>(null);
  const onDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    drag.current = beginDrag(e);
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const s = drag.current;
    if (!isTracked(s, e)) {
      return;
    }
    game.lookBy(e.clientX - s.lastX, e.clientY - s.lastY);
    s.lastX = e.clientX;
    s.lastY = e.clientY;
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const s = drag.current;
    if (!isTracked(s, e)) {
      return;
    }
    drag.current = null;
    const moved = Math.hypot(s.lastX - s.startX, s.lastY - s.startY);
    if (moved < TOUCH_TAP_MOVE_PX && performance.now() - s.startAt < TOUCH_TAP_MS) {
      game.setMouseInput(MOUSE_RIGHT, true);
      game.setMouseInput(MOUSE_RIGHT, false);
    }
  };
  return (
    <div
      className="touch-look"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    />
  );
}

/** 左下虚拟摇杆。摇杆头位置直接写样式，避免每次 pointermove 触发重渲染。 */
function Joystick({ game }: TouchControlsProps) {
  const drag = useRef<DragState | null>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const moveKnob = (x: number, y: number): void => {
    const knob = knobRef.current;
    if (knob) {
      knob.style.transform = `translate(${x}px, ${y}px)`;
    }
  };
  const onDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    drag.current = beginDrag(e);
    const rect = e.currentTarget.getBoundingClientRect();
    drag.current.startX = rect.left + rect.width / 2;
    drag.current.startY = rect.top + rect.height / 2;
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const s = drag.current;
    if (!isTracked(s, e)) {
      return;
    }
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    const distance = Math.hypot(dx, dy);
    // ratio 把位移限制在摇杆半径内；magnitude 即归一化后的模长，用于死区判定
    const ratio = distance > TOUCH_JOYSTICK_RADIUS_PX ? TOUCH_JOYSTICK_RADIUS_PX / distance : 1;
    moveKnob(dx * ratio, dy * ratio);
    const magnitude = Math.min(distance, TOUCH_JOYSTICK_RADIUS_PX) / TOUCH_JOYSTICK_RADIUS_PX;
    if (magnitude < TOUCH_JOYSTICK_DEADZONE) {
      game.setMoveInput(0, 0);
      return;
    }
    game.setMoveInput((-dy * ratio) / TOUCH_JOYSTICK_RADIUS_PX, (dx * ratio) / TOUCH_JOYSTICK_RADIUS_PX);
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!isTracked(drag.current, e)) {
      return;
    }
    drag.current = null;
    moveKnob(0, 0);
    game.setMoveInput(0, 0);
  };
  return (
    <div
      className="touch-joystick"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <div className="touch-joystick-knob" ref={knobRef} />
    </div>
  );
}

/** 触屏按钮：按下与抬起各回调一次（轻点类按钮忽略抬起即可）。 */
function TouchButton({
  className,
  label,
  onPress,
}: {
  className?: string;
  label: ReactNode;
  onPress: (down: boolean) => void;
}) {
  const onDown = (e: ReactPointerEvent<HTMLButtonElement>): void => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    onPress(true);
  };
  return (
    <button
      className={`touch-button${className ? ` ${className}` : ''}`}
      onPointerDown={onDown}
      onPointerUp={() => onPress(false)}
      onPointerCancel={() => onPress(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}

/**
 * 触屏操作层：摇杆 + 动作按钮（基岩版布局）。
 * memo 隔断引擎每 tick 的 store 更新——这层 UI 只依赖设置，不需要跟着游戏状态重渲染。
 */
export const TouchControls = memo(function TouchControls({ game }: TouchControlsProps) {
  const settings = useStore(settingsStore);
  /** 持续型按钮：按住即按键按下。 */
  const holdKey = (code: string) => (down: boolean) => game.setKeyInput(code, down);
  /** 轻点型按钮：按下的瞬间完成一次按下 + 抬起。 */
  const tapKey = (code: string) => (down: boolean) => {
    if (down) {
      game.setKeyInput(code, true);
      game.setKeyInput(code, false);
    }
  };
  return (
    <div className="touch-controls">
      <LookArea game={game} />
      <div className="touch-top">
        <TouchButton label="背包" onPress={tapKey(settings.keys.inventory)} />
        <TouchButton label="丢弃" onPress={tapKey(settings.keys.drop)} />
        <TouchButton label="暂停" onPress={tapKey(KEY_ESCAPE)} />
      </div>
      <Joystick game={game} />
      <div className="touch-actions">
        <TouchButton className="wide" label="挖掘" onPress={(down) => game.setMouseInput(MOUSE_LEFT, down)} />
        <TouchButton label="跳跃" onPress={holdKey(settings.keys.jump)} />
        <TouchButton label="潜行" onPress={holdKey(settings.keys.sneak)} />
      </div>
    </div>
  );
});
