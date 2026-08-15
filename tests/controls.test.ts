import { describe, expect, it, vi } from 'vitest';
import { Controls } from '../src/engine/player/Controls';
import { MOUSE_LEFT } from '../src/engine/constants/keys';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/engine/settings/Settings';

function createControls(settings = DEFAULT_SETTINGS): Controls {
  return new Controls({} as unknown as HTMLElement, settings);
}

describe('Controls 虚拟输入', () => {
  it('虚拟按键写入按键状态并触发一次回调', () => {
    const controls = createControls();
    const onKeyDown = vi.fn();
    controls.onKeyDown = onKeyDown;
    controls.pressVirtualKey(DEFAULT_SETTINGS.keys.jump);
    controls.pressVirtualKey(DEFAULT_SETTINGS.keys.jump);
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(controls.read().jump).toBe(true);
    controls.releaseVirtualKey(DEFAULT_SETTINGS.keys.jump);
    expect(controls.read().jump).toBe(false);
  });

  it('虚拟鼠标按下/抬起各触发一次回调', () => {
    const controls = createControls();
    const down = vi.fn();
    const up = vi.fn();
    controls.onMouseDown = down;
    controls.onMouseUp = up;
    controls.setVirtualMouse(MOUSE_LEFT, true);
    controls.setVirtualMouse(MOUSE_LEFT, true);
    expect(down).toHaveBeenCalledTimes(1);
    expect(controls.read().leftMouse).toBe(true);
    controls.setVirtualMouse(MOUSE_LEFT, false);
    expect(up).toHaveBeenCalledTimes(1);
    expect(controls.read().leftMouse).toBe(false);
  });

  it('摇杆非零时覆盖键盘方向', () => {
    const controls = createControls();
    controls.pressVirtualKey(DEFAULT_SETTINGS.keys.forward);
    expect(controls.read()).toMatchObject({ forward: 1, strafe: 0 });
    controls.setVirtualMove(-0.5, 0.8);
    expect(controls.read()).toMatchObject({ forward: -0.5, strafe: 0.8 });
    controls.setVirtualMove(0, 0);
    expect(controls.read().forward).toBe(1);
  });

  it('read 使用当前设置里的键位', () => {
    const controls = createControls(normalizeSettings({ keys: { forward: 'ArrowUp' } }));
    controls.pressVirtualKey('ArrowUp');
    expect(controls.read().forward).toBe(1);
    controls.releaseVirtualKey('ArrowUp');
    controls.pressVirtualKey('KeyW');
    expect(controls.read().forward).toBe(0);
  });

  it('俯仰角限制在 ±90° 内', () => {
    const controls = createControls();
    controls.look(0, 100);
    expect(controls.pitch).toBeGreaterThan(-Math.PI / 2);
    controls.look(0, -200);
    expect(controls.pitch).toBeLessThan(Math.PI / 2);
  });
});
