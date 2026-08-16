import { describe, expect, it } from 'vitest';
import { Weather, WeatherSystem } from '../src/engine/systems/WeatherSystem';

/** 跑 n 个 tick。 */
function run(w: WeatherSystem, n: number): void {
  for (let i = 0; i < n; i++) {
    w.tick();
  }
}

describe('天气', () => {
  it('从晴天开始，久了会下雨', () => {
    const w = new WeatherSystem(() => 0);
    expect(w.weather).toBe(Weather.CLEAR);
    expect(w.isRaining).toBe(false);
    run(w, 12001);
    expect(w.weather).toBe(Weather.RAIN);
    expect(w.isRaining).toBe(true);
  });

  it('雨后按概率转雷雨或转晴', () => {
    const thunder = new WeatherSystem(() => 0);
    thunder.set(Weather.RAIN, 1);
    thunder.tick();
    expect(thunder.weather).toBe(Weather.THUNDER);
    expect(thunder.isThundering).toBe(true);

    const clear = new WeatherSystem(() => 0.99);
    clear.set(Weather.RAIN, 1);
    clear.tick();
    expect(clear.weather).toBe(Weather.CLEAR);
  });

  it('雷雨结束后转晴', () => {
    const w = new WeatherSystem(() => 0);
    w.set(Weather.THUNDER, 1);
    w.tick();
    expect(w.weather).toBe(Weather.CLEAR);
  });

  it('雨量在切换时平滑过渡', () => {
    const w = new WeatherSystem(() => 0);
    w.set(Weather.CLEAR);
    expect(w.rainLevel).toBe(0);
    w.set(Weather.RAIN);
    expect(w.rainLevel).toBe(1);
    // 手动切回晴天后逐渐降到 0
    w.set(Weather.RAIN, 1);
    w.tick();
    expect(w.weather).toBe(Weather.THUNDER);
    w.set(Weather.CLEAR, 10000);
    expect(w.rainLevel).toBe(0);
  });

  it('天气随存档往返', () => {
    const w = new WeatherSystem(() => 0.5);
    w.set(Weather.THUNDER, 1234);
    const data = w.serialize();
    const restored = new WeatherSystem(() => 0.5);
    restored.load(data);
    expect(restored.weather).toBe(Weather.THUNDER);
    expect(restored.serialize().ticks).toBe(1234);
  });
});
