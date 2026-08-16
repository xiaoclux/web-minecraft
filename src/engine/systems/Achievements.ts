/**
 * 成就与统计：成就是 1.8.9 成就树的子集，靠游戏里各处上报的事件解锁；
 * 统计是若干计数器。两者都随存档保存，与渲染 / UI 无关。
 */

/** 成就 id（与 1.8.9 的 achievement.* 名称对应）。 */
export const AchievementId = {
  TAKING_INVENTORY: 'taking_inventory',
  MINE_WOOD: 'mine_wood',
  BUILD_WORKBENCH: 'build_workbench',
  BUILD_PICKAXE: 'build_pickaxe',
  BUILD_FURNACE: 'build_furnace',
  ACQUIRE_IRON: 'acquire_iron',
  BUILD_HOE: 'build_hoe',
  MAKE_BREAD: 'make_bread',
  BUILD_BETTER_PICKAXE: 'build_better_pickaxe',
  BUILD_SWORD: 'build_sword',
  KILL_ENEMY: 'kill_enemy',
  KILL_COW: 'kill_cow',
  BREED_COW: 'breed_cow',
  DIAMONDS: 'diamonds',
  ENCHANTMENTS: 'enchantments',
  BOOKCASE: 'bookcase',
  OVERKILL: 'overkill',
  POTION: 'potion',
  BLAZE_ROD: 'blaze_rod',
  PORTAL: 'portal',
  GHAST: 'ghast',
  THE_END: 'the_end',
  THE_END2: 'the_end2',
  SPAWN_WITHER: 'spawn_wither',
  KILL_WITHER: 'kill_wither',
} as const;
export type AchievementId = (typeof AchievementId)[keyof typeof AchievementId];

/** 成就定义。 */
export interface AchievementDef {
  id: AchievementId;
  label: string;
  description: string;
  /** 前置成就：没解锁前置就算条件达成也不给（1.8.9 同）。 */
  parent?: AchievementId;
  /** 成就页里显示的图标物品 id。 */
  icon: string;
}

export const ACHIEVEMENT_DEFS: readonly AchievementDef[] = [
  { id: AchievementId.TAKING_INVENTORY, label: '物品栏', description: '按 E 打开你的物品栏', icon: 'book' },
  {
    id: AchievementId.MINE_WOOD,
    label: '获得木头',
    description: '徒手砍树直到木头掉出来',
    parent: AchievementId.TAKING_INVENTORY,
    icon: 'log',
  },
  {
    id: AchievementId.BUILD_WORKBENCH,
    label: '合成台',
    description: '用四块木板合成一张工作台',
    parent: AchievementId.MINE_WOOD,
    icon: 'crafting_table',
  },
  {
    id: AchievementId.BUILD_PICKAXE,
    label: '采矿时间到！',
    description: '用木板和木棍做一把镐',
    parent: AchievementId.BUILD_WORKBENCH,
    icon: 'wooden_pickaxe',
  },
  {
    id: AchievementId.BUILD_FURNACE,
    label: '"热"门话题',
    description: '用八块圆石做一个熔炉',
    parent: AchievementId.BUILD_PICKAXE,
    icon: 'furnace',
  },
  {
    id: AchievementId.ACQUIRE_IRON,
    label: '来硬的',
    description: '熔炼出一块铁锭',
    parent: AchievementId.BUILD_FURNACE,
    icon: 'iron_ingot',
  },
  {
    id: AchievementId.BUILD_HOE,
    label: '开始耕种',
    description: '用木板和木棍做一把锄',
    parent: AchievementId.BUILD_WORKBENCH,
    icon: 'wooden_hoe',
  },
  {
    id: AchievementId.MAKE_BREAD,
    label: '烤面包',
    description: '用小麦做出面包',
    parent: AchievementId.BUILD_HOE,
    icon: 'bread',
  },
  {
    id: AchievementId.BUILD_BETTER_PICKAXE,
    label: '获得升级',
    description: '做一把更好的镐',
    parent: AchievementId.BUILD_PICKAXE,
    icon: 'stone_pickaxe',
  },
  {
    id: AchievementId.BUILD_SWORD,
    label: '出击时间到！',
    description: '用木板和木棍做一把剑',
    parent: AchievementId.BUILD_WORKBENCH,
    icon: 'wooden_sword',
  },
  {
    id: AchievementId.KILL_ENEMY,
    label: '怪物猎人',
    description: '攻击并消灭一只怪物',
    parent: AchievementId.BUILD_SWORD,
    icon: 'bone',
  },
  {
    id: AchievementId.KILL_COW,
    label: '斗牛士',
    description: '收获一些皮革',
    parent: AchievementId.BUILD_SWORD,
    icon: 'leather',
  },
  {
    id: AchievementId.BREED_COW,
    label: '繁殖',
    description: '用小麦让两头牛生个小牛',
    parent: AchievementId.KILL_COW,
    icon: 'wheat',
  },
  {
    id: AchievementId.DIAMONDS,
    label: '钻石！',
    description: '用铁镐挖到钻石',
    parent: AchievementId.ACQUIRE_IRON,
    icon: 'diamond',
  },
  {
    id: AchievementId.ENCHANTMENTS,
    label: '附魔师',
    description: '用附魔台附魔一件物品',
    parent: AchievementId.DIAMONDS,
    icon: 'enchanting_table',
  },
  {
    id: AchievementId.BOOKCASE,
    label: '图书管理员',
    description: '合成一个书架',
    parent: AchievementId.ENCHANTMENTS,
    icon: 'bookshelf',
  },
  {
    id: AchievementId.OVERKILL,
    label: '过度杀戮',
    description: '一击造成九颗心的伤害',
    parent: AchievementId.ENCHANTMENTS,
    icon: 'diamond_sword',
  },
  {
    id: AchievementId.POTION,
    label: '本地酿造厂',
    description: '酿造一瓶药水',
    parent: AchievementId.BLAZE_ROD,
    icon: 'potion_awkward',
  },
  {
    id: AchievementId.BLAZE_ROD,
    label: '与火共舞',
    description: '从烈焰人身上得到烈焰棒',
    parent: AchievementId.PORTAL,
    icon: 'blaze_rod',
  },
  {
    id: AchievementId.PORTAL,
    label: '勇往直下',
    description: '建造并进入下界传送门',
    parent: AchievementId.DIAMONDS,
    icon: 'obsidian',
  },
  {
    id: AchievementId.GHAST,
    label: '回到发送者',
    description: '用火球干掉一只恶魂',
    parent: AchievementId.PORTAL,
    icon: 'ghast_tear',
  },
  {
    id: AchievementId.THE_END,
    label: '结束了？',
    description: '找到末地',
    parent: AchievementId.BLAZE_ROD,
    icon: 'ender_pearl',
  },
  {
    id: AchievementId.THE_END2,
    label: '结束了。',
    description: '击败末影龙',
    parent: AchievementId.THE_END,
    icon: 'diamond_block',
  },
  {
    id: AchievementId.SPAWN_WITHER,
    label: '开始了？',
    description: '召唤凋灵',
    parent: AchievementId.THE_END2,
    icon: 'bone',
  },
  {
    id: AchievementId.KILL_WITHER,
    label: '开始了。',
    description: '击败凋灵',
    parent: AchievementId.SPAWN_WITHER,
    icon: 'gold_block',
  },
];

const DEFS_BY_ID: ReadonlyMap<string, AchievementDef> = new Map(ACHIEVEMENT_DEFS.map((d) => [d.id, d]));

/** 按 id 取成就定义。 */
export function achievementDef(id: AchievementId): AchievementDef {
  return DEFS_BY_ID.get(id) as AchievementDef;
}

/** 统计项 id。 */
export const StatId = {
  PLAY_TICKS: 'play_ticks',
  BLOCKS_MINED: 'blocks_mined',
  BLOCKS_PLACED: 'blocks_placed',
  ITEMS_CRAFTED: 'items_crafted',
  MOBS_KILLED: 'mobs_killed',
  ANIMALS_BRED: 'animals_bred',
  DEATHS: 'deaths',
  DAMAGE_DEALT: 'damage_dealt',
  DAMAGE_TAKEN: 'damage_taken',
  JUMPS: 'jumps',
  ITEMS_ENCHANTED: 'items_enchanted',
  POTIONS_BREWED: 'potions_brewed',
} as const;
export type StatId = (typeof StatId)[keyof typeof StatId];

/** 统计项的显示名。 */
export const STAT_LABELS: Readonly<Record<StatId, string>> = {
  play_ticks: '游戏时长',
  blocks_mined: '挖掘方块',
  blocks_placed: '放置方块',
  items_crafted: '合成物品',
  mobs_killed: '击杀生物',
  animals_bred: '繁殖动物',
  deaths: '死亡次数',
  damage_dealt: '造成伤害',
  damage_taken: '受到伤害',
  jumps: '跳跃次数',
  items_enchanted: '附魔次数',
  potions_brewed: '酿造药水',
};

/** 存档里的成就与统计。 */
export interface AchievementSaveData {
  unlocked: string[];
  stats: Record<string, number>;
}

/** 木镐以上的镐（"获得升级"）。 */
const BETTER_PICKAXES: ReadonlySet<string> = new Set([
  'stone_pickaxe',
  'iron_pickaxe',
  'golden_pickaxe',
  'diamond_pickaxe',
]);
/** "过度杀戮"的单击伤害门槛（九颗心 = 18）。 */
const OVERKILL_DAMAGE = 18;

/**
 * 成就与统计的状态机：Game 在事件发生处调用 on* 方法，解锁时通过 onUnlock 通知（弹提示）。
 */
export class AchievementSystem {
  private readonly unlocked = new Set<AchievementId>();
  private readonly counters = new Map<StatId, number>();
  /** 每次解锁或计数变化 +1，UI 据此刷新。 */
  version = 0;

  constructor(private readonly onUnlock: (def: AchievementDef) => void) {}

  /** 是否已解锁。 */
  has(id: AchievementId): boolean {
    return this.unlocked.has(id);
  }

  /** 已解锁数量。 */
  get unlockedCount(): number {
    return this.unlocked.size;
  }

  /** 某项统计的值。 */
  stat(id: StatId): number {
    return this.counters.get(id) ?? 0;
  }

  /** 累加统计。 */
  addStat(id: StatId, amount = 1): void {
    this.counters.set(id, this.stat(id) + amount);
    this.version++;
  }

  /** 每 tick 累加游戏时长；不 bump version，免得 UI 每 tick 都重渲染。 */
  tickPlayTime(): void {
    this.counters.set(StatId.PLAY_TICKS, this.stat(StatId.PLAY_TICKS) + 1);
  }

  /**
   * 尝试解锁：需要前置成就已解锁。
   * @returns 这次是否真的新解锁了
   */
  unlock(id: AchievementId): boolean {
    if (this.unlocked.has(id)) {
      return false;
    }
    const def = achievementDef(id);
    if (def.parent && !this.unlocked.has(def.parent)) {
      return false;
    }
    this.unlocked.add(id);
    this.version++;
    this.onUnlock(def);
    return true;
  }

  // ---------------------------------------------------------------- 事件入口

  onOpenInventory(): void {
    this.unlock(AchievementId.TAKING_INVENTORY);
  }

  /** 拾取 / 从熔炉取出等"到手"的物品。 */
  onItemObtained(itemId: string): void {
    if (itemId.endsWith('_log') || itemId === 'log') {
      this.unlock(AchievementId.MINE_WOOD);
    } else if (itemId === 'iron_ingot') {
      this.unlock(AchievementId.ACQUIRE_IRON);
    } else if (itemId === 'diamond') {
      this.unlock(AchievementId.DIAMONDS);
    } else if (itemId === 'blaze_rod') {
      this.unlock(AchievementId.BLAZE_ROD);
    } else if (itemId === 'leather') {
      this.unlock(AchievementId.KILL_COW);
    }
  }

  onCrafted(itemId: string, count: number): void {
    this.addStat(StatId.ITEMS_CRAFTED, count);
    if (itemId === 'crafting_table') {
      this.unlock(AchievementId.BUILD_WORKBENCH);
    } else if (itemId.endsWith('_pickaxe')) {
      this.unlock(AchievementId.BUILD_PICKAXE);
      if (BETTER_PICKAXES.has(itemId)) {
        this.unlock(AchievementId.BUILD_BETTER_PICKAXE);
      }
    } else if (itemId === 'furnace') {
      this.unlock(AchievementId.BUILD_FURNACE);
    } else if (itemId.endsWith('_hoe')) {
      this.unlock(AchievementId.BUILD_HOE);
    } else if (itemId === 'bread') {
      this.unlock(AchievementId.MAKE_BREAD);
    } else if (itemId.endsWith('_sword')) {
      this.unlock(AchievementId.BUILD_SWORD);
    } else if (itemId === 'bookshelf') {
      this.unlock(AchievementId.BOOKCASE);
    }
  }

  onMobKilled(hostile: boolean): void {
    this.addStat(StatId.MOBS_KILLED);
    if (hostile) {
      this.unlock(AchievementId.KILL_ENEMY);
    }
  }

  onDamageDealt(amount: number): void {
    this.addStat(StatId.DAMAGE_DEALT, amount);
    if (amount >= OVERKILL_DAMAGE) {
      this.unlock(AchievementId.OVERKILL);
    }
  }

  onBred(mobType: string): void {
    this.addStat(StatId.ANIMALS_BRED);
    if (mobType === 'cow') {
      this.unlock(AchievementId.BREED_COW);
    }
  }

  /** 进入某个维度。 */
  onEnterDimension(dimensionId: string): void {
    if (dimensionId === 'nether') {
      this.unlock(AchievementId.PORTAL);
    } else if (dimensionId === 'end') {
      this.unlock(AchievementId.THE_END);
    }
  }

  onEnchanted(): void {
    this.addStat(StatId.ITEMS_ENCHANTED);
    this.unlock(AchievementId.ENCHANTMENTS);
  }

  onPotionBrewed(): void {
    this.addStat(StatId.POTIONS_BREWED);
    this.unlock(AchievementId.POTION);
  }

  serialize(): AchievementSaveData {
    return { unlocked: [...this.unlocked], stats: Object.fromEntries(this.counters) };
  }

  load(data: AchievementSaveData | undefined): void {
    this.unlocked.clear();
    this.counters.clear();
    if (!data) {
      return;
    }
    for (const id of data.unlocked) {
      if (DEFS_BY_ID.has(id)) {
        this.unlocked.add(id as AchievementId);
      }
    }
    for (const [id, value] of Object.entries(data.stats)) {
      if (id in STAT_LABELS) {
        this.counters.set(id as StatId, value);
      }
    }
    this.version++;
  }
}
