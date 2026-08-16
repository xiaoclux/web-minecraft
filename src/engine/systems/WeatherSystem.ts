/** 天气状态。 */
export const Weather = {
  CLEAR: 'clear',
  RAIN: 'rain',
  THUNDER: 'thunder',
} as const;
export type Weather = (typeof Weather)[keyof typeof Weather];

/** 各状态持续时长的范围（tick）。晴天久、雨天短，雷雨更短。 */
const DURATIONS: Record<Weather, { min: number; max: number }> = {
  clear: { min: 12000, max: 36000 },
  rain: { min: 6000, max: 18000 },
  thunder: { min: 3000, max: 9000 },
};
/** 下雨结束后转成雷雨的概率。 */
const THUNDER_CHANCE = 0.25;
/** 雨量每 tick 的变化速度（约 5 秒完成过渡）。 */
const RAIN_FADE_PER_TICK = 1 / 100;

/** 存档里的天气状态。 */
export interface WeatherSaveData {
  weather: Weather;
  ticks: number;
}

/**
 * 天气：晴 → 雨 →（有几率）雷雨 → 晴，各自持续一段随机时间。
 * 只影响主世界；下雨会让地表变暗、浇灭火、加速作物生长。
 */
export class WeatherSystem {
  private current: Weather = Weather.CLEAR;
  private remaining: number;
  /** 0~1 的过渡强度，用来让天空与雨量平滑变化。 */
  private intensity = 0;

  constructor(private readonly random: () => number) {
    this.remaining = this.rollDuration(Weather.CLEAR);
  }

  /** 当前天气。 */
  get weather(): Weather {
    return this.current;
  }

  /** 是否在下雨（雷雨也算）。 */
  get isRaining(): boolean {
    return this.current !== Weather.CLEAR;
  }

  /** 是否雷雨。 */
  get isThundering(): boolean {
    return this.current === Weather.THUNDER;
  }

  /** 雨的强度 0~1（切换时平滑过渡，供渲染用）。 */
  get rainLevel(): number {
    return this.intensity;
  }

  /** 每 tick 推进。 */
  tick(): void {
    const target = this.isRaining ? 1 : 0;
    this.intensity +=
      Math.sign(target - this.intensity) * Math.min(RAIN_FADE_PER_TICK, Math.abs(target - this.intensity));
    this.remaining--;
    if (this.remaining > 0) {
      return;
    }
    this.current = this.nextWeather();
    this.remaining = this.rollDuration(this.current);
  }

  /** 直接设置天气（指令 / 读档用）。 */
  set(weather: Weather, ticks?: number): void {
    this.current = weather;
    this.remaining = ticks ?? this.rollDuration(weather);
    this.intensity = weather === Weather.CLEAR ? 0 : 1;
  }

  serialize(): WeatherSaveData {
    return { weather: this.current, ticks: this.remaining };
  }

  load(data: WeatherSaveData | undefined): void {
    if (!data) {
      return;
    }
    this.set(data.weather, data.ticks);
  }

  private nextWeather(): Weather {
    if (this.current === Weather.CLEAR) {
      return Weather.RAIN;
    }
    if (this.current === Weather.RAIN) {
      return this.random() < THUNDER_CHANCE ? Weather.THUNDER : Weather.CLEAR;
    }
    return Weather.CLEAR;
  }

  private rollDuration(weather: Weather): number {
    const { min, max } = DURATIONS[weather];
    return min + Math.floor(this.random() * (max - min));
  }
}
