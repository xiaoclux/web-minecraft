import { WATER_FALLING_META, WATER_MAX_LEVEL } from '../constants/fluids';

/** 水面高度（方块内 0..1）：源约 0.89，越浅越低；下落水或上方有水时为满高。 */
export function waterHeight(meta: number, aboveIsWater: boolean): number {
  if (aboveIsWater || meta === WATER_FALLING_META) {
    return 1;
  }
  return 1 - (meta + 1) / (WATER_MAX_LEVEL + 2);
}
