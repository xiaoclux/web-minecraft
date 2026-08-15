import type { Difficulty } from '../constants/game';
import type { ItemStack } from '../items/ItemStack';
import type { World } from '../world/World';
import type { Entity } from './Entity';
import type { Player } from '../player/Player';

/** 实体在 tick 中可访问的游戏能力。由 Game 实现。 */
export interface EntityContext {
  readonly world: World;
  readonly player: Player;
  readonly difficulty: Difficulty;
  readonly tick: number;
  /** 生物是否会主动攻击玩家（创造/和平下为 false）。 */
  readonly canMobsTargetPlayer: boolean;
  isDaytime(): boolean;
  /** 位置的综合亮度 0~15（天空光按昼夜衰减）。 */
  lightLevelAt(x: number, y: number, z: number): number;
  spawnEntity(entity: Entity): void;
  dropItem(x: number, y: number, z: number, stack: ItemStack, spread?: number): void;
  explode(x: number, y: number, z: number, radius: number, sourceId: number): void;
  hurtPlayer(amount: number, source: Entity | null): void;
  onEntityKilled(entity: Entity, byPlayer: boolean): void;
  random(): number;
  playSound(name: string, x: number, y: number, z: number): void;
}
