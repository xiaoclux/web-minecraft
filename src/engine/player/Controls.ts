import {
  KEY_BACK,
  KEY_FORWARD,
  KEY_JUMP,
  KEY_LEFT,
  KEY_RIGHT,
  KEY_SNEAK,
  KEY_SPRINT,
  MOUSE_SENSITIVITY,
} from '../constants/keys';

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

/** 处理键鼠输入与指针锁定。 */
export class Controls {
  private keys = new Set<string>();
  private mouseButtons = new Set<number>();
  yaw = 0;
  pitch = 0;
  private locked = false;
  private handlers: { type: string; target: EventTarget; fn: EventListener }[] = [];
  /** 一次性事件回调。 */
  onKeyDown: ((code: string, event: KeyboardEvent) => void) | null = null;
  onMouseDown: ((button: number) => void) | null = null;
  onMouseUp: ((button: number) => void) | null = null;
  onWheel: ((deltaY: number) => void) | null = null;
  onLockChange: ((locked: boolean) => void) | null = null;

  constructor(private readonly element: HTMLElement) {}

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
        this.onKeyDown?.(e.code, e);
      }
      this.keys.add(e.code);
    });
    on(document, 'keyup', (e) => this.keys.delete(e.code));
    on(document, 'mousemove', (e) => {
      if (!this.locked) {
        return;
      }
      this.yaw -= e.movementX * MOUSE_SENSITIVITY;
      this.pitch -= e.movementY * MOUSE_SENSITIVITY;
      const limit = Math.PI / 2 - 0.001;
      this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
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
        this.keys.clear();
        this.mouseButtons.clear();
      }
      this.onLockChange?.(this.locked);
    });
    on(document, 'contextmenu', (e) => e.preventDefault());
    on(window, 'blur', () => {
      this.keys.clear();
      this.mouseButtons.clear();
    });
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

  isKeyDown(code: string): boolean {
    return this.keys.has(code);
  }

  isMouseDown(button: number): boolean {
    return this.mouseButtons.has(button);
  }

  /** 读取移动输入。 */
  read(): InputState {
    let forward = 0;
    let strafe = 0;
    if (this.keys.has(KEY_FORWARD)) {
      forward += 1;
    }
    if (this.keys.has(KEY_BACK)) {
      forward -= 1;
    }
    if (this.keys.has(KEY_LEFT)) {
      strafe -= 1;
    }
    if (this.keys.has(KEY_RIGHT)) {
      strafe += 1;
    }
    return {
      forward,
      strafe,
      jump: this.keys.has(KEY_JUMP),
      sneak: this.keys.has(KEY_SNEAK) || this.keys.has('ShiftRight'),
      sprint: this.keys.has(KEY_SPRINT) || this.keys.has('ControlRight'),
      leftMouse: this.mouseButtons.has(0),
      rightMouse: this.mouseButtons.has(2),
    };
  }
}
