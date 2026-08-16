import type { GameMode } from '../constants/game';
import type { ActiveEffect } from '../entities/effects';
import type { ItemStack } from '../items/ItemStack';

/** UI 屏幕。 */
export const Screen = {
  NONE: 'none',
  INVENTORY: 'inventory',
  CRAFTING: 'crafting',
  FURNACE: 'furnace',
  BREWING: 'brewing',
  ENCHANTING: 'enchanting',
  ANVIL: 'anvil',
  STATS: 'stats',
  BEACON: 'beacon',
  CHEST: 'chest',
  PAUSE: 'pause',
  DEATH: 'death',
} as const;
export type Screen = (typeof Screen)[keyof typeof Screen];

/** 会显示背包面板的界面（背包 / 工作台 / 熔炉 / 箱子）。 */
const CONTAINER_SCREENS: ReadonlySet<Screen> = new Set<Screen>([
  Screen.INVENTORY,
  Screen.CRAFTING,
  Screen.FURNACE,
  Screen.BREWING,
  Screen.ENCHANTING,
  Screen.ANVIL,
  Screen.BEACON,
  Screen.CHEST,
]);

/** 该界面是否是带背包面板的容器界面。 */
export function isContainerScreen(screen: Screen): boolean {
  return CONTAINER_SCREENS.has(screen);
}

/** 引擎暴露给 React 的 UI 状态快照。 */
export interface GameUiState {
  mode: GameMode;
  health: number;
  maxHealth: number;
  food: number;
  air: number;
  maxAir: number;
  /** 护甲点数 0~20。 */
  armor: number;
  /** 身上的状态效果（HUD 用）。 */
  effects: ActiveEffect[];
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
  /** 成就 / 统计每变化一次 +1（成就页据此刷新）。 */
  achievementVersion: number;
  /** Boss 血条：没有 Boss 时为 null。 */
  boss: { label: string; ratio: number } | null;
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
