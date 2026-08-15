import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
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

/** 摇杆状态：按下的指针 id 与起点。 */
interface JoystickState {
  pointerId: number;
  originX: number;
  originY: number;
}

/** 视角拖动状态。 */
interface LookState {
  pointerId: number;
  lastX: number;
  lastY: number;
  startX: number;
  startY: number;
  startAt: number;
  moved: number;
}

/** 触屏视角区：拖动转视角，轻点等于右键（放置 / 使用）。 */
function LookArea({ game }: TouchControlsProps) {
  const state = useRef<LookState | null>(null);
  const onDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    e.currentTarget.setPointerCapture(e.pointerId);
    state.current = {
      pointerId: e.pointerId,
      lastX: e.clientX,
      lastY: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      startAt: performance.now(),
      moved: 0,
    };
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const s = state.current;
    if (!s || s.pointerId !== e.pointerId) {
      return;
    }
    game.lookBy(e.clientX - s.lastX, e.clientY - s.lastY);
    s.lastX = e.clientX;
    s.lastY = e.clientY;
    s.moved = Math.hypot(e.clientX - s.startX, e.clientY - s.startY);
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const s = state.current;
    if (!s || s.pointerId !== e.pointerId) {
      return;
    }
    state.current = null;
    const isTap = s.moved < TOUCH_TAP_MOVE_PX && performance.now() - s.startAt < TOUCH_TAP_MS;
    if (isTap) {
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

/** 左下虚拟摇杆。 */
function Joystick({ game }: TouchControlsProps) {
  const state = useRef<JoystickState | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const onDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    state.current = {
      pointerId: e.pointerId,
      originX: rect.left + rect.width / 2,
      originY: rect.top + rect.height / 2,
    };
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const s = state.current;
    if (!s || s.pointerId !== e.pointerId) {
      return;
    }
    const dx = e.clientX - s.originX;
    const dy = e.clientY - s.originY;
    const distance = Math.hypot(dx, dy);
    const scale = distance > TOUCH_JOYSTICK_RADIUS_PX ? TOUCH_JOYSTICK_RADIUS_PX / distance : 1;
    const nx = (dx * scale) / TOUCH_JOYSTICK_RADIUS_PX;
    const ny = (dy * scale) / TOUCH_JOYSTICK_RADIUS_PX;
    setKnob({ x: dx * scale, y: dy * scale });
    const magnitude = Math.hypot(nx, ny);
    if (magnitude < TOUCH_JOYSTICK_DEADZONE) {
      game.setMoveInput(0, 0);
      return;
    }
    game.setMoveInput(-ny, nx);
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (state.current?.pointerId !== e.pointerId) {
      return;
    }
    state.current = null;
    setKnob({ x: 0, y: 0 });
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
      <div className="touch-joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

/** 触屏按钮：按住生效（onHold(true/false)）或轻点一次（onTap）。 */
function TouchButton({
  className,
  label,
  onHold,
  onTap,
}: {
  className?: string;
  label: ReactNode;
  onHold?: (down: boolean) => void;
  onTap?: () => void;
}) {
  const onDown = (e: ReactPointerEvent<HTMLButtonElement>): void => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    onHold?.(true);
    onTap?.();
  };
  const onUp = (): void => onHold?.(false);
  return (
    <button
      className={`touch-button${className ? ` ${className}` : ''}`}
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}

/** 触屏操作层：摇杆 + 动作按钮（基岩版布局）。 */
export function TouchControls({ game }: TouchControlsProps) {
  const settings = useStore(settingsStore);
  /** 轻点类按钮：按下后立即抬起，避免虚拟按键一直留在按下状态。 */
  const tapKey = (code: string): void => {
    game.pressKey(code);
    game.releaseKey(code);
  };
  return (
    <div className="touch-controls">
      <LookArea game={game} />
      <div className="touch-top">
        <TouchButton label="背包" onTap={() => tapKey(settings.keys.inventory)} />
        <TouchButton label="丢弃" onTap={() => tapKey(settings.keys.drop)} />
        <TouchButton label="暂停" onTap={() => tapKey(KEY_ESCAPE)} />
      </div>
      <Joystick game={game} />
      <div className="touch-actions">
        <TouchButton className="wide" label="挖掘" onHold={(down) => game.setMouseInput(MOUSE_LEFT, down)} />
        <TouchButton
          label="跳跃"
          onHold={(down) => (down ? game.pressKey(settings.keys.jump) : game.releaseKey(settings.keys.jump))}
        />
        <TouchButton
          label="潜行"
          onHold={(down) => (down ? game.pressKey(settings.keys.sneak) : game.releaseKey(settings.keys.sneak))}
        />
      </div>
    </div>
  );
}
