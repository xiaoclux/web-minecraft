import { WORLD_SIZE_Y } from '../constants/world';

/** 位置打包为数字键时 x/z 的偏移与跨度（±2^21，够无限世界用）。 */
const POS_OFFSET = 1 << 21;
const POS_SPAN = 1 << 22;

/** 方块坐标 → 数字键（可用作 Set/Map 的键，避免字符串分配）。 */
export function packPos(x: number, y: number, z: number): number {
  return ((x + POS_OFFSET) * POS_SPAN + (z + POS_OFFSET)) * WORLD_SIZE_Y + y;
}

/** 数字键 → 方块坐标，写入 out（长度 ≥3）以免每次分配。 */
export function unpackPos(key: number, out: number[]): void {
  const y = key % WORLD_SIZE_Y;
  const rest = (key - y) / WORLD_SIZE_Y;
  const z = (rest % POS_SPAN) - POS_OFFSET;
  const x = (rest - (z + POS_OFFSET)) / POS_SPAN - POS_OFFSET;
  out[0] = x;
  out[1] = y;
  out[2] = z;
}
