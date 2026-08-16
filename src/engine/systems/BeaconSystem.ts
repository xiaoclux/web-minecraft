/**
 * 信标：脚下的矿物金字塔越大等级越高，能选的效果越多、作用范围越远。
 * 与 1.8.9 一致：金字塔用铁 / 金 / 钻石 / 绿宝石块搭，1~4 级；信标上方必须能看到天空。
 */

import { BlockId } from '../blocks/BlockRegistry';
import { WORLD_SIZE_Y } from '../constants/world';
import { EffectId } from '../entities/effects';
import type { World } from '../world/World';

/** 金字塔最高等级。 */
export const BEACON_MAX_LEVEL = 4;
/** 每级的作用半径（1.8.9：10 + level*10）。 */
const BEACON_BASE_RANGE = 10;
const BEACON_RANGE_PER_LEVEL = 10;
/** 效果持续时间：每次刷新给这么多 tick（信标每秒刷新一次）。 */
export const BEACON_EFFECT_TICKS = 200;
/** 能用来搭金字塔的方块。 */
const PYRAMID_BLOCKS: ReadonlySet<number> = new Set<number>([
  BlockId.IRON_BLOCK,
  BlockId.GOLD_BLOCK,
  BlockId.DIAMOND_BLOCK,
]);

/** 信标能给的效果与需要的最低等级。 */
export interface BeaconOption {
  effect: EffectId;
  label: string;
  minLevel: number;
}

export const BEACON_OPTIONS: readonly BeaconOption[] = [
  { effect: EffectId.SPEED, label: '迅捷', minLevel: 1 },
  { effect: EffectId.JUMP_BOOST, label: '跳跃提升', minLevel: 2 },
  { effect: EffectId.FIRE_RESISTANCE, label: '抗火', minLevel: 3 },
  { effect: EffectId.STRENGTH, label: '力量', minLevel: 3 },
  { effect: EffectId.REGENERATION, label: '生命恢复', minLevel: 4 },
];

/**
 * 信标的金字塔等级：逐层往下检查 (2n+1)² 的方块层，全是矿物块才算这一级。
 * @returns 0~4，0 表示没有有效金字塔
 */
export function beaconLevel(world: World, x: number, y: number, z: number): number {
  let level = 0;
  for (let i = 1; i <= BEACON_MAX_LEVEL; i++) {
    const layerY = y - i;
    if (layerY < 0 || !isFullLayer(world, x, layerY, z, i)) {
      break;
    }
    level = i;
  }
  return level;
}

/** 某一层是否被矿物块铺满。 */
function isFullLayer(world: World, x: number, y: number, z: number, radius: number): boolean {
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (!PYRAMID_BLOCKS.has(world.getBlock(x + dx, y, z + dz))) {
        return false;
      }
    }
  }
  return true;
}

/** 信标上方是否通天（中间不能有不透明方块）。 */
export function hasSkyAccess(world: World, x: number, y: number, z: number): boolean {
  for (let ty = y + 1; ty < WORLD_SIZE_Y; ty++) {
    const id = world.getBlock(x, ty, z);
    if (id !== BlockId.AIR && id !== BlockId.GLASS) {
      return false;
    }
  }
  return true;
}

/** 某个等级的作用半径。 */
export function beaconRange(level: number): number {
  return BEACON_BASE_RANGE + level * BEACON_RANGE_PER_LEVEL;
}

/** 该等级下可选的效果。 */
export function beaconOptionsFor(level: number): BeaconOption[] {
  return BEACON_OPTIONS.filter((option) => option.minLevel <= level);
}
