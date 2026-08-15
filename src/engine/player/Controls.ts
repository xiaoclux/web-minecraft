import { MOUSE_LEFT, MOUSE_RIGHT } from '../constants/keys';
import { DEFAULT_SETTINGS, type GameSettings } from '../settings/Settings';

/** 每帧输入快照。 */
export interface InputState {
  forward: number;
  strafe: number;
  jump: boolean;
  sneak: boolean;
  sprint: boolean;
  leftMouse: boolean;
  rightMouse: boolean;
}

/** 俯仰角上下限（略小于 90°，避免万向锁）。 */
const PITCH_LIMIT = Math.PI / 2 - 0.001;

/** 处理键鼠与触屏输入、指针锁定。 */
export class Controls {
  private keys = new Set<string>();
  private mouseButtons = new Set<number>();
  yaw = 0;
  pitch = 0;
  private locked = false;
  private virtualForward = 0;
  private virtualStrafe = 0;
  private handlers: { type: string; target: EventTarget; fn: EventListener }[] = [];
  /** 一次性事件回调。 */
  onKeyDown: ((code: string, ctrlKey: boolean) => void) | null = null;
  onMouseDown: ((button: number) => void) | null = null;
  onMouseUp: ((button: number) => void) | null = null;
  onWheel: ((deltaY: number) => void) | null = null;
  onLockChange: ((locked: boolean) => void) | null = null;

  constructor(
    private readonly element: HTMLElement,
    private settings: GameSettings = DEFAULT_SETTINGS,
  ) {}

  /** 应用新的设置（键位与灵敏度即时生效）。 */
  setSettings(settings: GameSettings): void {
    this.settings = settings;
  }

  /** 绑定事件。 */
  attach(): void {
    const on = <K extends keyof DocumentEventMap>(
      target: EventTarget,
      type: K,
      fn: (ev: DocumentEventMap[K]) => void,
    ): void => {
      const listener = fn as EventListener;
      target.addEventListener(type, listener);
      this.handlers.push({ type, target, fn: listener });
    };
    on(document, 'keydown', (e) => {
      if (e.code === 'F3' || e.code === 'Tab') {
        e.preventDefault();
      }
      if (!e.repeat) {
        this.onKeyDown?.(e.code, e.ctrlKey);
      }
      this.keys.add(e.code);
    });
    on(document, 'keyup', (e) => this.keys.delete(e.code));
    on(document, 'mousemove', (e) => {
      if (!this.locked) {
        return;
      }
      this.look(e.movementX * this.settings.mouseSensitivity, e.movementY * this.settings.mouseSensitivity);
    });
    on(document, 'mousedown', (e) => {
      if (!this.locked) {
        return;
      }
      this.mouseButtons.add(e.button);
      this.onMouseDown?.(e.button);
    });
    on(document, 'mouseup', (e) => {
      this.mouseButtons.delete(e.button);
      this.onMouseUp?.(e.button);
    });
    on(document, 'wheel', (e) => {
      if (this.locked) {
        this.onWheel?.(e.deltaY);
      }
    });
    on(document, 'pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.element;
      if (!this.locked) {
        this.clearInput();
      }
      this.onLockChange?.(this.locked);
    });
    on(document, 'contextmenu', (e) => e.preventDefault());
    on(window, 'blur', () => this.clearInput());
  }

  /**
   * 按给定弧度增量转动视角（鼠标与触屏共用）。
   * @param dYaw 水平增量（向右为正）
   * @param dPitch 垂直增量（向下为正）
   */
  look(dYaw: number, dPitch: number): void {
    this.yaw -= dYaw;
    this.pitch -= dPitch;
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch));
  }

  /** 触屏按钮：按下虚拟按键（与真实键盘走同一条处理链）。 */
  pressVirtualKey(code: string): void {
    if (this.keys.has(code)) {
      return;
    }
    this.keys.add(code);
    this.onKeyDown?.(code, false);
  }

  /** 触屏按钮：抬起虚拟按键。 */
  releaseVirtualKey(code: string): void {
    this.keys.delete(code);
  }

  /** 触屏按钮：按下/抬起虚拟鼠标键（0 左 / 2 右）。 */
  setVirtualMouse(button: number, down: boolean): void {
    if (down) {
      if (this.mouseButtons.has(button)) {
        return;
      }
      this.mouseButtons.add(button);
      this.onMouseDown?.(button);
      return;
    }
    if (this.mouseButtons.delete(button)) {
      this.onMouseUp?.(button);
    }
  }

  /** 触屏摇杆：设置移动输入（各分量 -1~1），全零表示松开。 */
  setVirtualMove(forward: number, strafe: number): void {
    this.virtualForward = forward;
    this.virtualStrafe = strafe;
  }

  /** 解绑事件。 */
  detach(): void {
    for (const h of this.handlers) {
      h.target.removeEventListener(h.type, h.fn);
    }
    this.handlers = [];
  }

  /** 请求指针锁定。 */
  requestLock(): void {
    if (!this.locked) {
      try {
        const result = this.element.requestPointerLock() as unknown;
        if (result instanceof Promise) {
          result.catch(() => {
            /* 用户取消或浏览器拒绝：保持未锁定状态即可 */
          });
        }
      } catch {
        // 某些浏览器在快速重复请求时抛错，忽略
      }
    }
  }

  /** 释放指针锁定。 */
  exitLock(): void {
    if (this.locked) {
      document.exitPointerLock();
    }
  }

  get isLocked(): boolean {
    return this.locked;
  }

  /** 清空所有输入（失焦 / 解除锁定）。 */
  private clearInput(): void {
    this.keys.clear();
    this.mouseButtons.clear();
    this.virtualForward = 0;
    this.virtualStrafe = 0;
  }

  isKeyDown(code: string): boolean {
    return this.keys.has(code);
  }

  isMouseDown(button: number): boolean {
    return this.mouseButtons.has(button);
  }

  /** 读取移动输入（键盘与触屏摇杆合并，摇杆非零时优先）。 */
  read(): InputState {
    const bind = this.settings.keys;
    let forward = 0;
    let strafe = 0;
    if (this.keys.has(bind.forward)) {
      forward += 1;
    }
    if (this.keys.has(bind.back)) {
      forward -= 1;
    }
    if (this.keys.has(bind.left)) {
      strafe -= 1;
    }
    if (this.keys.has(bind.right)) {
      strafe += 1;
    }
    if (this.virtualForward !== 0 || this.virtualStrafe !== 0) {
      forward = this.virtualForward;
      strafe = this.virtualStrafe;
    }
    return {
      forward,
      strafe,
      jump: this.keys.has(bind.jump),
      sneak: this.keys.has(bind.sneak),
      sprint: this.keys.has(bind.sprint),
      leftMouse: this.mouseButtons.has(MOUSE_LEFT),
      rightMouse: this.mouseButtons.has(MOUSE_RIGHT),
    };
  }
}
