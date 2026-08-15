import type { BindingAction } from '../engine/settings/Settings';

/** 动作的中文名（设置界面与帮助文本展示用）。 */
export const BINDING_LABELS: Record<BindingAction, string> = {
  forward: '前进',
  back: '后退',
  left: '左移',
  right: '右移',
  jump: '跳跃 / 上浮',
  sneak: '潜行 / 下降',
  sprint: '疾跑',
  inventory: '背包',
  drop: '丢弃物品',
  debug: '调试信息',
};

/** 特殊按键码的可读名称；字母/数字键按前缀截断即可。 */
const KEY_CODE_LABELS: Record<string, string> = {
  Space: '空格',
  ShiftLeft: '左 Shift',
  ShiftRight: '右 Shift',
  ControlLeft: '左 Ctrl',
  ControlRight: '右 Ctrl',
  AltLeft: '左 Alt',
  AltRight: '右 Alt',
  Tab: 'Tab',
  Enter: '回车',
  Backspace: '退格',
  CapsLock: 'Caps',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

/** 按键码转为界面可读名称。 */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) {
    return code.slice(3);
  }
  if (code.startsWith('Digit')) {
    return code.slice(5);
  }
  return KEY_CODE_LABELS[code] ?? code;
}
