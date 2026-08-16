import {
  KEY_BACK,
  KEY_DEBUG,
  KEY_DROP,
  KEY_FORWARD,
  KEY_INVENTORY,
  KEY_JUMP,
  KEY_LEFT,
  KEY_RIGHT,
  KEY_SNEAK,
  KEY_SPRINT,
} from '../constants/keys';
import {
  DEFAULT_MOUSE_SENSITIVITY,
  DEFAULT_TOUCH_LOOK_SENSITIVITY,
  MAX_MOUSE_SENSITIVITY,
  MAX_TOUCH_LOOK_SENSITIVITY,
  MIN_MOUSE_SENSITIVITY,
  MIN_TOUCH_LOOK_SENSITIVITY,
  DEFAULT_MASTER_VOLUME,
  DEFAULT_MUSIC_VOLUME,
  DEFAULT_SFX_VOLUME,
  MAX_VOLUME,
  SETTINGS_PERSIST_DEBOUNCE_MS,
  STORAGE_KEY_SETTINGS,
  TOUCH_MEDIA_QUERY,
} from '../constants/ui';
import { Store } from '../events/Store';

/** 可重新绑定的动作。Esc、数字键与鼠标键固定不可改。 */
export const BINDING_ACTIONS = [
  'forward',
  'back',
  'left',
  'right',
  'jump',
  'sneak',
  'sprint',
  'inventory',
  'drop',
  'debug',
] as const;
export type BindingAction = (typeof BINDING_ACTIONS)[number];

/** 玩家可配置项。 */
export interface GameSettings {
  /** 动作 → KeyboardEvent.code。 */
  keys: Record<BindingAction, string>;
  /** 鼠标视角灵敏度（每像素弧度）。 */
  mouseSensitivity: number;
  /** 触屏拖动视角灵敏度（每像素弧度）。 */
  touchLookSensitivity: number;
  /** 是否显示触屏按钮。 */
  touchControlsEnabled: boolean;
  /** 总音量 0~1。 */
  masterVolume: number;
  /** 音效音量 0~1。 */
  sfxVolume: number;
  /** 音乐音量 0~1。 */
  musicVolume: number;
}

/** 出厂默认设置。 */
export const DEFAULT_SETTINGS: GameSettings = {
  keys: {
    forward: KEY_FORWARD,
    back: KEY_BACK,
    left: KEY_LEFT,
    right: KEY_RIGHT,
    jump: KEY_JUMP,
    sneak: KEY_SNEAK,
    sprint: KEY_SPRINT,
    inventory: KEY_INVENTORY,
    drop: KEY_DROP,
    debug: KEY_DEBUG,
  },
  mouseSensitivity: DEFAULT_MOUSE_SENSITIVITY,
  touchLookSensitivity: DEFAULT_TOUCH_LOOK_SENSITIVITY,
  // 纯常量：是否真的显示触屏按钮 = 本项 && 当前是粗指针设备，设备判定只在使用点做一次
  touchControlsEnabled: true,
  masterVolume: DEFAULT_MASTER_VOLUME,
  sfxVolume: DEFAULT_SFX_VOLUME,
  musicVolume: DEFAULT_MUSIC_VOLUME,
};

/** 缓存 MediaQueryList，避免每次判定都新建对象。 */
const mediaQueryCache = new Map<string, MediaQueryList>();

/** 取（并缓存）媒体查询对象；无 window 时返回 null。 */
export function getMediaQuery(query: string): MediaQueryList | null {
  if (typeof window === 'undefined') {
    return null;
  }
  let mql = mediaQueryCache.get(query);
  if (!mql) {
    mql = window.matchMedia(query);
    mediaQueryCache.set(query, mql);
  }
  return mql;
}

/** 当前环境是否为触屏设备（粗指针）。 */
export function isTouchDevice(): boolean {
  return getMediaQuery(TOUCH_MEDIA_QUERY)?.matches ?? false;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/** 把任意来源的数据规整成合法设置（缺字段/非法值回落默认）。 */
export function normalizeSettings(raw: unknown): GameSettings {
  const source = (raw ?? {}) as Partial<GameSettings>;
  const rawKeys = (source.keys ?? {}) as Partial<Record<BindingAction, string>>;
  const keys = { ...DEFAULT_SETTINGS.keys };
  const used = new Set<string>();
  for (const action of BINDING_ACTIONS) {
    const code = rawKeys[action];
    if (typeof code === 'string' && code.length > 0 && !used.has(code)) {
      keys[action] = code;
    }
    used.add(keys[action]);
  }
  return {
    keys,
    mouseSensitivity: clamp(
      source.mouseSensitivity,
      MIN_MOUSE_SENSITIVITY,
      MAX_MOUSE_SENSITIVITY,
      DEFAULT_SETTINGS.mouseSensitivity,
    ),
    touchLookSensitivity: clamp(
      source.touchLookSensitivity,
      MIN_TOUCH_LOOK_SENSITIVITY,
      MAX_TOUCH_LOOK_SENSITIVITY,
      DEFAULT_SETTINGS.touchLookSensitivity,
    ),
    touchControlsEnabled:
      typeof source.touchControlsEnabled === 'boolean'
        ? source.touchControlsEnabled
        : DEFAULT_SETTINGS.touchControlsEnabled,
    masterVolume: clamp(source.masterVolume, 0, MAX_VOLUME, DEFAULT_SETTINGS.masterVolume),
    sfxVolume: clamp(source.sfxVolume, 0, MAX_VOLUME, DEFAULT_SETTINGS.sfxVolume),
    musicVolume: clamp(source.musicVolume, 0, MAX_VOLUME, DEFAULT_SETTINGS.musicVolume),
  };
}

function loadSettings(): GameSettings {
  if (typeof localStorage === 'undefined') {
    return normalizeSettings(null);
  }
  try {
    const text = localStorage.getItem(STORAGE_KEY_SETTINGS);
    return normalizeSettings(text ? JSON.parse(text) : null);
  } catch {
    // 存储不可用或数据损坏：回落默认设置，不影响进入游戏
    return normalizeSettings(null);
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

/** 防抖写盘：滑块拖动时每帧都会改设置，不必每次同步写 localStorage。 */
function persist(settings: GameSettings): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
  }
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    } catch {
      // 隐私模式 / 配额不足：设置仍在本次会话内生效
    }
  }, SETTINGS_PERSIST_DEBOUNCE_MS);
}

/** 全局设置 Store（UI 与引擎共享，改动即时生效）。 */
export const settingsStore = new Store<GameSettings>(loadSettings());

/** 更新设置并持久化。 */
export function updateSettings(patch: Partial<GameSettings>): void {
  settingsStore.patch(patch);
  persist(settingsStore.get());
}

/** 绑定按键；若该键已被其他动作占用则两者交换。 */
export function bindKey(action: BindingAction, code: string): void {
  const keys = { ...settingsStore.get().keys };
  const previous = keys[action];
  for (const other of BINDING_ACTIONS) {
    if (other !== action && keys[other] === code) {
      keys[other] = previous;
    }
  }
  keys[action] = code;
  updateSettings({ keys });
}

/** 恢复出厂设置。 */
export function resetSettings(): void {
  updateSettings(normalizeSettings(null));
}

/** 按键码反查动作；未绑定返回 null。 */
export function actionForCode(code: string, settings: GameSettings): BindingAction | null {
  for (const action of BINDING_ACTIONS) {
    if (settings.keys[action] === code) {
      return action;
    }
  }
  return null;
}

