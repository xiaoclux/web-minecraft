import { Difficulty, GameMode } from '../constants/game';
import type { PlayerRules } from '../player/Player';

/** 各游戏模式的规则。 */
export interface GameModeRules extends PlayerRules {
  mode: GameMode;
  /** 生物是否主动攻击。 */
  mobsHostile: boolean;
  /** 死亡后是否删档。 */
  deleteWorldOnDeath: boolean;
  /** 固定难度（极限=困难）。 */
  forcedDifficulty: Difficulty | null;
  reach: number;
}

const SURVIVAL_RULES: GameModeRules = {
  mode: GameMode.SURVIVAL,
  takesDamage: true,
  usesHunger: true,
  canFly: false,
  instantBreak: false,
  infiniteItems: false,
  canModifyBlocks: true,
  mobsHostile: true,
  deleteWorldOnDeath: false,
  forcedDifficulty: null,
  reach: 5,
};

/** 游戏模式 → 规则。 */
export const GAME_MODE_RULES: Record<GameMode, GameModeRules> = {
  survival: SURVIVAL_RULES,
  creative: {
    mode: GameMode.CREATIVE,
    takesDamage: false,
    usesHunger: false,
    canFly: true,
    instantBreak: true,
    infiniteItems: true,
    canModifyBlocks: true,
    mobsHostile: false,
    deleteWorldOnDeath: false,
    forcedDifficulty: null,
    reach: 6,
  },
  adventure: {
    ...SURVIVAL_RULES,
    mode: GameMode.ADVENTURE,
    canModifyBlocks: false,
  },
  hardcore: {
    ...SURVIVAL_RULES,
    mode: GameMode.HARDCORE,
    deleteWorldOnDeath: true,
    forcedDifficulty: Difficulty.HARD,
  },
};

/** 获取模式规则。 */
export function getRules(mode: GameMode): GameModeRules {
  return GAME_MODE_RULES[mode];
}
