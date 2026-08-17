import { DAY_LENGTH_TICKS } from '../constants/world';

/** 太阳高度（sin 值）到这个值以上算完全白天。 */
const FULL_DAYLIGHT_SUN_HEIGHT = 0.2;
/** 太阳高度低于这个值算完全黑夜（略低于地平线，留一点黄昏余晖）。 */
const DAWN_SUN_HEIGHT = -0.08;

/** 太阳高度（正弦值）：t=0 日出(东), 0.25 正午, 0.5 日落, 0.75 午夜。 */
export function sunHeightAt(timeTick: number): number {
  const t = (timeTick % DAY_LENGTH_TICKS) / DAY_LENGTH_TICKS;
  return Math.sin(t * Math.PI * 2);
}

/**
 * 某一时刻的日光系数 0~1：白天 1、夜里 0、黎明黄昏线性过渡。
 * 天空渲染与日光传感器共用同一条曲线，保证"看起来天黑了"和"传感器归零"同步。
 */
export function daylightAt(timeTick: number): number {
  const sunHeight = sunHeightAt(timeTick);
  const daylight = (sunHeight - DAWN_SUN_HEIGHT) / (FULL_DAYLIGHT_SUN_HEIGHT - DAWN_SUN_HEIGHT);
  return Math.min(1, Math.max(0, daylight));
}
