import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_MOUSE_SENSITIVITY, MIN_MOUSE_SENSITIVITY } from '../src/engine/constants/ui';
import { keyLabel } from '../src/ui/keyLabels';
import {
  BINDING_ACTIONS,
  DEFAULT_SETTINGS,
  actionForCode,
  bindKey,
  normalizeSettings,
  resetSettings,
  settingsStore,
  updateSettings,
} from '../src/engine/settings/Settings';

describe('Settings', () => {
  beforeEach(() => {
    resetSettings();
  });

  it('默认设置包含全部动作且无重复按键', () => {
    const codes = BINDING_ACTIONS.map((a) => DEFAULT_SETTINGS.keys[a]);
    expect(codes).toHaveLength(BINDING_ACTIONS.length);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('缺字段与非法值回落默认', () => {
    const s = normalizeSettings({ keys: { forward: 'ArrowUp' }, mouseSensitivity: 'fast' });
    expect(s.keys.forward).toBe('ArrowUp');
    expect(s.keys.back).toBe(DEFAULT_SETTINGS.keys.back);
    expect(s.mouseSensitivity).toBe(DEFAULT_SETTINGS.mouseSensitivity);
  });

  it('灵敏度超出范围时钳位', () => {
    expect(normalizeSettings({ mouseSensitivity: 999 }).mouseSensitivity).toBe(MAX_MOUSE_SENSITIVITY);
    expect(normalizeSettings({ mouseSensitivity: 0 }).mouseSensitivity).toBe(MIN_MOUSE_SENSITIVITY);
  });

  it('重复按键只保留先出现的动作', () => {
    const s = normalizeSettings({ keys: { forward: 'KeyX', back: 'KeyX' } });
    expect(s.keys.forward).toBe('KeyX');
    expect(s.keys.back).toBe(DEFAULT_SETTINGS.keys.back);
  });

  it('绑定已占用的按键会与原动作交换', () => {
    bindKey('forward', DEFAULT_SETTINGS.keys.back);
    const keys = settingsStore.get().keys;
    expect(keys.forward).toBe(DEFAULT_SETTINGS.keys.back);
    expect(keys.back).toBe(DEFAULT_SETTINGS.keys.forward);
    expect(new Set(Object.values(keys)).size).toBe(BINDING_ACTIONS.length);
  });

  it('按键码可反查动作，未绑定返回 null', () => {
    bindKey('jump', 'KeyB');
    expect(actionForCode('KeyB', settingsStore.get())).toBe('jump');
    expect(actionForCode('F7', settingsStore.get())).toBeNull();
  });

  it('恢复默认可还原改动', () => {
    updateSettings({ mouseSensitivity: MAX_MOUSE_SENSITIVITY });
    bindKey('drop', 'KeyZ');
    resetSettings();
    expect(settingsStore.get()).toEqual(DEFAULT_SETTINGS);
  });

  it('按键码转为可读名称', () => {
    expect(keyLabel('KeyW')).toBe('W');
    expect(keyLabel('Space')).toBe('空格');
    expect(keyLabel('ArrowUp')).toBe('↑');
    expect(keyLabel('F3')).toBe('F3');
  });
});
