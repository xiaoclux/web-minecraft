import type { GameMode } from '../constants/game';
import type { ItemStack } from '../items/ItemStack';

/** UI 屏幕。 */
export const Screen = {
  NONE: 'none',
  INVENTORY: 'inventory',
  CRAFTING: 'crafting',
  FURNACE: 'furnace',
  PAUSE: 'pause',
  DEATH: 'death',
} as const;
export type Screen = (typeof Screen)[keyof typeof Screen];

/** 引擎暴露给 React 的 UI 状态快照。 */
export interface GameUiState {
  mode: GameMode;
  health: number;
  maxHealth: number;
  food: number;
  air: number;
  maxAir: number;
  xpLevel: number;
  xpProgress: number;
  selectedSlot: number;
  /** 背包版本号：每次背包变化 +1，驱动 UI 刷新。 */
  inventoryVersion: number;
  screen: Screen;
  isPointerLocked: boolean;
  isFlying: boolean;
  isUnderwater: boolean;
  /** 正在挖掘的进度 0~1。 */
  breakProgress: number;
  /** 准星指向的方块名。 */
  targetLabel: string;
  /** 短暂提示（如捡起物品名）。 */
  toast: string;
  toastVersion: number;
  debug: DebugInfo | null;
  isLoading: boolean;
  loadingText: string;
  timeOfDay: number;
  /** 打开中的容器交互位置（工作台/熔炉）。 */
  openBlock: { x: number; y: number; z: number } | null;
  /** 光标拿着的物品。 */
  cursorStack: ItemStack | null;
  deathMessage: string;
  isHardcoreDeath: boolean;
}

/** F3 调试信息。 */
export interface DebugInfo {
  fps: number;
  x: number;
  y: number;
  z: number;
  chunkX: number;
  chunkZ: number;
  biome: string;
  /** 已加载 chunk 数。 */
  chunks: number;
  entities: number;
  light: string;
  facing: string;
  tick: number;
}
