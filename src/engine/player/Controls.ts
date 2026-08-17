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
/**
 * 滚轮累计到多少像素才切一格快捷栏。
 * 触控板一次两指滑动会连发几十个小 delta 事件，逐个响应会在一瞬间来回切好几格并连带重建手持模型。
 */
const WHEEL_SLOT_STEP_PIXELS = 40;
/** deltaMode 为"行"时每行折算的像素数（浏览器惯例）。 */
const WHEEL_LINE_PIXELS = 16;
/** 每次滚轮切格后至少间隔多久才允许再切（毫秒），把惯性滚动压成可控的节奏。 */
const WHEEL_SLOT_COOLDOWN_MS = 60;
/**
 * 单个 mousemove 事件允许的最大位移（像素）。
 * 高回报率鼠标（1000Hz 以上）在指针锁定下，Chromium 偶尔会吐出一个几千像素的错误 movementX/Y，
 * 视角瞬间甩一圈又甩回来，看起来就是闪屏。正常操作里一个事件（≤ 8ms）不可能有这么大位移，直接丢弃。
 */
const MAX_LOOK_DELTA_PIXELS = 400;

/** 处理键鼠与触屏输入、指针锁定。 */
/** 事件目标是不是文本输入框（打字时游戏按键要让路）。 */
function isTextInput(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

export class Controls {
  private keys = new Set<string>();
  private mouseButtons = new Set<number>();
  yaw = 0;
  pitch = 0;
  private locked = false;
  /** 浏览器不支持 unadjustedMovement 时记住，之后直接走普通锁定。 */
  private isUnadjustedMovementUnsupported = false;
  private virtualForward = 0;
  private virtualStrafe = 0;
  private wheelAccum = 0;
  private lastWheelSwitch = 0;
  private handlers: { type: string; target: EventTarget; fn: EventListener }[] = [];
  /** 一次性事件回调。 */
  onKeyDown: ((code: string, ctrlKey: boolean) => void) | null = null;
  onMouseDown: ((button: number) => void) | null = null;
  onMouseUp: ((button: number) => void) | null = null;
  /** 滚轮切快捷栏：direction 为 +1（下一格）或 -1（上一格）。 */
  onWheel: ((direction: number) => void) | null = null;
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
      // 铁砧改名等文本框里打字时不当作游戏按键
      if (isTextInput(e.target)) {
        return;
      }
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
      const isSpike = Math.abs(e.movementX) > MAX_LOOK_DELTA_PIXELS || Math.abs(e.movementY) > MAX_LOOK_DELTA_PIXELS;
      if (isSpike) {
        return;
      }
      this.lookByPixels(e.movementX, e.movementY, 'mouse');
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
        this.handleWheel(e);
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

  /** 滚轮切快捷栏：累计位移过阈值才切一格，并做最小间隔限流。 */
  private handleWheel(e: WheelEvent): void {
    const delta = e.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? e.deltaY : e.deltaY * WHEEL_LINE_PIXELS;
    // 反向滚动时清掉之前的累计，避免"往回一点点"被旧方向吃掉
    if (Math.sign(delta) !== Math.sign(this.wheelAccum)) {
      this.wheelAccum = 0;
    }
    this.wheelAccum += delta;
    if (Math.abs(this.wheelAccum) < WHEEL_SLOT_STEP_PIXELS) {
      return;
    }
    const now = performance.now();
    if (now - this.lastWheelSwitch < WHEEL_SLOT_COOLDOWN_MS) {
      return;
    }
    this.lastWheelSwitch = now;
    const dir = Math.sign(this.wheelAccum);
    this.wheelAccum = 0;
    this.onWheel?.(dir);
  }

  /**
   * 按像素位移转动视角；灵敏度由当前设置决定，鼠标与触屏共用这一条路径。
   * @param dx 水平像素位移（向右为正）
   * @param dy 垂直像素位移（向下为正）
   * @param source 输入来源，决定用哪个灵敏度
   */
  lookByPixels(dx: number, dy: number, source: 'mouse' | 'touch'): void {
    const sensitivity = source === 'mouse' ? this.settings.mouseSensitivity : this.settings.touchLookSensitivity;
    this.yaw -= dx * sensitivity;
    this.pitch -= dy * sensitivity;
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch));
  }

  /** 触屏按钮：按下/抬起虚拟按键（与真实键盘走同一条处理链）。 */
  setVirtualKey(code: string, down: boolean): void {
    if (!down) {
      this.keys.delete(code);
      return;
    }
    if (this.keys.has(code)) {
      return;
    }
    this.keys.add(code);
    this.onKeyDown?.(code, false);
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

  /**
   * 请求指针锁定。
   * 优先要"未经系统加速的原始位移"（unadjustedMovement），高回报率鼠标下位移更平滑；
   * 浏览器不支持时退回普通锁定。
   */
  requestLock(): void {
    if (this.locked) {
      return;
    }
    if (this.isUnadjustedMovementUnsupported) {
      this.requestPlainLock();
      return;
    }
    try {
      const result = this.element.requestPointerLock({ unadjustedMovement: true }) as unknown;
      if (result instanceof Promise) {
        result.catch((err: unknown) => {
          // 只有"不支持该选项"才退回普通锁定；用户取消之类的拒绝保持未锁定即可
          if (err instanceof DOMException && err.name === 'NotSupportedError') {
            this.isUnadjustedMovementUnsupported = true;
            this.requestPlainLock();
          }
        });
      }
    } catch {
      this.isUnadjustedMovementUnsupported = true;
      this.requestPlainLock();
    }
  }

  /** 不带选项的普通指针锁定（老浏览器 / 不支持原始位移时的退路）。 */
  private requestPlainLock(): void {
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
