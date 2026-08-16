import type { MobSoundKind } from './mobSounds';
import type { Difficulty } from '../constants/game';
import type { ItemStack } from '../items/ItemStack';
import type { World } from '../world/World';
import type { Entity } from './Entity';
import type { LivingEntity } from './LivingEntity';
import type { Player } from '../player/Player';

/** 实体在 tick 中可访问的游戏能力。由 Game 实现。 */
export interface EntityContext {
  readonly world: World;
  readonly player: Player;
  readonly difficulty: Difficulty;
  /** 当前维度 id（决定刷什么生物）。 */
  readonly dimensionId: string;
  readonly tick: number;
  /** 生物是否会主动攻击玩家（创造/和平下为 false）。 */
  readonly canMobsTargetPlayer: boolean;
  isDaytime(): boolean;
  /** 位置的综合亮度 0~15（天空光按昼夜衰减）。 */
  lightLevelAt(x: number, y: number, z: number): number;
  spawnEntity(entity: Entity): void;
  dropItem(x: number, y: number, z: number, stack: ItemStack, spread?: number): void;
  explode(x: number, y: number, z: number, radius: number, sourceId: number): void;
  /** 在某个方块位置点一团火（小火球落地）。 */
  igniteAt(x: number, y: number, z: number): void;
  hurtPlayer(amount: number, source: Entity | null): void;
  onEntityKilled(entity: Entity, byPlayer: boolean): void;
  random(): number;
  playSound(name: string, x: number, y: number, z: number): void;
  /** 播放生物叫声（闲置 / 受伤 / 死亡）。 */
  playMobSound(mobType: string, kind: MobSoundKind, x: number, y: number, z: number, isBaby?: boolean): void;
  /** 某点附近（中心距离在 radius 内）的活体实体，含玩家。 */
  livingEntitiesNear(x: number, y: number, z: number, radius: number): LivingEntity[];
  /** 该方块位置的水流方向（单位向量；静水为 0）。 */
  waterFlowAt(x: number, y: number, z: number): { x: number; z: number };
}
