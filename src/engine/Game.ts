import * as THREE from 'three';
import { BlockId, ToolType, blockVariant, cropBlockForSeed, getBlock, type BlockDef } from './blocks/BlockRegistry';
import { breakTicks, rollDrops, rollXp } from './blocks/blockBreaking';
import {
  BED_HEAD_BIT,
  BlockShape,
  DOOR_OPEN_BIT,
  CAKE_BITES,
  SIGN_WALL_BIT,
  TRAPDOOR_TOP_BIT,
  DOOR_UPPER_BIT,
  FACINGS,
  FACING_MASK,
  FULL_BOX,
  CROP_MAX_STAGE,
  SLAB_TOP_BIT,
  STAIRS_FLIP_BIT,
  collisionBoxes,
  computeConnections,
  facingIndexOf,
  needsConnections,
  outlineBox,
  type BlockBox,
} from './blocks/blockShapes';
import {
  ATTACK_COOLDOWN_TICKS,
  CREATIVE_BLOCK_BREAK_DELAY_TICKS,
  DIFFICULTY_DAMAGE_MULTIPLIER,
  Difficulty,
  DOUBLE_TAP_MS,
  GameMode,
  HOTBAR_SIZE,
  ITEM_DROP_SPAWN_SPEED,
  MAX_TICKS_PER_FRAME,
  PLAYER_FLY_SPEED,
  PLAYER_JUMP_VELOCITY,
  PLAYER_SNEAK_MULTIPLIER,
  PLAYER_SPRINT_MULTIPLIER,
  PLAYER_SWIM_SPEED,
  PLAYER_WALK_SPEED,
  WATER_SWIM_UP_ACCEL,
  WATER_SWIM_UP_MAX,
  LADDER_CLIMB_SPEED,
  LADDER_SLIDE_SPEED,
  SLEEP_MONSTER_RADIUS,
  XP_ORB_MAX_AMOUNT,
  SPRINT_FOOD_THRESHOLD,
  TICK_MS,
  SIGN_LINE_COUNT,
  SIGN_LINE_MAX_CHARS,
  TICKS_PER_SECOND,
} from './constants/game';
import type { ParticleOptions } from './render/ParticleSystem';
import { KEY_ESCAPE, KEY_HOTBAR_PREFIX, MOUSE_LEFT, MOUSE_MIDDLE, MOUSE_RIGHT } from './constants/keys';
import { actionForCode, isTouchDevice, settingsStore, type BindingAction } from './settings/Settings';
import { AUTOSAVE_INTERVAL_TICKS, SAVE_FORMAT_VERSION } from './constants/save';
import {
  CREEPER_EXPLOSION_MAX_DAMAGE,
  MOB_BREED_COOLDOWN_TICKS,
  MOB_BREED_RANGE,
  MOB_MATE_SEEK_RANGE,
  MOB_BREED_XP_MAX,
  MOB_BREED_XP_MIN,
  SPAWNER_ACTIVATE_RANGE,
  SPAWNER_MAX_COUNT,
  SPAWNER_MAX_DELAY_TICKS,
  SPAWNER_MIN_COUNT,
  SPAWNER_MIN_DELAY_TICKS,
  SPAWNER_NEARBY_LIMIT,
  SPAWNER_SPAWN_RANGE,
  SPLASH_POTION_MIN_FACTOR,
  SPLASH_POTION_RADIUS,
  SPLASH_POTION_SPEED,
  DRAGON_CIRCLE_RADIUS,
  BOW_FULL_DRAW_TICKS,
  BOW_MAX_ARROW_DAMAGE,
  BOW_MAX_ARROW_SPEED,
  BOW_MIN_DRAW_RATIO,
  DRAGON_CRUISE_HEIGHT,
  DRAGON_KILL_XP,
  ENDER_CRYSTAL_HEAL_RANGE,
  WITHER_KILL_XP,
} from './constants/mobs';
import { CHEST_SLOT_COUNT } from './constants/ui';
import { rollLoot } from './world/structures/LootTables';
import { WATER_SOURCE_META, WATER_TICK_INTERVAL } from './constants/fluids';
import {
  DAY_LENGTH_TICKS,
  DEFAULT_RENDER_DISTANCE,
  WORLD_SIZE_Y,
  WorldType,
  MAX_LIGHT,
  NIGHT_END_TICK,
  NIGHT_START_TICK,
  SPAWN_PRELOAD_RADIUS,
} from './constants/world';
import { BlockEntityStore, BlockEntityType, type HopperBlockEntity } from './world/BlockEntityStore';
import { POWERED_RAIL_LIT_BIT } from './blocks/BlockRegistry';
import { RandomTickSystem } from './systems/RandomTickSystem';
import { WeatherSystem } from './systems/WeatherSystem';
import { DIMENSION_DEFS, Dimension, DimensionId, isDimensionId } from './world/Dimension';
import {
  PORTAL_TRIGGER_TICKS,
  PORTAL_COOLDOWN_TICKS,
  buildPortal,
  findExistingPortal,
  mapCoordinate,
  tryLightPortal,
} from './systems/PortalSystem';
import { breakSound, digSound, placeSound, soundGroupOf, stepSound } from './blocks/blockSounds';
import { AchievementSystem, StatId } from './systems/Achievements';
import { potionOfItem } from './items/potions';
import { biomeHasSnowfall, biomeLabel } from './world/biomes';
import { ArrowEntity } from './entities/ArrowEntity';
import { ThrownItemEntity } from './entities/ThrownItemEntity';
import { ThrownPotionEntity } from './entities/ThrownPotionEntity';
import { FireballEntity } from './entities/FireballEntity';
import { EnderCrystalEntity } from './entities/EnderCrystalEntity';
import { EnderDragonEntity } from './entities/EnderDragonEntity';
import { WitherEntity } from './entities/WitherEntity';
import { MinecartEntity } from './entities/MinecartEntity';
import { COMMAND_DAY_LENGTH, FILL_LIMIT, runCommand, type CommandHost } from './systems/Commands';
import {
  MOVE_REPORT_INTERVAL_TICKS,
  NetClient,
  connectToServer,
  type ClientTransport,
  type NetClientHandlers,
  type RemotePlayer,
} from '../net/NetClient';
import { RemoteGenerator } from '../net/RemoteGenerator';
import { ServerCore } from '../net/ServerCore';
import { MessageType } from '../net/protocol';
import { RtcInvite } from '../net/webrtc';
import type { WelcomeMessage } from '../net/protocol';
import { KEY_CHAT, KEY_COMMAND } from './constants/keys';
import { getBlockByName } from './blocks/BlockRegistry';
import { ENCHANTMENT_DEFS, canEnchant, isEnchantmentId } from './items/enchantments';
import { EFFECT_DEFS } from './entities/effects';
import type { Weather } from './systems/WeatherSystem';
import {
  isPoweredRailOn,
  notePitch,
  powerAt,
  repeaterInputPower,
  updateWires,
} from './systems/RedstoneSystem';
import { containerSlots, extractOne, insertOne, isEmpty } from './systems/HopperSystem';
import { extendPiston, pistonDirection, retractPiston } from './systems/PistonSystem';
import {
  BUTTON_PRESS_TICKS,
  COMPARATOR_DELAY_TICKS,
  COMPARATOR_MODE_BIT,
  REDSTONE_POWERED_BIT,
  REDSTONE_UPDATE_RADIUS,
  REPEATER_DELAYS,
  REPEATER_DELAY_MASK,
  REPEATER_DELAY_SHIFT,
  REPEATER_FACING_MASK,
  TORCH_DELAY_TICKS,
  PISTON_DELAY_TICKS,
  PISTON_FACING_MASK,
  DISPENSER_LAUNCH_SPEED,
  DISPENSER_SLOT_COUNT,
  HOPPER_PICKUP_RANGE,
  HOPPER_SLOT_COUNT,
  HOPPER_TRANSFER_INTERVAL_TICKS,
  NOTE_COUNT,
  NOTE_MASK,
  NOTE_POWERED_BIT,
  RailShape,
} from './constants/redstone';
import {
  BEACON_EFFECT_TICKS,
  beaconLevel,
  beaconOptionsFor,
  beaconRange,
  hasSkyAccess,
  type BeaconOption,
} from './systems/BeaconSystem';
import { EndGenerator, END_ISLAND_CENTER_X, END_ISLAND_CENTER_Z, END_ISLAND_SURFACE_Y } from './world/EndGenerator';
import { TerrainGenerator } from './world/TerrainGenerator';
import type { Stronghold } from './world/structures/StrongholdGenerator';
import { Entity, allocateEntityId, resetEntityIds, type EntitySaveData } from './entities/Entity';
import type { EntityContext } from './entities/EntityContext';
import { ItemDropEntity } from './entities/ItemDropEntity';
import { XpOrbEntity } from './entities/XpOrbEntity';
import { LivingEntity } from './entities/LivingEntity';
import { EffectId, isEffectId, type ActiveEffect } from './entities/effects';
import { Mob } from './entities/Mob';
import { MobType, isMobType } from './entities/MobDefs';
import { MobSpawner } from './entities/MobSpawner';
import { daylightAt } from './world/daylight';
import { Screen, isContainerScreen, type BossStatus, type DebugInfo, type GameUiState } from './events/GameState';
import { Store } from './events/Store';
import { ContainerController, type ContainerHost, type SlotRef } from './items/ContainerController';
import { createFurnace, tickFurnace, type FurnaceState } from './items/Furnace';
import { createBrewingStand, tickBrewing, type BrewingState } from './items/Brewing';
import { POTION_DEFS, PotionBase, potionItemId } from './items/potions';
import { ANVIL_MAX_COST, ANVIL_SLOT_COUNT, anvilResult, type AnvilResult } from './items/Anvil';
import {
  ENCHANTING_SLOT_COUNT,
  ENCHANT_ITEM_SLOT,
  ENCHANT_LAPIS_SLOT,
  LAPIS_PER_OPTION,
  LEVELS_PER_OPTION,
  MAX_BOOKSHELVES,
  applyEnchants,
  rollOptions,
  type EnchantOption,
} from './items/EnchantingTable';
export type { SlotRef } from './items/ContainerController';
import { blockForMaterial, getAttackDamage, getItem, ITEM_DEFS, ItemKind } from './items/ItemRegistry';
import { prewarmItemIcons } from './textures/IconRegistry';
import {
  EnchantmentId,
  FIRE_ASPECT_TICKS_PER_LEVEL,
  KNOCKBACK_PER_LEVEL,
  SHARPNESS_DAMAGE_PER_LEVEL,
  enchantLevel,
  unbreakingSkips,
} from './items/enchantments';
import type { ItemStack } from './items/ItemStack';
import { getRules, type GameModeRules } from './modes/GameModes';
import { AABB } from './physics/AABB';
import { raycastBlocks, type RayHit } from './physics/raycast';
import { Controls } from './player/Controls';
import { Player } from './player/Player';
import type { Inventory } from './items/Inventory';
import { Renderer } from './render/Renderer';
import { Sky } from './render/Sky';
import { BABY_PITCH, mobSound, MobSoundKind } from './entities/mobSounds';
import { MusicPlayer } from './render/MusicPlayer';
import { SoundManager, type SoundSpec } from './render/SoundManager';
import { deserializeChunk, serializeChunk } from './save/chunkSerializer';
import type { DimensionSaveData } from './save/SaveManager';
import { SaveManager, type WorldMeta, type WorldSave } from './save/SaveManager';
import { TextureAtlas } from './textures/TextureAtlas';
import { createRng, hashString } from './textures/PixelCanvas';
import type { Chunk } from './world/Chunk';
import { chunkKey, toChunkCoord } from './world/Chunk';
import { createDimensionGenerator, type ChunkGenerator } from './world/ChunkGenerator';
import { ChunkManager } from './world/ChunkManager';
import { FluidSimulator } from './world/FluidSimulator';
import { World } from './world/World';

/** 游戏初始化参数。 */
export interface GameOptions {
  meta: WorldMeta;
  save: WorldSave | null;
  canvas: HTMLCanvasElement;
  saveManager: SaveManager;
  onExit: () => void;
  /** 联机：要连的服务端地址与玩家名；单机时不填。 */
  server?: { url: string; playerName: string };
  /** 用房间码加入：地形同样来自远端，通道由外部在 start() 后交进来。 */
  joinByCode?: boolean;
}

const INITIAL_TIME_TICK = 1000;
const MAX_FRAME_DT = 0.1;
const TNT_FUSE_TICKS = 60;
const TNT_EXPLOSION_RADIUS = 4;
/** 经验条在 UI 里的精度（百分之一）。 */
const XP_BAR_STEPS = 100;
/** 在下界 / 末地睡床时的爆炸半径（1.8.9 床的威力 5，比 TNT 更狠）。 */
const BED_EXPLOSION_RADIUS = 5;
const EXPLOSION_DROP_CHANCE = 0.3;
const EAT_COOLDOWN_TICKS = 16;
const PLACE_COOLDOWN_TICKS = 4;
const TOAST_TICKS = 60;
const FPS_SAMPLE_MS = 500;
const CRAFT_GRID_SIZE = 9;
const FACING_LABELS = ['南 (+Z)', '西 (-X)', '北 (-Z)', '东 (+X)'];
const XP_PER_MOB_KILL_MULTIPLIER = 1;
const SPAWN_PROTECTION_TICKS = 40;
const REPLACEABLE_BLOCKS: ReadonlySet<number> = new Set<number>([BlockId.AIR, BlockId.WATER, BlockId.TALL_GRASS]);
/** 下雨：每 tick 撒几滴雨、撒雨的半径与高度。 */
const RAIN_PARTICLES_PER_TICK = 8;
const RAIN_PARTICLE_RADIUS = 10;
const RAIN_PARTICLE_HEIGHT = 6;
const RAIN_PARTICLE_OPTIONS: ParticleOptions = { speed: 0, minLife: 0.5, maxLife: 0.9, size: 0.08, brightness: 1 };
/** HUD 效果倒计时只显示到秒，所以效果列表每秒刷新一次即可。 */
const EFFECT_HUD_REFRESH_TICKS = TICKS_PER_SECOND;
const EMPTY_EFFECTS: ActiveEffect[] = [];
const SPAWNER_ACTIVATE_RANGE_SQ = SPAWNER_ACTIVATE_RANGE * SPAWNER_ACTIVATE_RANGE;
/** 战利品在箱子里的摆放间隔（散开一点，别都挤在开头）。 */
const LOOT_SLOT_STRIDE = 4;
/** 各种桶倒出来的流体方块（空桶为 AIR，表示"去装"）。 */
const BUCKET_FLUIDS: Record<string, number> = {
  bucket: BlockId.AIR,
  water_bucket: BlockId.WATER,
  lava_bucket: BlockId.LAVA,
};
/** 流体方块 → 装满后的桶。 */
const FILLED_BUCKETS: Record<number, string> = {
  [BlockId.WATER]: 'water_bucket',
  [BlockId.LAVA]: 'lava_bucket',
};
/** 求爱 / 繁殖时冒出的爱心粒子数量与取样贴图。 */
const HEART_PARTICLE_COUNT = 7;
const HEART_PARTICLE_TEXTURE = 'particle_heart';
/** 音符盒响一声时飘出的音符粒子。 */
const NOTE_PARTICLE_TEXTURE = 'particle_note';
const NOTE_PARTICLE_OPTIONS = { speed: 1, minLife: 0.5, maxLife: 0.9, size: 0.16 };
/** 破坏一个方块炸出的碎屑数量。 */
const BREAK_PARTICLE_COUNT = 12;
/** 爆炸粒子数量与取样贴图（用石头的灰色当烟）。 */
const EXPLOSION_PARTICLE_COUNT = 40;
const EXPLOSION_PARTICLE_TEXTURE = 'stone';
/**
 * 附魔台书架的检查表：以附魔台为中心，8 个方向各对应"距离 2 的那一段外圈"上的书架位置；
 * 下标 = (dx+1)*3 + (dz+1)，中心 (0,0) 留空。
 */
const BOOKSHELF_RING_OFFSETS: readonly (readonly (readonly [number, number])[])[] = [
  [[-2, -2]],
  [
    [-2, -1],
    [-2, 0],
    [-2, 1],
  ],
  [[-2, 2]],
  [
    [-1, -2],
    [0, -2],
    [1, -2],
  ],
  [],
  [
    [-1, 2],
    [0, 2],
    [1, 2],
  ],
  [[2, -2]],
  [
    [2, -1],
    [2, 0],
    [2, 1],
  ],
  [[2, 2]],
];
/** 打末影水晶时准星允许的偏差与额外触及距离。 */
const CRYSTAL_HIT_TOLERANCE = 1.5;
const CRYSTAL_EXTRA_REACH = 3;
/** 末影水晶治疗末影龙的距离平方。 */
const CRYSTAL_HEAL_RANGE_SQ = ENDER_CRYSTAL_HEAL_RANGE * ENDER_CRYSTAL_HEAL_RANGE;
/** 掉线后最多自动重连几次、第 n 次等多久。 */
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_BASE_DELAY_MS = 2000;
/** 作为主机时多久给客人同步一次时间与实体快照。 */
const HOST_TIME_SYNC_TICKS = 100;
const HOST_ENTITY_SYNC_TICKS = 4;
/** 聊天栏最多保留多少行与多少条历史输入。 */
const CHAT_MESSAGE_LIMIT = 60;
const CHAT_HISTORY_LIMIT = 30;
/** 矿车物品 id、点中矿车的准星容差与骑乘时玩家相对车的高度。 */
const MINECART_ITEM = 'minecart';
const MINECART_HIT_TOLERANCE = 1;
const RIDE_EYE_OFFSET = 0.3;
/** 压力板多久检查一次。 */
/** 方块变更后重算用电器的半径。 */
const REDSTONE_CONSUMER_RADIUS = 2;
/** 凋灵召唤阵的两个可能轴向（沿 X 或沿 Z 摆）。 */
const WITHER_SUMMON_AXES: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
];
/** 信标多久给一次效果。 */
const BEACON_REFRESH_TICKS = 20;
/** 末影之眼物品 id、框架 meta 里"已镶眼"的位、框架方环半径。 */
const ENDER_EYE_ITEM = 'ender_eye';
const PORTAL_FRAME_EYE_BIT = 4;
const PORTAL_FRAME_RADIUS = 2;
/** 方位判定：一个轴超过另一个轴这么多倍就算正方向。 */
const COMPASS_DOMINANCE = 2;
/** 一次掉落最多拆成多少颗经验球。 */
const MAX_XP_ORBS_PER_DROP = 40;
/** 末地传送门的触发时间（比下界的短）。 */
const END_PORTAL_TRIGGER_TICKS = 20;
/** 到末地时落在岛面上方这么高（免得卡进石头里）。 */
const END_ARRIVAL_HEIGHT = 2;
/** 返回传送门的半径（曼哈顿距离）。 */
const EXIT_PORTAL_RADIUS = 2;
/** 打火球时准星允许的偏差与额外触及距离。 */
const FIREBALL_REFLECT_TOLERANCE = 1.2;
const FIREBALL_REFLECT_EXTRA_REACH = 2;
/** 无昼夜的维度用的固定天色（主世界为 null，走正常昼夜）。 */
const DIMENSION_SKY_COLORS: Readonly<Record<DimensionId, THREE.Color | null>> = {
  overworld: null,
  nether: new THREE.Color(0x330808),
  end: new THREE.Color(0x0a0a16),
};
/** 传送前后要同步加载的 chunk 半径。 */
const PORTAL_LOAD_RADIUS = 2;
/** 在已加载区里找现成传送门的半径（比 1.8.9 的 128 小，只在已加载的 chunk 里找）。 */
const PORTAL_SEARCH_RADIUS_LOADED = 32;
/** 洞穴环境音的判定：埋得比地表低这么多且光照低于此值。 */
const UNDERGROUND_DEPTH = 8;
const UNDERGROUND_MAX_LIGHT = 6;
/** 每走这么多格出一次脚步声。 */
const FOOTSTEP_INTERVAL_BLOCKS = 2.2;
/** 挖掘时每隔多少 tick 播一次碎响。 */
const DIG_SOUND_INTERVAL_TICKS = 5;
/** 夜视把世界亮度托到的下限（1 = 满亮，略低一点保留一点氛围）。 */
const NIGHT_VISION_MIN_LIGHT = 0.9;
/** 弓与箭的物品 id。 */
const BOW_ITEM_ID = 'bow';
const ARROW_ITEM_ID = 'arrow';
/** 放完一箭的冷却（tick）。 */
const BOW_RELEASE_COOLDOWN_TICKS = 4;
/** 没有告示牌在编辑时返回的空行（避免每次都新建数组）。 */
const EMPTY_SIGN_LINES: readonly string[] = [];
/** 蛋糕每一口回多少饥饿与饱和度（1.8.9 为 2 点饥饿）。 */
const CAKE_SLICE_HUNGER = 2;
const CAKE_SLICE_SATURATION = 0.4;
/** 可以直接扔出去的物品。 */
const THROWN_ITEM_IDS: ReadonlySet<string> = new Set(['snowball', 'egg']);
/** 扔一次的冷却（tick）。 */
const THROW_COOLDOWN_TICKS = 4;
/** 雪球只对烈焰人有伤害（1.8.9 为 3 点）。 */
const SNOWBALL_BLAZE_DAMAGE = 3;
/** 鸡蛋砸地后孵出小鸡的概率（1.8.9 为 1/8）。 */
const EGG_HATCH_CHANCE = 1 / 8;
/** 喷溅药水碎掉时的玻璃碎屑。 */
const SPLASH_PARTICLE_TEXTURE = 'glass';
const SPLASH_PARTICLE_COUNT = 10;

/**
 * 漏斗朝向对应的目标格偏移。meta 0~3 是水平四向（同 FACINGS），其余值表示朝下。
 */
function hopperTargetOffset(meta: number): [number, number, number] {
  if (meta >= FACINGS.length) {
    return [0, -1, 0];
  }
  const [dx, dz] = FACINGS[meta & FACING_MASK];
  return [dx, 0, dz];
}

/** 中继器 meta 对应的延迟 tick。 */
function repeaterDelay(meta: number): number {
  return REPEATER_DELAYS[(meta >> REPEATER_DELAY_SHIFT) & REPEATER_DELAY_MASK];
}

/** 把方向向量说成"东南"这样的方位词。 */
function compassLabel(dx: number, dz: number): string {
  if (Math.abs(dz) > Math.abs(dx) * COMPASS_DOMINANCE) {
    return dz > 0 ? '南' : '北';
  }
  if (Math.abs(dx) > Math.abs(dz) * COMPASS_DOMINANCE) {
    return dx > 0 ? '东' : '西';
  }
  if (dx > 0) {
    return dz > 0 ? '东南' : '东北';
  }
  return dz > 0 ? '西南' : '西北';
}

/** 游戏主循环与全部玩法逻辑的编排者。 */
/** 可改的游戏规则名。 */
export type GameRuleName = 'keepInventory' | 'doDaylightCycle' | 'doMobSpawning' | 'mobGriefing';

export class Game implements EntityContext, ContainerHost, CommandHost {
  readonly player = new Player();
  readonly store: Store<GameUiState>;
  readonly meta: WorldMeta;
  /** 当前模式规则（/gamemode 可改）。 */
  rules: GameModeRules;
  /** 当前难度（/difficulty 可改）。 */
  difficulty: Difficulty;
  /** 各维度的世界数据；只有玩家所在的维度会 tick 与渲染。 */
  private readonly dimensions = new Map<DimensionId, Dimension>();
  /** 玩家当前所在维度。 */
  private current: Dimension;
  readonly craftingGrid: (ItemStack | null)[] = new Array<ItemStack | null>(CRAFT_GRID_SIZE).fill(null);
  craftGridSize = 2;
  readonly enchantingSlots: (ItemStack | null)[] = new Array<ItemStack | null>(ENCHANTING_SLOT_COUNT).fill(null);
  readonly anvilSlots: (ItemStack | null)[] = new Array<ItemStack | null>(ANVIL_SLOT_COUNT).fill(null);
  /** 铁砧界面里输入框的新名字（空串 = 不改名）。 */
  private anvilNameText = '';
  /** 附魔台：本次打开的随机种子（附魔一次后重掷）与选项缓存。 */
  private enchantSeed = 0;
  private enchantOptionsCache: { key: string; options: EnchantOption[] | null } | null = null;
  private enchantShelves = 0;
  tick = 0;
  timeTick = INITIAL_TIME_TICK;

  // ---------------------------------------------------------------- 维度委托
  // 世界数据都归当前维度所有；下面这些 getter 让其余代码继续用 this.world / this.entities 的写法。

  /** 当前维度的方块与光照数据。 */
  get world(): World {
    return this.current.world;
  }

  /** 当前维度里的实体。 */
  get entities(): Map<number, Entity> {
    return this.current.entities;
  }

  /** 当前维度的方块实体（熔炉 / 箱子等附着在坐标上的状态）。 */
  get blockEntities(): BlockEntityStore {
    return this.current.blockEntities;
  }

  /** 当前维度。 */
  get dimension(): Dimension {
    return this.current;
  }

  /** 天空亮度系数（DimensionHost；渲染器就绪前按满亮度算）。 */
  get skyLevel(): number {
    return this.renderer?.sky.skyLevel ?? 1;
  }

  /** 当前日光系数 0~1（夜里为 0），供日光传感器用。 */
  get daylight(): number {
    return daylightAt(this.timeTick);
  }

  private get generator(): ChunkGenerator {
    return this.current.generator;
  }

  private get chunkManager(): ChunkManager {
    return this.current.chunkManager;
  }

  private get fluids(): FluidSimulator {
    return this.current.fluids;
  }

  private get randomTicks(): RandomTickSystem {
    return this.current.randomTicks;
  }

  /**
   * 取（必要时新建）某个维度。各维度共用世界种子，所以同一个存档的下界 / 末地也是确定的。
   */
  private dimensionOf(id: DimensionId): Dimension {
    const existing = this.dimensions.get(id);
    if (existing) {
      return existing;
    }
    const generator =
      this.isNetworkClient && id === DimensionId.OVERWORLD
        ? new RemoteGenerator(this.meta.seed, (cx, cz) => this.requestChunkFromServer(cx, cz), this.player)
        : createDimensionGenerator(id, this.meta);
    const dimension = new Dimension(DIMENSION_DEFS[id], generator, this);
    dimension.world.onChunkLoad((chunk) => this.applyPendingBlockEntities(chunk));
    dimension.world.onBlockChange((x, y, z, oldId, newId) => {
      // 水流 / 火 / 作物每 tick 大量 setBlock，只有变更点周围真有红石元件时才值得跑一遍红石重算
      if (getBlock(oldId).redstone || getBlock(newId).redstone || this.hasRedstoneNeighbor(x, y, z)) {
        this.onRedstoneRelevantChange(x, y, z);
      }
    });
    dimension.world.onChunkUnload((chunk) => this.onChunkUnloaded(chunk));
    this.dimensions.set(id, dimension);
    return dimension;
  }

  /** 天气（构造函数里在 rng 就绪后创建）。 */
  readonly weather: WeatherSystem;
  /** 成就与统计。 */
  readonly achievements = new AchievementSystem((def) => this.showToast(`成就达成：${def.label}`));
  private readonly atlas: TextureAtlas;
  private readonly renderer: Renderer;
  private readonly controls: Controls;
  private readonly spawner = new MobSpawner();
  private readonly sound = new SoundManager();
  private readonly music = new MusicPlayer(this.sound);
  private readonly saveManager: SaveManager;
  private readonly onExit: () => void;
  private readonly rng: () => number;
  /** 上次交给 HUD 的效果列表及其对应的版本号（见 effectsForHud）。 */
  private hudEffects: ActiveEffect[] = EMPTY_EFFECTS;
  private hudEffectsVersion = -1;
  /** 上一次交给 HUD 的 Boss 血条快照，内容没变就复用引用避免重渲染。 */
  private hudBoss: BossStatus | null = null;
  private rafId = 0;
  private lastFrame = 0;
  private accumulator = 0;
  private running = false;
  /** 取消空闲时的图标预热。 */
  private cancelIconPrewarm: (() => void) | null = null;
  private isPaused = false;
  private isDisposed = false;
  private readonly unsubscribeSettings: () => void;
  /** 是否触屏设备（决定是否显示触屏按钮、是否请求指针锁定）。 */
  readonly isTouch = isTouchDevice();
  private breakTarget: { x: number; y: number; z: number; id: number } | null = null;
  /** 脚步声：累计走过的水平距离与上一次采样点。 */
  /** 联机客户端（单机为 null）。 */
  private net: NetClient | null = null;
  /** 作为主机时跑的服务端（没开放时为 null）。 */
  private hostServer: ServerCore | null = null;
  /** 正在等待回应码的那次邀请。 */
  private pendingInvite: RtcInvite | null = null;
  /** 已经尝试重连几次。 */
  private reconnectAttempts = 0;
  /** 已经收到服务端真数据的 chunk（本地空占位不算）。 */
  private readonly receivedChunks = new Set<number>();
  /** 连接建立前攒下的 chunk 请求。 */
  private readonly pendingChunkRequests: [number, number][] = [];
  /** 正在应用服务端下发的方块变更（避免又把它当成本地意图发回去）。 */
  private applyingRemoteChange = false;
  /** 启动时传入的联机参数（有值表示这局是联机客户端）。 */
  private readonly serverOptions: { url: string; playerName: string } | undefined;
  /** 是否以"联机客户端"的方式开局（地形来自服务端）。 */
  private readonly isNetworkClient: boolean;
  /** 聊天记录里的下一个 id 与打开聊天栏时的初始文本。 */
  private nextChatId = 1;
  private chatDraft = '';
  private readonly chatHistory: string[] = [];
  /** 游戏规则（/gamerule 可改）。 */
  private readonly gameRules: Record<GameRuleName, boolean> = {
    keepInventory: false,
    doDaylightCycle: true,
    doMobSpawning: true,
    mobGriefing: true,
  };
  /** 正在骑的矿车 id（没骑为 null）。 */
  private ridingCartId: number | null = null;
  /** 排队中的延迟更新（红石火把 / 中继器）。 */
  private scheduledUpdates: { x: number; y: number; z: number; ticks: number }[] = [];
  /** 按下的按钮（到时间弹回）。 */
  private pressedButtons: { x: number; y: number; z: number; ticks: number }[] = [];
  /** 拉弓已经拉了多少 tick；-1 表示没在拉。 */
  private bowDrawTicks = -1;
  /** 正在重算红石：避免 setBlock 触发的变更事件递归。 */
  private redstoneUpdating = false;
  /** 末影龙是否已被击败（决定走返回传送门时放不放终末之诗）。 */
  private dragonDefeated = false;
  /** 末地 Boss 战是否已布置过（每次进末地只布置一次）。 */
  private endFightStarted = false;
  /** 站在传送门里的累计 tick 与传送后的冷却。 */
  private portalTicks = 0;
  private portalCooldown = 0;
  private stepDistance = 0;
  private lastFootX = 0;
  private lastFootZ = 0;
  private breakProgressTicks = 0;
  private breakNeededTicks = 0;
  private creativeBreakDelay = 0;
  private attackCooldown = 0;
  private useCooldown = 0;
  private lastJumpPressAt = 0;
  private jumpWasDown = false;
  private toastTicks = 0;
  private debugEnabled = false;
  private fpsFrames = 0;
  private fpsLastSample = 0;
  private fps = 0;
  private primedTnt: { x: number; y: number; z: number; ticks: number }[] = [];
  private lastAutosaveTick = 0;
  private currentHit: RayHit | null = null;
  private spawnProtection = SPAWN_PROTECTION_TICKS;
  private renderDistance = DEFAULT_RENDER_DISTANCE;
  private saving: Promise<void> | null = null;
  private readonly containers: ContainerController;

  constructor(options: GameOptions) {
    this.meta = options.meta;
    this.saveManager = options.saveManager;
    this.onExit = options.onExit;
    this.serverOptions = options.server;
    this.isNetworkClient = options.server !== undefined || options.joinByCode === true;
    this.rules = getRules(options.meta.mode);
    this.difficulty = this.rules.forcedDifficulty ?? options.meta.difficulty;
    this.rng = createRng(hashString(`${options.meta.seed}:${Date.now()}`));
    this.weather = new WeatherSystem(this.rng);
    this.current = this.dimensionOf(DimensionId.OVERWORLD);
    this.atlas = new TextureAtlas();
    this.renderer = new Renderer(options.canvas, this.world, this.atlas, this.blockEntities);
    this.controls = new Controls(options.canvas, settingsStore.get());
    this.unsubscribeSettings = settingsStore.subscribe(() => {
      this.controls.setSettings(settingsStore.get());
      this.applyVolumes();
    });
    this.applyVolumes();
    this.store = new Store<GameUiState>({
      mode: options.meta.mode,
      health: this.player.health,
      maxHealth: this.player.maxHealth,
      food: this.player.food,
      air: this.player.air,
      armor: this.player.armorPoints,
      effects: [],
      maxAir: this.player.air,
      xpLevel: 0,
      xpProgress: 0,
      selectedSlot: 0,
      inventoryVersion: 0,
      signVersion: 0,
      screen: Screen.NONE,
      isPointerLocked: false,
      isFlying: false,
      isUnderwater: false,
      targetLabel: '',
      toast: '',
      achievementVersion: 0,
      boss: null,
      toastVersion: 0,
      chat: [],
      isChatOpen: false,
      debug: null,
      isLoading: true,
      loadingText: '生成世界中…',
      openBlock: null,
      deathMessage: '',
      isHardcoreDeath: false,
    });
    this.containers = new ContainerController(this);
    this.spawner.hostileEnabled = this.difficulty !== Difficulty.PEACEFUL;
    if (options.save) {
      this.loadFrom(options.save);
    } else {
      this.createNewWorld();
    }
    this.fluids.onWashed((x, y, z, id, meta) => this.onBlockWashed(x, y, z, id, meta));
    this.world.onChunkLoad((chunk) => this.applyPendingBlockEntities(chunk));
    this.world.onChunkUnload((chunk) => this.onChunkUnloaded(chunk));
    this.player.inventory.subscribe(() =>
      this.store.patch({ inventoryVersion: this.store.get().inventoryVersion + 1 }),
    );
    this.player.onPickupItem((id) => {
      this.showToast(`拾取：${getItem(id)?.label ?? id}`);
      this.achievements.onItemObtained(id);
    });
    this.bindControls();
  }

  // ---------------------------------------------------------------- 生命周期

  /** 开始游戏循环。 */
  start(): void {
    if (this.serverOptions) {
      // 联机：地形与方块都以服务端为准，连上之后再开始要 chunk
      void this.connectToServer(this.serverOptions.url, this.serverOptions.playerName);
    }
    if (this.running) {
      return;
    }
    this.running = true;
    this.controls.attach();
    this.lastFrame = performance.now();
    this.fpsLastSample = this.lastFrame;
    this.store.patch({ isLoading: false, loadingText: '' });
    this.cancelIconPrewarm = prewarmItemIcons(ITEM_DEFS.map((d) => d.id));
    const loop = (now: number): void => {
      if (!this.running) {
        return;
      }
      this.frame(now);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  /** 停止并释放。 */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    this.running = false;
    this.cancelIconPrewarm?.();
    cancelAnimationFrame(this.rafId);
    this.controls.exitLock();
    this.controls.detach();
    this.closeLanQuietly();
    this.unsubscribeSettings();
    this.renderer.dispose();
  }

  private createNewWorld(): void {
    const spawn = this.generator.findSpawn();
    this.chunkManager.ensureLoaded(spawn.x, spawn.z, SPAWN_PRELOAD_RADIUS);
    // 以实际生成结果修正出生高度（噪声高度与洞穴/树木可能有出入）
    spawn.y = this.world.getSurfaceY(Math.floor(spawn.x), Math.floor(spawn.z));
    this.player.spawnX = spawn.x;
    this.player.spawnY = spawn.y;
    this.player.spawnZ = spawn.z;
    this.player.setPosition(spawn.x, spawn.y, spawn.z);
    this.spawner.populateInitial(this);
    if (this.rules.mode === GameMode.CREATIVE) {
      return;
    }
  }

  private loadFrom(save: WorldSave): void {
    for (const data of save.chunks) {
      this.chunkManager.addLoadedChunk(deserializeChunk(data));
    }
    this.chunkManager.ensureLoaded(save.player.x, save.player.z, SPAWN_PRELOAD_RADIUS);
    this.tick = save.tick;
    this.timeTick = save.tick + INITIAL_TIME_TICK;
    this.player.load(save.player);
    resetEntityIds(save.nextEntityId);
    for (const data of save.entities) {
      const entity = this.deserializeEntity(data);
      if (entity) {
        this.entities.set(entity.id, entity);
      }
    }
    if (save.blockEntities) {
      this.blockEntities.load(save.blockEntities);
    } else if (save.furnaces) {
      // 旧存档只有熔炉，且键就是坐标
      for (const [key, state] of Object.entries(save.furnaces)) {
        const [x, y, z] = key.split(',').map(Number);
        this.blockEntities.set(x, y, z, { type: BlockEntityType.FURNACE, state });
      }
    }
    this.weather.load(save.weather);
    this.achievements.load(save.achievements);
    this.loadOtherDimensions(save);
    if (typeof save.timeTick === 'number') {
      this.timeTick = save.timeTick;
    }
    if (this.player.health <= 0) {
      this.player.respawn();
    }
  }

  /** 读入主世界以外的维度，并把玩家放回存档时所在的维度。 */
  private loadOtherDimensions(save: WorldSave): void {
    for (const data of save.dimensions ?? []) {
      if (data.id === DimensionId.OVERWORLD || !isDimensionId(data.id)) {
        continue;
      }
      const dimension = this.dimensionOf(data.id);
      for (const chunkData of data.chunks) {
        dimension.chunkManager.addLoadedChunk(deserializeChunk(chunkData, dimension.world.hasSkyLight));
      }
      for (const entityData of data.entities) {
        const entity = this.deserializeEntity(entityData);
        if (entity) {
          dimension.entities.set(entity.id, entity);
        }
      }
      dimension.blockEntities.load(data.blockEntities);
    }
    this.dragonDefeated = save.dragonDefeated === true;
    const playerDimension = save.playerDimension;
    if (playerDimension && isDimensionId(playerDimension) && playerDimension !== this.current.id) {
      const target = this.dimensionOf(playerDimension);
      this.current = target;
      this.renderer.setWorld(target.world, target.blockEntities);
      this.chunkManager.ensureLoaded(this.player.x, this.player.z, SPAWN_PRELOAD_RADIUS);
    }
  }

  private deserializeEntity(data: EntitySaveData): Entity | null {
    if (data.type === 'item') {
      return ItemDropEntity.deserialize(data);
    }
    if (data.type === 'xp_orb') {
      return XpOrbEntity.deserialize(data);
    }
    if (data.type === 'minecart') {
      return MinecartEntity.deserialize(data);
    }
    if (isMobType(data.type)) {
      return Mob.deserialize(data);
    }
    return null;
  }

  /** 生成存档对象。 */
  serialize(): WorldSave {
    const overworld = this.dimensionOf(DimensionId.OVERWORLD);
    const others: DimensionSaveData[] = [];
    for (const dimension of this.dimensions.values()) {
      if (dimension !== overworld) {
        others.push(this.serializeDimension(dimension));
      }
    }
    const overworldData = this.serializeDimension(overworld);
    return {
      version: SAVE_FORMAT_VERSION,
      meta: { ...this.meta, lastPlayed: Date.now() },
      tick: this.tick,
      timeTick: this.timeTick,
      // 主世界仍写在顶层，旧版本也能读
      chunks: overworldData.chunks,
      player: this.player.serialize(),
      entities: overworldData.entities,
      nextEntityId: allocateEntityId(),
      blockEntities: overworldData.blockEntities,
      weather: this.weather.serialize(),
      achievements: this.achievements.serialize(),
      dimensions: others,
      playerDimension: this.current.id,
      dragonDefeated: this.dragonDefeated,
    };
  }

  /** 序列化一个维度：被修改过的 chunk、可存档的实体与方块实体。 */
  private serializeDimension(dimension: Dimension): DimensionSaveData {
    const entities: EntitySaveData[] = [];
    for (const e of dimension.entities.values()) {
      if (e.isDead) {
        continue;
      }
      const data =
        e instanceof Mob || e instanceof ItemDropEntity || e instanceof XpOrbEntity || e instanceof MinecartEntity
          ? e.serialize()
          : null;
      if (data) {
        entities.push(data);
      }
    }
    return {
      id: dimension.id,
      chunks: dimension.world.listModifiedChunks().map(serializeChunk),
      entities,
      blockEntities: dimension.blockEntities.serialize(),
    };
  }

  /** 保存到 IndexedDB。 */
  async save(): Promise<void> {
    if (this.saving) {
      return this.saving;
    }
    this.saving = this.saveManager
      .save(this.serialize())
      .then(() => this.showToast('已保存'))
      .catch((err: unknown) => {
        this.showToast(`保存失败：${err instanceof Error ? err.message : String(err)}`);
        throw err;
      })
      .finally(() => {
        this.saving = null;
      });
    return this.saving;
  }

  /** 保存并退出到主菜单。 */
  async saveAndExit(): Promise<void> {
    try {
      await this.save();
    } catch {
      // 已通过 toast 提示，仍允许退出
    }
    this.dispose();
    this.onExit();
  }

  /** 极限模式死亡：删档并退出。 */
  async deleteAndExit(): Promise<void> {
    try {
      await this.saveManager.remove(this.meta.id);
    } catch (err) {
      this.showToast(`删除存档失败：${err instanceof Error ? err.message : String(err)}`);
    }
    this.dispose();
    this.onExit();
  }

  // ---------------------------------------------------------------- 主循环

  private frame(now: number): void {
    const dtRaw = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    const dt = Math.min(MAX_FRAME_DT, dtRaw);
    this.fpsFrames++;
    if (now - this.fpsLastSample >= FPS_SAMPLE_MS) {
      this.fps = Math.round((this.fpsFrames * 1000) / (now - this.fpsLastSample));
      this.fpsFrames = 0;
      this.fpsLastSample = now;
    }
    if (!this.isPaused) {
      this.accumulator += dt * 1000;
      let ticks = 0;
      while (this.accumulator >= TICK_MS && ticks < MAX_TICKS_PER_FRAME) {
        this.logicTick();
        this.accumulator -= TICK_MS;
        ticks++;
      }
      if (ticks === MAX_TICKS_PER_FRAME) {
        this.accumulator = 0;
      }
      // 骑矿车时玩家由车带着走，不自己移动
      if (!this.isRiding) {
        this.updatePlayerMovement(dt);
      }
      for (const e of this.entities.values()) {
        if (this.isEntityChunkLoaded(e)) {
          e.move(this, dt);
        }
      }
    }
    this.chunkManager.update(this.player.x, this.player.z, this.renderDistance);
    this.updateCamera();
    this.renderer.chunks.update(this.player.x, this.player.z);
    const minLight = this.minLight();
    this.renderer.entities.updateRemotePlayers(this.remotePlayers);
    // 联机客户端的生物 / 掉落物都来自服务端快照
    if (this.net) {
      this.renderer.entities.updateRemoteEntities(this.net.entities);
    }
    this.renderer.entities.update(
      this.entities.values(),
      this.renderer.sky.skyLevel,
      now / 1000,
      this.player.yaw,
      minLight,
    );
    const hit = this.currentHit;
    this.renderer.outline.set(
      hit,
      hit ? this.outlineBoxAt(hit.x, hit.y, hit.z) : FULL_BOX,
      this.breakNeededTicks > 0 ? this.breakProgressTicks / this.breakNeededTicks : 0,
    );
    const brightness = this.brightnessAtPlayer();
    this.renderer.particles.update(dt);
    this.renderer.signs.update(this.player.x, this.player.eyeY, this.player.z);
    this.renderer.hand.update(this.player.heldItem?.id ?? null, brightness);
    this.renderer.render(
      this.timeTick,
      this.isPlayerUnderwater(),
      this.current.def.hasWeather ? this.weather.rainLevel : 0,
      minLight,
      DIMENSION_SKY_COLORS[this.current.id],
    );
    this.music.update(this.rng);
  }

  private logicTick(): void {
    this.tick++;
    this.timeTick++;
    if (this.attackCooldown > 0) {
      this.attackCooldown--;
    }
    if (this.useCooldown > 0) {
      this.useCooldown--;
    }
    if (this.spawnProtection > 0) {
      this.spawnProtection--;
    }
    if (this.toastTicks > 0) {
      this.toastTicks--;
      if (this.toastTicks === 0) {
        this.store.patch({ toast: '' });
      }
    }
    if (this.player.health > 0) {
      this.player.tick(this);
      this.player.tickSurvival(this, this.rules, this.rules.mode === GameMode.HARDCORE);
      this.handleHeldMouse();
    }
    for (const e of this.entities.values()) {
      if (this.isEntityChunkLoaded(e)) {
        e.tick(this);
      }
    }
    for (const [id, e] of this.entities) {
      if (e.isDead) {
        this.entities.delete(id);
      }
    }
    this.resolveSplashImpacts();
    this.resolveThrownItems();
    this.mergeItemDrops();
    this.spawner.tick(this, this.entities.values());
    this.tickTnt();
    this.tickFurnaces();
    this.achievements.tickPlayTime();
    this.tickSpawners();
    this.tickGravityBlocks();
    this.randomTicks.tick(this.player.x, this.player.z);
    this.current.daylightSensors.tick();
    this.current.comparators.tick();
    this.weather.tick();
    this.tickWeatherEffects();
    this.tickBreeding();
    if (this.tick % WATER_TICK_INTERVAL === 0) {
      this.fluids.tick();
    }
    if (this.player.health <= 0 && this.store.get().screen !== Screen.DEATH) {
      this.onPlayerDeath();
    }
    if (this.tick - this.lastAutosaveTick >= AUTOSAVE_INTERVAL_TICKS) {
      this.lastAutosaveTick = this.tick;
      this.save().catch(() => {
        /* toast 已提示 */
      });
    }
    this.tickRedstone();
    this.tickHoppers();
    this.tickRiding();
    this.tickNetwork();
    this.tickHosting();
    this.tickBeacons();
    this.tickPortal();
    this.tickFootsteps();
    this.tickDigSound();
    this.music.underground = this.isPlayerUnderground();
    this.sound.update();
    this.syncStore();
  }

  /** 玩家是否在昏暗的地下（洞穴环境音的触发条件）。 */
  private isPlayerUnderground(): boolean {
    const p = this.player;
    const x = Math.floor(p.x);
    const z = Math.floor(p.z);
    return (
      p.y < this.world.getHeight(x, z) - UNDERGROUND_DEPTH &&
      this.lightLevelAt(x, Math.floor(p.eyeY), z) < UNDERGROUND_MAX_LIGHT
    );
  }

  /** 把设置里的三档音量同步给音频总线。 */
  private applyVolumes(): void {
    const s = settingsStore.get();
    this.sound.setVolumes(s.masterVolume, s.sfxVolume, s.musicVolume);
  }

  /** 播放一个方块材质音效（按与玩家的距离衰减）。 */
  private playBlockSound(spec: SoundSpec, x: number, y: number, z: number, dedupeKey: string): void {
    const distance = Math.hypot(x + 0.5 - this.player.x, y + 0.5 - this.player.y, z + 0.5 - this.player.z);
    this.sound.playSpec(spec, distance, 1, 1, dedupeKey);
  }

  /**
   * 脚步声：按走过的水平距离触发，声音取脚下方块的材质。
   * 潜行时不出声（与 1.8.9 一致），空中与水里也不出声。
   */
  private tickFootsteps(): void {
    const p = this.player;
    if (!p.onGround || p.isSneaking || p.inWater) {
      this.stepDistance = 0;
      this.lastFootX = p.x;
      this.lastFootZ = p.z;
      return;
    }
    this.stepDistance += Math.hypot(p.x - this.lastFootX, p.z - this.lastFootZ);
    this.lastFootX = p.x;
    this.lastFootZ = p.z;
    if (this.stepDistance < FOOTSTEP_INTERVAL_BLOCKS) {
      return;
    }
    this.stepDistance = 0;
    const below = getBlock(this.world.getBlock(Math.floor(p.x), Math.floor(p.y - 0.1), Math.floor(p.z)));
    if (below.id === BlockId.AIR) {
      return;
    }
    this.sound.playSpec(stepSound(soundGroupOf(below)), 0, 1, 1, 'step');
  }

  /** 挖掘过程中每隔几 tick 播一下碎响。 */
  private tickDigSound(): void {
    if (!this.breakTarget || this.tick % DIG_SOUND_INTERVAL_TICKS !== 0) {
      return;
    }
    const { x, y, z, id } = this.breakTarget;
    this.playBlockSound(digSound(soundGroupOf(getBlock(id))), x, y, z, 'dig');
  }

  /**
   * 玩家站在传送门里够久就传送。冷却期间（刚传送过来）站着不动不会被弹回去。
   */
  private tickPortal(): void {
    if (this.portalCooldown > 0) {
      this.portalCooldown--;
      this.portalTicks = 0;
      return;
    }
    const p = this.player;
    const standingIn = this.world.getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
    if (standingIn !== BlockId.NETHER_PORTAL && standingIn !== BlockId.END_PORTAL) {
      this.portalTicks = 0;
      return;
    }
    // 末地传送门比下界的快，但也要站一小会儿：返回传送门就开在玩家脚下，不能一出现就把人吸走
    this.portalTicks++;
    const needed = standingIn === BlockId.END_PORTAL ? END_PORTAL_TRIGGER_TICKS : PORTAL_TRIGGER_TICKS;
    if (this.portalTicks < needed) {
      return;
    }
    this.portalTicks = 0;
    if (standingIn === BlockId.END_PORTAL) {
      this.travelThroughEndPortal();
      return;
    }
    this.travelThroughPortal();
  }

  /** 走一次下界传送门：主世界 ↔ 下界互换。 */
  private travelThroughPortal(): void {
    const from = this.current;
    const targetId = from.id === DimensionId.NETHER ? DimensionId.OVERWORLD : DimensionId.NETHER;
    const target = this.dimensionOf(targetId);
    const x = mapCoordinate(Math.floor(this.player.x), from.def, target.def);
    const z = mapCoordinate(Math.floor(this.player.z), from.def, target.def);
    const y = Math.floor(this.player.y);
    this.enterDimension(target, x, y, z, true);
  }

  /** 末地传送门：主世界 → 末地落在主岛上；末地 → 主世界回到重生点。 */
  private travelThroughEndPortal(): void {
    if (this.current.id === DimensionId.END) {
      const target = this.dimensionOf(DimensionId.OVERWORLD);
      this.enterDimension(
        target,
        Math.floor(this.player.spawnX),
        Math.floor(this.player.spawnY),
        Math.floor(this.player.spawnZ),
        false,
      );
      // 打完龙之后从返回传送门走，才放终末之诗（还没打龙就掉进传送门不算通关）
      if (this.dragonDefeated) {
        this.openScreen(Screen.CREDITS);
      }
      return;
    }
    const target = this.dimensionOf(DimensionId.END);
    const spawn = target.generator.findSpawn();
    this.enterDimension(
      target,
      Math.floor(spawn.x),
      Math.floor(spawn.y) + END_ARRIVAL_HEIGHT,
      Math.floor(spawn.z),
      false,
    );
  }

  /**
   * 切换到某个维度并把玩家放到 (x, y, z) 附近。
   * @param usePortal 是否找 / 造一座传送门作为落点（末地那种直接落地的传送传 false）
   */
  private enterDimension(target: Dimension, x: number, y: number, z: number, usePortal: boolean): void {
    if (target === this.current) {
      return;
    }
    this.current = target;
    this.renderer.setWorld(target.world, target.blockEntities);
    this.chunkManager.ensureLoaded(x, z, PORTAL_LOAD_RADIUS);
    let spot = { x: x + 0.5, y, z: z + 0.5 };
    if (usePortal) {
      const existing = findExistingPortal(target.world, x, y, z, PORTAL_SEARCH_RADIUS_LOADED);
      const portal = existing ?? buildPortal(target.world, x, y, z, target.id);
      spot = { x: portal.x + 0.5, y: portal.y, z: portal.z + 0.5 };
    }
    this.player.setPosition(spot.x, spot.y, spot.z);
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.vz = 0;
    this.portalCooldown = PORTAL_COOLDOWN_TICKS;
    this.chunkManager.ensureLoaded(this.player.x, this.player.z, PORTAL_LOAD_RADIUS);
    if (target.id === DimensionId.END) {
      this.setupEndFight();
    }
    this.achievements.onEnterDimension(target.id);
    this.showToast(`进入${target.def.label}`);
  }

  /**
   * 进入末地时布置 Boss 战：每根黑曜石柱顶放一颗末影水晶，岛心上空放末影龙。
   * 已经打过（龙不在且没水晶）就什么都不做。
   */
  private setupEndFight(): void {
    const generator = this.generator;
    if (!(generator instanceof EndGenerator) || this.endFightStarted) {
      return;
    }
    this.endFightStarted = true;
    for (const pillar of generator.pillars) {
      const crystal = new EnderCrystalEntity();
      crystal.setPosition(pillar.x + 0.5, pillar.topY + 1, pillar.z + 0.5);
      this.entities.set(crystal.id, crystal);
    }
    const dragon = new EnderDragonEntity(END_ISLAND_CENTER_X, END_ISLAND_CENTER_Z);
    dragon.setPosition(
      END_ISLAND_CENTER_X + DRAGON_CIRCLE_RADIUS,
      END_ISLAND_SURFACE_Y + DRAGON_CRUISE_HEIGHT,
      END_ISLAND_CENTER_Z,
    );
    this.entities.set(dragon.id, dragon);
  }

  /** Boss 血条内容（当前维度里活着的末影龙）。 */
  /** Boss 血条：只有 label / ratio 变化时才换新对象，让 Store 的浅比较能挡住无变化的 tick。 */
  private bossStatusForHud(): BossStatus | null {
    const next = this.bossStatus();
    const prev = this.hudBoss;
    if (next === null || prev === null || prev.label !== next.label || prev.ratio !== next.ratio) {
      this.hudBoss = next;
    }
    return this.hudBoss;
  }

  private bossStatus(): BossStatus | null {
    for (const e of this.entities.values()) {
      if (e instanceof EnderDragonEntity && !e.isDead && e.health > 0) {
        return { label: '末影龙', ratio: e.healthRatio };
      }
      if (e instanceof WitherEntity && !e.isDead && e.health > 0) {
        return { label: '凋灵', ratio: e.healthRatio };
      }
    }
    return null;
  }

  /**
   * 挥手打碎准星附近的末影水晶。
   * @returns 是否打到了水晶
   */
  private tryBreakCrystal(): boolean {
    const dir = this.lookDirection();
    const p = this.player;
    const origin = new THREE.Vector3(p.x, p.eyeY, p.z);
    const ray = new THREE.Ray(origin, dir);
    for (const e of this.entities.values()) {
      if (!(e instanceof EnderCrystalEntity) || e.isDead) {
        continue;
      }
      const center = new THREE.Vector3(e.x, e.y, e.z);
      if (origin.distanceTo(center) > this.rules.reach + CRYSTAL_EXTRA_REACH) {
        continue;
      }
      if (ray.distanceToPoint(center) > CRYSTAL_HIT_TOLERANCE) {
        continue;
      }
      e.destroyByAttack(this, p.id);
      this.attackCooldown = ATTACK_COOLDOWN_TICKS;
      this.renderer.hand.swing();
      return true;
    }
    return false;
  }

  /** 末影龙被打死：给经验、开返回传送门、放龙蛋、解成就。 */
  private onDragonKilled(dragon: EnderDragonEntity): void {
    this.dragonDefeated = true;
    this.dropXp(dragon.x, END_ISLAND_SURFACE_Y + 2, dragon.z, DRAGON_KILL_XP);
    this.buildExitPortal();
    this.achievements.onDragonKilled();
    this.showToast('末影龙被击败了！');
  }

  /** 岛心开一个返回主世界的传送门，正中放一颗龙蛋。 */
  private buildExitPortal(): void {
    const cx = END_ISLAND_CENTER_X;
    const cz = END_ISLAND_CENTER_Z;
    const y = END_ISLAND_SURFACE_Y;
    for (let dz = -EXIT_PORTAL_RADIUS; dz <= EXIT_PORTAL_RADIUS; dz++) {
      for (let dx = -EXIT_PORTAL_RADIUS; dx <= EXIT_PORTAL_RADIUS; dx++) {
        const inside = Math.abs(dx) + Math.abs(dz) <= EXIT_PORTAL_RADIUS;
        if (!inside) {
          continue;
        }
        this.world.setBlock(cx + dx, y, cz + dz, BlockId.OBSIDIAN);
        this.world.setBlock(cx + dx, y + 1, cz + dz, BlockId.END_PORTAL);
      }
    }
    this.world.setBlock(cx, y + 2, cz, BlockId.DRAGON_EGG);
  }

  /** 当前维度 id（存档与调试面板用）。 */
  get dimensionId(): DimensionId {
    return this.current.id;
  }

  // ---------------------------------------------------------------- 联机

  /** 是否处于联机模式。 */
  get isMultiplayer(): boolean {
    return this.net !== null;
  }

  /** 其他玩家（渲染用）：既包括自己作为客户端看到的，也包括自己作为主机接进来的。 */
  get remotePlayers(): readonly RemotePlayer[] {
    if (this.net) {
      return this.net.remotePlayers;
    }
    return this.hostGuestsAsRemotePlayers();
  }

  /** 连接服务端；失败会在聊天栏提示。 */
  async connectToServer(url: string, playerName: string): Promise<void> {
    try {
      this.net = await connectToServer(url, playerName, this.netHandlers());
      // 连上了就把重连计数清零，下次掉线还能再自动拨几次
      this.reconnectAttempts = 0;
      // 重连后世界数据要重新要一遍（服务端不记得给过我们哪些 chunk）
      this.receivedChunks.clear();
      for (const chunk of this.world.chunks.values()) {
        this.net.requestChunk(chunk.cx, chunk.cz);
      }
      this.reply(`已连接到 ${url}`);
    } catch (error) {
      this.reply(`连接失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 用已经建立好的传输通道加入（房间码方式）：与连 WebSocket 服务端走同一套客户端逻辑。
   */
  joinWithTransport(transport: ClientTransport, playerName: string): void {
    this.net = new NetClient(transport, this.netHandlers(), playerName);
    this.reply('已通过房间码加入');
  }

  /**
   * 掉线后自动重连（只对"连服务器地址"的方式有效；房间码方式没有可重拨的地址）。
   * 退避重试几次，都失败就放弃并提示玩家。
   */
  private scheduleReconnect(): void {
    const options = this.serverOptions;
    if (!options || this.isDisposed || this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      if (options && this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        this.reply('重连失败，请回主菜单重新加入');
      }
      return;
    }
    this.reconnectAttempts++;
    const delay = RECONNECT_BASE_DELAY_MS * this.reconnectAttempts;
    this.reply(`${delay / 1000} 秒后尝试第 ${this.reconnectAttempts} 次重连…`);
    window.setTimeout(() => {
      if (this.isDisposed || this.net) {
        return;
      }
      void this.connectToServer(options.url, options.playerName);
    }, delay);
  }

  /** 客户端事件的处理器（连 WebSocket 与连房间码共用）。 */
  private netHandlers(): NetClientHandlers {
    return {
      onWelcome: (message) => this.onNetWelcome(message),
      onChunkData: (cx, cz, blocks, meta) => this.onNetChunkData(cx, cz, blocks, meta),
      onBlockChange: (x, y, z, blockId, meta) => this.onNetBlockChange(x, y, z, blockId, meta),
      onChat: (text) => this.reply(text),
      onTimeSync: (timeTick) => {
        this.timeTick = timeTick;
      },
      onPlayersChanged: () => {
        /* 渲染时直接读 remotePlayers，这里不用做别的 */
      },
      onEntitySnapshot: () => {
        /* 渲染时直接读 net.entities，这里不用做别的 */
      },
      onDisconnect: () => {
        this.net = null;
        this.reply('与服务端的连接已断开');
        this.scheduleReconnect();
      },
    };
  }

  /**
   * 向服务端要一个 chunk。连接还没建好时先记下来，握手完成后统一补发 ——
   * 否则开局那批在连接建立前生成的空 chunk 会永远是空的。
   */
  private requestChunkFromServer(cx: number, cz: number): void {
    if (this.net) {
      this.net.requestChunk(cx, cz);
      return;
    }
    this.pendingChunkRequests.push([cx, cz]);
  }

  /** 握手完成：按服务端给的出生点落地。 */
  private onNetWelcome(message: WelcomeMessage): void {
    this.timeTick = message.timeTick;
    this.player.setPosition(message.x, message.y, message.z);
    this.player.spawnX = message.x;
    this.player.spawnY = message.y;
    this.player.spawnZ = message.z;
    // 补发连接建立前攒下的 chunk 请求
    for (const [cx, cz] of this.pendingChunkRequests) {
      this.net?.requestChunk(cx, cz);
    }
    this.pendingChunkRequests.length = 0;
    this.reply(`已加入世界（种子 ${message.seed}）`);
  }

  /** 服务端下发 chunk：用真数据替换本地的空占位。 */
  private onNetChunkData(cx: number, cz: number, blocks: Uint32Array, meta: Uint32Array): void {
    const chunk = deserializeChunk({ cx, cz, blocks, meta }, this.world.hasSkyLight);
    this.chunkManager.addLoadedChunk(chunk);
    this.receivedChunks.add(chunkKey(cx, cz));
  }

  /** 服务端确认的方块变更（包括自己刚才那一下）。 */
  private onNetBlockChange(x: number, y: number, z: number, blockId: number, meta: number): void {
    this.applyingRemoteChange = true;
    try {
      this.world.setBlock(x, y, z, blockId, meta);
    } finally {
      this.applyingRemoteChange = false;
    }
  }

  /** 每 tick 上报位置。 */
  private tickNetwork(): void {
    const net = this.net;
    if (!net || this.tick % MOVE_REPORT_INTERVAL_TICKS !== 0) {
      return;
    }
    const p = this.player;
    net.reportMove(p.x, p.y, p.z, p.yaw, p.pitch);
  }

  /** 作为主机时定期给客人同步时间。 */
  private tickHosting(): void {
    if (!this.hostServer) {
      return;
    }
    if (this.tick % HOST_TIME_SYNC_TICKS === 0) {
      this.hostServer.syncTime();
    }
    if (this.tick % HOST_ENTITY_SYNC_TICKS === 0) {
      this.hostServer.syncEntities();
      this.hostServer.syncHostPlayer();
    }
  }

  /**
   * 联机时把改方块的意图发给服务端，本地先不动手。
   * @returns 是否已交给服务端（true 表示调用方不要再改本地世界）
   */
  private sendBlockIntent(x: number, y: number, z: number, blockId: number, meta: number): boolean {
    if (!this.net || this.applyingRemoteChange) {
      return false;
    }
    if (blockId === BlockId.AIR) {
      this.net.requestBreak(x, y, z);
    } else {
      this.net.requestPlace(x, y, z, blockId, meta);
    }
    return true;
  }

  // ---------------------------------------------------------------- 作为主机开放局域网

  /** 是否已经对局域网开放。 */
  get isHosting(): boolean {
    return this.hostServer !== null;
  }

  /** 通过房间码连进来的客人数。 */
  get guestCount(): number {
    return this.hostServer?.playerCount ?? 0;
  }

  /**
   * 对局域网开放：在自己这局游戏上跑一个服务端，别人用房间码接进来。
   * @returns 要交给客人的房间码
   */
  async openToLan(): Promise<string> {
    this.hostServer ??= new ServerCore({
      world: this.world,
      chunkManager: this.chunkManager,
      seed: this.meta.seed,
      worldType: this.meta.worldType ?? WorldType.DEFAULT,
      currentTime: () => this.timeTick,
      spawnPoint: () => ({ x: this.player.x, y: this.player.y, z: this.player.z }),
      hostPlayer: () => ({
        name: '房主',
        x: this.player.x,
        y: this.player.y,
        z: this.player.z,
        yaw: this.player.yaw,
        pitch: this.player.pitch,
      }),
      entities: () =>
        [...this.entities.values()]
          .filter((e) => !e.isDead)
          .map((e) => ({ id: e.id, kind: e.type, x: e.x, y: e.y, z: e.z, yaw: e.yaw })),
      onBroadcast: (message) => {
        // 主机自己不在服务端的玩家表里，聊天要单独显示一份
        if (message.type === MessageType.CHAT_BROADCAST) {
          this.addChatMessage(message.text);
        }
      },
    });
    const invite = new RtcInvite();
    this.pendingInvite = invite;
    const code = await invite.createCode();
    this.reply('已生成房间码，把它发给朋友，再把对方的回应码填回来');
    return code;
  }

  /**
   * 填入客人的回应码，完成连接。
   * @returns 是否连上了
   */
  async acceptGuest(answerCode: string): Promise<boolean> {
    const invite = this.pendingInvite;
    const server = this.hostServer;
    if (!invite || !server) {
      return false;
    }
    try {
      const guest = await invite.acceptAnswer(answerCode);
      const playerId = server.addConnection(guest.connection);
      guest.onMessage((bytes) => server.handleMessage(playerId, bytes));
      guest.onClose(() => server.removeConnection(playerId));
      this.pendingInvite = null;
      this.reply('有玩家加入了你的世界');
      return true;
    } catch (error) {
      this.reply(`加入失败：${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /** 退出游戏时静默关掉（不往聊天栏写东西）。 */
  private closeLanQuietly(): void {
    this.pendingInvite?.close();
    this.pendingInvite = null;
    this.hostServer?.dispose();
    this.hostServer = null;
    this.net?.dispose();
    this.net = null;
  }

  /** 关闭局域网开放。 */
  closeLan(): void {
    this.pendingInvite?.close();
    this.pendingInvite = null;
    this.hostServer?.dispose();
    this.hostServer = null;
    this.reply('已关闭局域网开放');
  }

  /** 作为主机时，把在线客人的位置也画出来。 */
  private hostGuestsAsRemotePlayers(): RemotePlayer[] {
    const server = this.hostServer;
    if (!server) {
      return [];
    }
    return server.onlinePlayers.map((p) => ({
      id: p.id,
      name: p.name,
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: p.yaw,
      pitch: p.pitch,
    }));
  }

  // ---------------------------------------------------------------- 聊天与指令

  /** 打开聊天栏（带一个初始文本，如 "/"）。 */
  openChat(initial = ''): void {
    this.chatDraft = initial;
    this.isPaused = false;
    this.controls.exitLock();
    this.store.patch({ isChatOpen: true });
  }

  /** 关闭聊天栏。 */
  closeChat(): void {
    this.store.patch({ isChatOpen: false });
    this.requestPointerLock();
  }

  /** 聊天栏里的初始文本（打开时用）。 */
  get chatInitialText(): string {
    const draft = this.chatDraft;
    this.chatDraft = '';
    return draft;
  }

  /** 提交一条聊天 / 指令。 */
  submitChat(text: string): void {
    const trimmed = text.trim();
    this.closeChat();
    if (!trimmed) {
      return;
    }
    this.chatHistory.push(trimmed);
    if (this.chatHistory.length > CHAT_HISTORY_LIMIT) {
      this.chatHistory.shift();
    }
    if (!trimmed.startsWith('/')) {
      // 作为客户端：交给服务端广播（自己也会收到回声）
      if (this.net) {
        this.net.sendChat(trimmed);
        return;
      }
      // 作为主机：直接广播给客人（onBroadcast 会让自己也看到一份）
      if (this.hostServer) {
        this.hostServer.broadcast({ type: MessageType.CHAT_BROADCAST, text: `<房主> ${trimmed}` });
        return;
      }
      this.addChatMessage(`<玩家> ${trimmed}`);
      return;
    }
    const reply = runCommand(this, trimmed);
    if (reply) {
      this.addChatMessage(reply);
    }
  }

  /** 之前输入过的聊天 / 指令（聊天栏按上下键翻）。 */
  get chatHistoryList(): readonly string[] {
    return this.chatHistory;
  }

  /** 往聊天栏加一行。 */
  private addChatMessage(text: string): void {
    const chat = [...this.store.get().chat, { id: this.nextChatId++, text, tick: this.tick }];
    if (chat.length > CHAT_MESSAGE_LIMIT) {
      chat.splice(0, chat.length - CHAT_MESSAGE_LIMIT);
    }
    this.store.patch({ chat });
  }

  // ---- CommandHost 实现

  reply(message: string): void {
    this.addChatMessage(message);
  }

  playerPosition(): { x: number; y: number; z: number } {
    return { x: Math.floor(this.player.x), y: Math.floor(this.player.y), z: Math.floor(this.player.z) };
  }

  teleport(x: number, y: number, z: number): void {
    this.chunkManager.ensureLoaded(x, z, PORTAL_LOAD_RADIUS);
    this.player.setPosition(x + 0.5, y, z + 0.5);
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.vz = 0;
  }

  setGameMode(mode: GameMode): void {
    this.rules = getRules(mode);
    this.difficulty = this.rules.forcedDifficulty ?? this.difficulty;
    this.spawner.hostileEnabled = this.rules.mobsHostile && this.difficulty !== Difficulty.PEACEFUL;
    this.store.patch({ mode });
  }

  setDifficulty(difficulty: Difficulty): void {
    this.difficulty = difficulty;
    this.spawner.hostileEnabled = this.rules.mobsHostile && difficulty !== Difficulty.PEACEFUL;
  }

  setTime(tick: number): void {
    // 保留已经过去的天数，只改一天之内的时刻
    const days = Math.floor(this.timeTick / COMMAND_DAY_LENGTH);
    this.timeTick = days * COMMAND_DAY_LENGTH + tick;
  }

  addTime(tick: number): void {
    this.timeTick += tick;
  }

  currentTime(): number {
    return this.timeTick;
  }

  setWeather(weather: Weather, ticks?: number): void {
    this.weather.set(weather, ticks);
  }

  giveItem(stack: ItemStack): void {
    const remaining = this.player.inventory.add(stack);
    if (remaining > 0) {
      this.dropItem(this.player.x, this.player.y + 1, this.player.z, { ...stack, count: remaining });
    }
    this.notifyChanged();
  }

  clearInventory(): void {
    this.player.inventory.drainAll();
    this.notifyChanged();
  }

  killMobs(): number {
    let count = 0;
    for (const e of this.entities.values()) {
      if (e instanceof Mob && !e.isDead) {
        e.isDead = true;
        count++;
      }
    }
    return count;
  }

  addXpLevels(levels: number): void {
    this.player.xpLevel = Math.max(0, this.player.xpLevel + levels);
  }

  applyEffect(effect: EffectId, seconds: number, amplifier: number): void {
    if (!isEffectId(effect)) {
      this.addChatMessage(`未知效果：${effect}`);
      return;
    }
    this.player.addEffect(effect, seconds * TICKS_PER_SECOND, amplifier, this);
    this.addChatMessage(`已获得效果 ${EFFECT_DEFS[effect].label} ${amplifier + 1} 级，${seconds} 秒`);
  }

  clearEffects(): void {
    this.player.clearEffects();
  }

  setBlockAt(x: number, y: number, z: number, blockName: string): boolean {
    const def = getBlockByName(blockName);
    if (!def) {
      return false;
    }
    this.world.setBlock(x, y, z, def.id, 0);
    return true;
  }

  fillBlocks(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, blockName: string): number {
    const def = getBlockByName(blockName);
    if (!def) {
      return -1;
    }
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.max(0, Math.min(y1, y2));
    const maxY = Math.min(WORLD_SIZE_Y - 1, Math.max(y1, y2));
    const minZ = Math.min(z1, z2);
    const maxZ = Math.max(z1, z2);
    const volume = (maxX - minX + 1) * (maxY - minY + 1) * (maxZ - minZ + 1);
    if (volume > FILL_LIMIT) {
      this.addChatMessage(`区域太大（${volume} > ${FILL_LIMIT}）`);
      return 0;
    }
    let count = 0;
    this.world.batch(() => {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          for (let x = minX; x <= maxX; x++) {
            this.world.setBlock(x, y, z, def.id, 0);
            count++;
          }
        }
      }
    });
    return count;
  }

  summonMob(type: string, x: number, y: number, z: number): boolean {
    if (!isMobType(type)) {
      return false;
    }
    const mob = new Mob(type);
    mob.setPosition(x + 0.5, y, z + 0.5);
    this.spawnEntity(mob);
    return true;
  }

  enchantHeldItem(enchantId: string, level: number): boolean {
    const held = this.player.heldItem;
    if (!held || !isEnchantmentId(enchantId)) {
      return false;
    }
    const def = getItem(held.id);
    if (!def || !canEnchant(def, ENCHANTMENT_DEFS[enchantId])) {
      return false;
    }
    const capped = Math.min(level, ENCHANTMENT_DEFS[enchantId].maxLevel);
    this.player.inventory.set(this.player.selectedSlot, {
      ...held,
      enchants: { ...(held.enchants ?? {}), [enchantId]: capped },
    });
    this.notifyChanged();
    return true;
  }

  setSpawnPoint(x: number, y: number, z: number): void {
    this.player.spawnX = x + 0.5;
    this.player.spawnY = y;
    this.player.spawnZ = z + 0.5;
  }

  worldSeed(): string {
    return this.meta.seed;
  }

  setGameRule(rule: string, value: boolean): boolean {
    if (!(rule in this.gameRules)) {
      return false;
    }
    this.gameRules[rule as GameRuleName] = value;
    return true;
  }

  listGameRules(): string[] {
    return Object.entries(this.gameRules).map(([name, value]) => `${name} = ${value}`);
  }

  // ---------------------------------------------------------------- 矿车

  /** 把矿车放到瞄准的铁轨上。 */
  private tryPlaceMinecart(hit: RayHit): boolean {
    const id = this.world.getBlock(hit.x, hit.y, hit.z);
    if (id !== BlockId.RAIL && id !== BlockId.POWERED_RAIL) {
      return false;
    }
    const cart = new MinecartEntity();
    cart.setPosition(hit.x + 0.5, hit.y + 0.1, hit.z + 0.5);
    this.spawnEntity(cart);
    if (!this.rules.infiniteItems) {
      this.player.inventory.consume(this.player.selectedSlot, 1);
    }
    this.sound.play('place');
    this.renderer.hand.swing();
    return true;
  }

  /**
   * 右键上 / 下矿车。
   * @returns 是否处理了（处理了就不再走放置逻辑）
   */
  private tryToggleRide(): boolean {
    if (this.ridingCartId !== null) {
      this.ridingCartId = null;
      this.showToast('下车');
      return true;
    }
    const cart = this.cartInCrosshair();
    if (!cart) {
      return false;
    }
    this.ridingCartId = cart.id;
    cart.riderId = this.player.id;
    this.showToast('上车');
    return true;
  }

  /** 准星附近的矿车。 */
  private cartInCrosshair(): MinecartEntity | null {
    const dir = this.lookDirection();
    const p = this.player;
    const origin = new THREE.Vector3(p.x, p.eyeY, p.z);
    const ray = new THREE.Ray(origin, dir);
    for (const e of this.entities.values()) {
      if (!(e instanceof MinecartEntity) || e.isDead) {
        continue;
      }
      const center = new THREE.Vector3(e.x, e.y + e.height / 2, e.z);
      if (origin.distanceTo(center) > this.rules.reach + 1) {
        continue;
      }
      if (ray.distanceToPoint(center) <= MINECART_HIT_TOLERANCE) {
        return e;
      }
    }
    return null;
  }

  /** 骑乘中：把玩家钉在车上；车没了就自动下车。 */
  private tickRiding(): void {
    if (this.ridingCartId === null) {
      return;
    }
    const cart = this.entities.get(this.ridingCartId);
    if (!(cart instanceof MinecartEntity) || cart.isDead) {
      this.ridingCartId = null;
      return;
    }
    this.player.setPosition(cart.x, cart.y + RIDE_EYE_OFFSET, cart.z);
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.vz = 0;
  }

  /**
   * 联机客户端：脚下那块地还没从服务端到达。
   * 只看 hasChunkAt 不够 —— 本地那个空占位 chunk 也算"已加载"，人照样会掉下去。
   */
  private isWaitingForTerrain(): boolean {
    if (!this.isNetworkClient) {
      return false;
    }
    const cx = toChunkCoord(Math.floor(this.player.x));
    const cz = toChunkCoord(Math.floor(this.player.z));
    return !this.receivedChunks.has(chunkKey(cx, cz));
  }

  /** 玩家是不是在矿车上（移动逻辑要跳过自己走路）。 */
  get isRiding(): boolean {
    return this.ridingCartId !== null;
  }

  // ---------------------------------------------------------------- 红石

  /** 拉杆：开关一下并重算线路。 */
  private toggleLever(x: number, y: number, z: number): void {
    const meta = this.world.getMeta(x, y, z);
    this.world.setBlock(x, y, z, BlockId.LEVER, meta ^ REDSTONE_POWERED_BIT);
    this.sound.play('door');
    this.renderer.hand.swing();
  }

  /** 按钮：按下并在若干 tick 后自动弹回。 */
  private pressButton(x: number, y: number, z: number): void {
    const meta = this.world.getMeta(x, y, z);
    if ((meta & REDSTONE_POWERED_BIT) !== 0) {
      return;
    }
    this.world.setBlock(x, y, z, BlockId.STONE_BUTTON, meta | REDSTONE_POWERED_BIT);
    this.pressedButtons.push({ x, y, z, ticks: BUTTON_PRESS_TICKS });
    this.sound.play('door');
    this.renderer.hand.swing();
  }

  /** 右键中继器：在 2/4/6/8 tick 四挡延迟之间循环（1.8.9 同）。 */
  private cycleRepeaterDelay(x: number, y: number, z: number): void {
    const id = this.world.getBlock(x, y, z);
    const meta = this.world.getMeta(x, y, z);
    const tier = ((meta >> REPEATER_DELAY_SHIFT) + 1) & REPEATER_DELAY_MASK;
    this.world.setBlock(x, y, z, id, (meta & REPEATER_FACING_MASK) | (tier << REPEATER_DELAY_SHIFT));
    this.sound.play('door');
    this.renderer.hand.swing();
  }

  /** 右键比较器：在"比较"与"减法"两种模式之间切换。 */
  private toggleComparatorMode(x: number, y: number, z: number): void {
    const meta = this.world.getMeta(x, y, z);
    this.world.setBlock(x, y, z, BlockId.COMPARATOR, meta ^ COMPARATOR_MODE_BIT);
    this.sound.play('door');
    this.renderer.hand.swing();
  }

  /** 每 tick：按钮弹回、压力板感应、延迟更新（火把 / 中继器）。 */
  private tickRedstone(): void {
    this.tickButtons();
    this.current.triggers.tick();
    this.tickScheduledUpdates();
  }

  /**
   * 到点的延迟更新：红石火把与中继器都不是立刻翻转，而是等几 tick，
   * 这样才有振荡器与延时电路（1.8.9 同）。
   */
  private tickScheduledUpdates(): void {
    if (this.scheduledUpdates.length === 0) {
      return;
    }
    const remaining: typeof this.scheduledUpdates = [];
    const due: typeof this.scheduledUpdates = [];
    for (const update of this.scheduledUpdates) {
      update.ticks--;
      (update.ticks <= 0 ? due : remaining).push(update);
    }
    this.scheduledUpdates = remaining;
    for (const { x, y, z } of due) {
      this.applyScheduledUpdate(x, y, z);
    }
  }

  /** 排一个延迟更新（同一格已排队就不重复排）。 */
  private scheduleRedstoneUpdate(x: number, y: number, z: number, ticks: number): void {
    if (this.scheduledUpdates.some((u) => u.x === x && u.y === y && u.z === z)) {
      return;
    }
    this.scheduledUpdates.push({ x, y, z, ticks });
  }

  /** 延迟到点：按当前输入决定火把 / 中继器的新状态。 */
  private applyScheduledUpdate(x: number, y: number, z: number): void {
    const id = this.world.getBlock(x, y, z);
    const def = getBlock(id);
    const redstone = def.redstone;
    if (!redstone) {
      return;
    }
    if (redstone.comparator) {
      this.current.comparators.update(x, y, z);
      return;
    }
    if (redstone.repeater) {
      const powered = repeaterInputPower(this.world, x, y, z) > 0;
      const isOn = id === BlockId.REPEATER_ON;
      if (powered !== isOn) {
        this.world.setBlock(x, y, z, powered ? BlockId.REPEATER_ON : BlockId.REPEATER, this.world.getMeta(x, y, z));
      }
      return;
    }
    if (redstone.piston) {
      this.applyPistonState(x, y, z, redstone.sticky === true);
      return;
    }
    if (redstone.dispenser) {
      this.applyDispenser(x, y, z, redstone.dropper === true);
      return;
    }
    if (redstone.poweredRail) {
      const meta = this.world.getMeta(x, y, z);
      const powered = isPoweredRailOn(this.world, x, y, z);
      const isOn = (meta & POWERED_RAIL_LIT_BIT) !== 0;
      if (powered !== isOn) {
        this.world.setBlock(x, y, z, id, powered ? meta | POWERED_RAIL_LIT_BIT : meta & ~POWERED_RAIL_LIT_BIT);
      }
      return;
    }
    if (redstone.ignitesWhenPowered) {
      if (powerAt(this.world, x, y, z) > 0) {
        this.primeTnt(x, y, z);
      }
      return;
    }
    // 火把：脚下方块被充能就灭，否则亮
    const target = this.torchTargetId(x, y, z, redstone);
    if (target !== null && target !== id) {
      this.world.setBlock(x, y, z, target, this.world.getMeta(x, y, z));
    }
  }

  /**
   * 漏斗：每隔几 tick 从上方容器抽一件、往朝向的容器塞一件，并吸走落在上面的掉落物。
   */
  private tickHoppers(): void {
    for (const [key, entity] of this.blockEntities.entries()) {
      if (entity.type !== BlockEntityType.HOPPER) {
        continue;
      }
      if (entity.cooldown > 0) {
        entity.cooldown--;
        continue;
      }
      const [x, y, z] = key.split(',').map(Number);
      if (this.world.getBlock(x, y, z) !== BlockId.HOPPER) {
        continue;
      }
      entity.cooldown = HOPPER_TRANSFER_INTERVAL_TICKS;
      this.hopperPickupDrops(entity, x, y, z);
      this.hopperPullFromAbove(entity, x, y, z);
      this.hopperPushToTarget(entity, x, y, z);
    }
  }

  /** 吸走落在漏斗上面的掉落物。 */
  private hopperPickupDrops(entity: HopperBlockEntity, x: number, y: number, z: number): void {
    for (const e of this.entities.values()) {
      if (!(e instanceof ItemDropEntity) || e.isDead) {
        continue;
      }
      if (
        Math.abs(e.x - (x + 0.5)) > HOPPER_PICKUP_RANGE ||
        Math.abs(e.z - (z + 0.5)) > HOPPER_PICKUP_RANGE ||
        e.y < y ||
        e.y > y + 1.5
      ) {
        continue;
      }
      while (e.stack.count > 0 && insertOne(entity.items, e.stack)) {
        e.stack = { ...e.stack, count: e.stack.count - 1 };
      }
      if (e.stack.count <= 0) {
        e.isDead = true;
      }
      this.notifyChanged();
      return;
    }
  }

  /** 从上方的容器里抽一件。 */
  private hopperPullFromAbove(entity: HopperBlockEntity, x: number, y: number, z: number): void {
    const above = containerSlots(this.blockEntities.get(x, y + 1, z));
    if (!above || isEmpty(above)) {
      return;
    }
    const taken = extractOne(above);
    if (!taken) {
      return;
    }
    if (!insertOne(entity.items, taken)) {
      // 塞不下就放回去
      insertOne(above, taken);
      return;
    }
    this.syncFurnaceSlots(x, y + 1, z, above);
    this.notifyChanged();
  }

  /** 往漏斗朝向的容器里塞一件。 */
  private hopperPushToTarget(entity: HopperBlockEntity, x: number, y: number, z: number): void {
    if (isEmpty(entity.items)) {
      return;
    }
    const [dx, dy, dz] = hopperTargetOffset(this.world.getMeta(x, y, z));
    const target = containerSlots(this.blockEntities.get(x + dx, y + dy, z + dz));
    if (!target) {
      return;
    }
    const taken = extractOne(entity.items);
    if (!taken) {
      return;
    }
    if (!insertOne(target, taken)) {
      insertOne(entity.items, taken);
      return;
    }
    this.syncFurnaceSlots(x + dx, y + dy, z + dz, target);
    this.notifyChanged();
  }

  /** 熔炉的槽位是三个独立字段，改完要写回去。 */
  private syncFurnaceSlots(x: number, y: number, z: number, slots: (ItemStack | null)[]): void {
    const entity = this.blockEntities.get(x, y, z);
    if (entity?.type !== BlockEntityType.FURNACE) {
      return;
    }
    entity.state.input = slots[0];
    entity.state.fuel = slots[1];
    entity.state.output = slots[2];
  }

  /** 发射器 / 投掷器：通电时吐一样东西出来。 */
  private applyDispenser(x: number, y: number, z: number, dropper: boolean): void {
    if (powerAt(this.world, x, y, z) <= 0) {
      return;
    }
    const entity = this.blockEntities.get(x, y, z);
    if (entity?.type !== BlockEntityType.DISPENSER) {
      return;
    }
    const stack = extractOne(entity.items);
    if (!stack) {
      return;
    }
    const [fx, fz] = FACINGS[this.world.getMeta(x, y, z) & FACING_MASK];
    const cx = x + 0.5 + fx * 0.7;
    const cy = y + 0.5;
    const cz = z + 0.5 + fz * 0.7;
    // 投掷器只是把东西丢出来；发射器同样丢，但速度更快（箭 / 药水的特殊行为留到以后）
    const speed = dropper ? DISPENSER_LAUNCH_SPEED * 0.25 : DISPENSER_LAUNCH_SPEED;
    const drop = this.dropItem(cx, cy, cz, stack, 0);
    drop.vx = fx * speed;
    drop.vz = fz * speed;
    this.sound.play('bow', Math.hypot(x - this.player.x, y - this.player.y, z - this.player.z));
    this.notifyChanged();
  }

  /** 活塞：按当前充能决定伸出还是缩回。 */
  private applyPistonState(x: number, y: number, z: number, sticky: boolean): void {
    const facing = this.world.getMeta(x, y, z) & PISTON_FACING_MASK;
    const dir = pistonDirection(facing);
    const extended = this.world.getBlock(x + dir[0], y + dir[1], z + dir[2]) === BlockId.PISTON_HEAD;
    const powered = powerAt(this.world, x, y, z) > 0;
    if (powered === extended) {
      return;
    }
    if (powered) {
      if (extendPiston(this.world, x, y, z, facing)) {
        this.sound.play('door', Math.hypot(x - this.player.x, y - this.player.y, z - this.player.z));
      }
      return;
    }
    retractPiston(this.world, x, y, z, facing, sticky);
    this.sound.play('door', Math.hypot(x - this.player.x, y - this.player.y, z - this.player.z));
  }

  /** 火把按脚下的充能情况该变成哪个 id；不是火把返回 null。 */
  private torchTargetId(x: number, y: number, z: number, redstone: NonNullable<BlockDef['redstone']>): number | null {
    if (redstone.invertedOffId === undefined && redstone.invertedOnId === undefined) {
      return null;
    }
    // 判断脚下方块是否被充能时要排除火把自己，否则它会一直把自己关掉
    const basePowered = powerAt(this.world, x, y - 1, z, [x, y, z]) > 0;
    if (basePowered) {
      return redstone.invertedOffId ?? BlockId.REDSTONE_TORCH_OFF;
    }
    return redstone.invertedOnId ?? BlockId.REDSTONE_TORCH;
  }

  private tickButtons(): void {
    if (this.pressedButtons.length === 0) {
      return;
    }
    const remaining: typeof this.pressedButtons = [];
    for (const button of this.pressedButtons) {
      button.ticks--;
      if (this.world.getBlock(button.x, button.y, button.z) !== BlockId.STONE_BUTTON) {
        continue;
      }
      if (button.ticks > 0) {
        remaining.push(button);
        continue;
      }
      const meta = this.world.getMeta(button.x, button.y, button.z);
      this.world.setBlock(button.x, button.y, button.z, BlockId.STONE_BUTTON, meta & ~REDSTONE_POWERED_BIT);
    }
    this.pressedButtons = remaining;
  }

  /**
   * 逐个访问玩家与生物的位置，交给压力板 / 绊线判断有没有人踩上去。
   * @returns 只要有一个位置让 visit 返回 true 就是 true
   */
  someEntityAt(visit: (x: number, y: number, z: number) => boolean): boolean {
    if (visit(this.player.x, this.player.y, this.player.z)) {
      return true;
    }
    for (const e of this.entities.values()) {
      if (e instanceof Mob && !e.isDead && visit(e.x, e.y, e.z)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 方块变化后重算红石：先更新红石粉的强度，再让用电器（红石灯 / 门）跟上。
   * 由 world 的变更事件驱动，因此手动放置、活塞推动、爆炸都会触发。
   */
  /** 变更点周围一圈（含斜角）里有没有红石元件。 */
  private hasRedstoneNeighbor(x: number, y: number, z: number): boolean {
    for (let dy = -REDSTONE_UPDATE_RADIUS; dy <= REDSTONE_UPDATE_RADIUS; dy++) {
      for (let dz = -REDSTONE_UPDATE_RADIUS; dz <= REDSTONE_UPDATE_RADIUS; dz++) {
        for (let dx = -REDSTONE_UPDATE_RADIUS; dx <= REDSTONE_UPDATE_RADIUS; dx++) {
          if (getBlock(this.world.getBlock(x + dx, y + dy, z + dz)).redstone) {
            return true;
          }
        }
      }
    }
    return false;
  }

  private onRedstoneRelevantChange(x: number, y: number, z: number): void {
    if (this.redstoneUpdating) {
      return;
    }
    this.redstoneUpdating = true;
    try {
      // 线路可能一路延伸出去，所以用电器要围着"变了的那些粉"刷新，而不只是变更点
      const changed = updateWires(this.world, x, y, z);
      this.updateConsumers(x, y, z);
      this.scheduleNearbyLogic(x, y, z);
      for (const [wx, wy, wz] of changed) {
        this.updateConsumers(wx, wy, wz);
        this.scheduleNearbyLogic(wx, wy, wz);
      }
    } finally {
      this.redstoneUpdating = false;
    }
  }

  /** 给变更点附近的火把与中继器排延迟更新。 */
  private scheduleNearbyLogic(x: number, y: number, z: number): void {
    for (let dy = -REDSTONE_CONSUMER_RADIUS; dy <= REDSTONE_CONSUMER_RADIUS; dy++) {
      for (let dz = -REDSTONE_CONSUMER_RADIUS; dz <= REDSTONE_CONSUMER_RADIUS; dz++) {
        for (let dx = -REDSTONE_CONSUMER_RADIUS; dx <= REDSTONE_CONSUMER_RADIUS; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          const nz = z + dz;
          const redstone = getBlock(this.world.getBlock(nx, ny, nz)).redstone;
          if (!redstone) {
            continue;
          }
          if (redstone.repeater) {
            this.scheduleRedstoneUpdate(nx, ny, nz, repeaterDelay(this.world.getMeta(nx, ny, nz)));
          } else if (redstone.comparator) {
            this.scheduleRedstoneUpdate(nx, ny, nz, COMPARATOR_DELAY_TICKS);
          } else if (redstone.piston) {
            this.scheduleRedstoneUpdate(nx, ny, nz, PISTON_DELAY_TICKS);
          } else if (redstone.dispenser || redstone.ignitesWhenPowered || redstone.poweredRail) {
            this.scheduleRedstoneUpdate(nx, ny, nz, PISTON_DELAY_TICKS);
          } else if (redstone.invertedOffId !== undefined || redstone.invertedOnId !== undefined) {
            this.scheduleRedstoneUpdate(nx, ny, nz, TORCH_DELAY_TICKS);
          }
        }
      }
    }
  }

  /** 让变更点附近的用电器跟随当前信号。 */
  private updateConsumers(x: number, y: number, z: number): void {
    for (let dy = -REDSTONE_CONSUMER_RADIUS; dy <= REDSTONE_CONSUMER_RADIUS; dy++) {
      for (let dz = -REDSTONE_CONSUMER_RADIUS; dz <= REDSTONE_CONSUMER_RADIUS; dz++) {
        for (let dx = -REDSTONE_CONSUMER_RADIUS; dx <= REDSTONE_CONSUMER_RADIUS; dx++) {
          this.updateConsumerAt(x + dx, y + dy, z + dz);
        }
      }
    }
  }

  private updateConsumerAt(x: number, y: number, z: number): void {
    const id = this.world.getBlock(x, y, z);
    const def = getBlock(id);
    const redstone = def.redstone;
    if (!redstone) {
      return;
    }
    // 中继器有自己的延迟队列，不走这里
    if (redstone.repeater) {
      return;
    }
    const powered = powerAt(this.world, x, y, z) > 0;
    if (redstone.noteBlock) {
      this.updateNoteBlock(x, y, z, powered);
      return;
    }
    // 通电 / 断电是两个方块 id 的用电器（红石灯）
    if (powered && redstone.litBlockId !== undefined) {
      this.world.setBlock(x, y, z, redstone.litBlockId, this.world.getMeta(x, y, z));
      return;
    }
    if (!powered && redstone.unlitBlockId !== undefined) {
      this.world.setBlock(x, y, z, redstone.unlitBlockId, this.world.getMeta(x, y, z));
      return;
    }
    if (redstone.litBlockId !== undefined || redstone.unlitBlockId !== undefined) {
      return;
    }
    // 门与栅栏门：被充能就开
    if (redstone.opensWhenPowered) {
      const meta = this.world.getMeta(x, y, z);
      const open = (meta & DOOR_OPEN_BIT) !== 0;
      if (open !== powered) {
        this.world.setBlock(x, y, z, id, powered ? meta | DOOR_OPEN_BIT : meta & ~DOOR_OPEN_BIT);
      }
    }
  }

  // ---------------------------------------------------------------- 凋灵与信标

  /**
   * 检查刚放下的凋灵骷髅头是否凑成了召唤阵：灵魂沙摆成 T 字、上面三颗头。
   * 凑齐就清掉这些方块并召唤凋灵。
   */
  private trySummonWither(x: number, y: number, z: number): void {
    for (const [dx, dz] of WITHER_SUMMON_AXES) {
      // 刚放的头可能是三颗里的任意一颗
      for (let offset = -1; offset <= 1; offset++) {
        const cx = x - dx * offset;
        const cz = z - dz * offset;
        if (this.isWitherAltar(cx, y, cz, dx, dz)) {
          this.summonWither(cx, y, cz, dx, dz);
          return;
        }
      }
    }
  }

  /** 以 (cx, y, cz) 为中心（头颅层）的召唤阵是否完整。 */
  private isWitherAltar(cx: number, y: number, cz: number, dx: number, dz: number): boolean {
    for (let i = -1; i <= 1; i++) {
      if (this.world.getBlock(cx + dx * i, y, cz + dz * i) !== BlockId.WITHER_SKULL) {
        return false;
      }
      if (this.world.getBlock(cx + dx * i, y - 1, cz + dz * i) !== BlockId.SOUL_SAND) {
        return false;
      }
    }
    // T 字的竖：中心正下方再一格灵魂沙
    return this.world.getBlock(cx, y - 2, cz) === BlockId.SOUL_SAND;
  }

  private summonWither(cx: number, y: number, cz: number, dx: number, dz: number): void {
    this.world.batch(() => {
      for (let i = -1; i <= 1; i++) {
        this.world.setBlock(cx + dx * i, y, cz + dz * i, BlockId.AIR);
        this.world.setBlock(cx + dx * i, y - 1, cz + dz * i, BlockId.AIR);
      }
      this.world.setBlock(cx, y - 2, cz, BlockId.AIR);
    });
    const wither = new WitherEntity();
    wither.setPosition(cx + 0.5, y, cz + 0.5);
    this.entities.set(wither.id, wither);
    this.achievements.onWitherSummoned();
    this.showToast('凋灵被召唤了！');
  }

  /** 凋灵被打死：掉下界之星与经验。 */
  private onWitherKilled(wither: WitherEntity): void {
    this.dropItem(wither.x, wither.y, wither.z, { id: 'nether_star', count: 1 }, 0.2);
    this.dropXp(wither.x, wither.y, wither.z, WITHER_KILL_XP);
    this.achievements.onWitherKilled();
    this.showToast('凋灵被击败了！');
  }

  /** 信标每秒给范围内的玩家续一次效果。 */
  private tickBeacons(): void {
    if (this.tick % BEACON_REFRESH_TICKS !== 0) {
      return;
    }
    for (const [key, entity] of this.blockEntities.entries()) {
      if (entity.type !== BlockEntityType.BEACON || !entity.effect) {
        continue;
      }
      const [x, y, z] = key.split(',').map(Number);
      const level = beaconLevel(this.world, x, y, z);
      if (level <= 0 || !hasSkyAccess(this.world, x, y, z)) {
        continue;
      }
      const range = beaconRange(level);
      if (this.player.distanceSqToPoint(x, y, z) > range * range) {
        continue;
      }
      if (isEffectId(entity.effect)) {
        this.player.addEffect(entity.effect, BEACON_EFFECT_TICKS, 0, this);
      }
    }
  }

  /** 当前打开的信标状态（UI 用）。 */
  get openBeacon(): { level: number; effect: string | null; options: BeaconOption[] } | null {
    const pos = this.store.get().openBlock;
    if (!pos || this.store.get().screen !== Screen.BEACON) {
      return null;
    }
    const level = beaconLevel(this.world, pos.x, pos.y, pos.z);
    const entity = this.blockEntities.get(pos.x, pos.y, pos.z);
    const effect = entity?.type === BlockEntityType.BEACON ? (entity.effect ?? null) : null;
    return { level, effect, options: beaconOptionsFor(level) };
  }

  /** 选择信标的效果（需要金字塔等级足够）。 */
  selectBeaconEffect(effect: string): void {
    const pos = this.store.get().openBlock;
    const beacon = this.openBeacon;
    if (!pos || !beacon || !beacon.options.some((o) => o.effect === effect)) {
      return;
    }
    this.blockEntities.set(pos.x, pos.y, pos.z, { type: BlockEntityType.BEACON, effect });
    this.sound.play('level');
    this.notifyChanged();
  }

  /** 准星指向的方块名（带变种，如"云杉木板"）。 */
  private blockLabelAt(x: number, y: number, z: number): string {
    return blockVariant(getBlock(this.world.getBlock(x, y, z)), this.world.getMeta(x, y, z)).label;
  }

  /**
   * 给 HUD 的效果列表：只在效果增删或到了刷新秒数时才产出新数组，
   * 否则复用上一份引用，让 Store 的浅比较在"没变化"时不触发 React 重渲染。
   */
  private effectsForHud(): ActiveEffect[] {
    const p = this.player;
    if (p.effects.size === 0) {
      this.hudEffectsVersion = p.effectsVersion;
      this.hudEffects = EMPTY_EFFECTS;
      return EMPTY_EFFECTS;
    }
    const stale = p.effectsVersion !== this.hudEffectsVersion || this.tick % EFFECT_HUD_REFRESH_TICKS === 0;
    if (stale) {
      this.hudEffectsVersion = p.effectsVersion;
      this.hudEffects = p.serializeEffects();
    }
    return this.hudEffects;
  }

  private syncStore(): void {
    const p = this.player;
    this.store.patch({
      health: p.health,
      food: p.food,
      achievementVersion: this.achievements.version,
      boss: this.bossStatusForHud(),
      air: p.air,
      armor: p.armorPoints,
      effects: this.effectsForHud(),
      xpLevel: p.xpLevel,
      // 经验条只有整百分比的精度，量化后不会因为浮点微变每 tick 触发重渲染
      xpProgress: Math.round(p.xpProgress * XP_BAR_STEPS) / XP_BAR_STEPS,
      selectedSlot: p.selectedSlot,
      isFlying: p.isFlying,
      isUnderwater: this.isPlayerUnderwater(),
      targetLabel: this.currentHit ? this.blockLabelAt(this.currentHit.x, this.currentHit.y, this.currentHit.z) : '',
      debug: this.debugEnabled ? this.buildDebugInfo() : null,
    });
  }

  /** chunk 卸载时清掉其中的掉落物（生物保留在实体表中冻结，随存档保存）。 */
  private onChunkUnloaded(chunk: Chunk): void {
    for (const [id, e] of this.entities) {
      if (e instanceof ItemDropEntity && chunk.containsColumn(Math.floor(e.x), Math.floor(e.z))) {
        this.entities.delete(id);
      }
    }
  }

  /** 实体所在 chunk 是否已加载（未加载的实体冻结，不 tick / 不移动）。 */
  private isEntityChunkLoaded(e: Entity): boolean {
    return this.world.hasChunkAt(Math.floor(e.x), Math.floor(e.z));
  }

  private buildDebugInfo(): DebugInfo {
    const p = this.player;
    const bx = Math.floor(p.x);
    const by = Math.floor(p.y);
    const bz = Math.floor(p.z);
    const yawDeg = ((THREE.MathUtils.radToDeg(p.yaw) % 360) + 360) % 360;
    const facing = FACING_LABELS[Math.floor(((yawDeg + 45) % 360) / 90)];
    return {
      fps: this.fps,
      x: p.x,
      y: p.y,
      z: p.z,
      chunkX: toChunkCoord(bx),
      chunkZ: toChunkCoord(bz),
      biome: biomeLabel(this.generator.biomeAt(bx, bz)),
      chunks: this.world.chunkCount,
      entities: this.entities.size,
      light: `sky ${this.world.getSkyLight(bx, by, bz)} block ${this.world.getBlockLight(bx, by, bz)}`,
      facing,
      tick: this.tick,
    };
  }

  // ---------------------------------------------------------------- 输入

  private bindControls(): void {
    this.controls.onLockChange = (locked) => {
      this.store.patch({ isPointerLocked: locked });
      if (!locked && !this.isTouch && this.store.get().screen === Screen.NONE && !this.isDisposed) {
        this.openScreen(Screen.PAUSE);
      }
    };
    this.controls.onKeyDown = (code, ctrlKey) => this.handleKey(code, ctrlKey);
    this.controls.onMouseDown = (button) => this.handleMouseDown(button);
    this.controls.onWheel = (direction) => {
      this.selectSlot((this.player.selectedSlot + direction + HOTBAR_SIZE) % HOTBAR_SIZE);
    };
  }

  private handleKey(code: string, ctrlKey: boolean): void {
    const screen = this.store.get().screen;
    if (code === KEY_ESCAPE) {
      if (screen === Screen.NONE) {
        this.openScreen(Screen.PAUSE);
      } else if (screen !== Screen.DEATH) {
        this.closeScreen();
      }
      return;
    }
    const action: BindingAction | null = actionForCode(code, settingsStore.get());
    if (action === 'debug') {
      this.debugEnabled = !this.debugEnabled;
      return;
    }
    if (action === 'inventory') {
      if (screen === Screen.NONE) {
        this.openScreen(Screen.INVENTORY);
        this.achievements.onOpenInventory();
      } else if (isContainerScreen(screen)) {
        this.closeScreen();
      }
      return;
    }
    if (screen !== Screen.NONE) {
      return;
    }
    if (code === KEY_CHAT || code === KEY_COMMAND) {
      this.openChat(code === KEY_COMMAND ? '/' : '');
      return;
    }
    if (code.startsWith(KEY_HOTBAR_PREFIX)) {
      const n = Number(code.slice(KEY_HOTBAR_PREFIX.length));
      if (n >= 1 && n <= 9) {
        this.selectSlot(n - 1);
      }
      return;
    }
    if (action === 'drop') {
      this.dropHeld(ctrlKey);
      return;
    }
    if (action === 'jump' && this.rules.canFly) {
      const now = performance.now();
      if (now - this.lastJumpPressAt < DOUBLE_TAP_MS) {
        this.player.isFlying = !this.player.isFlying;
        this.player.hasGravity = !this.player.isFlying;
        this.player.vy = 0;
        this.lastJumpPressAt = 0;
      } else {
        this.lastJumpPressAt = now;
      }
    }
  }

  private handleMouseDown(button: number): void {
    if (this.store.get().screen !== Screen.NONE || this.player.health <= 0) {
      return;
    }
    if (button === MOUSE_LEFT) {
      this.tryAttack();
      return;
    }
    if (button === MOUSE_RIGHT) {
      this.useItem();
      return;
    }
    if (button === MOUSE_MIDDLE) {
      this.pickBlock();
    }
  }

  private handleHeldMouse(): void {
    if (this.store.get().screen !== Screen.NONE) {
      this.resetBreaking();
      return;
    }
    if (this.controls.isMouseDown(MOUSE_LEFT)) {
      this.continueBreaking();
    } else {
      this.resetBreaking();
    }
    if (this.controls.isMouseDown(MOUSE_RIGHT) && this.useCooldown === 0) {
      this.useItem();
    }
    // 拉弓期间右键一直按着：蓄力慢慢涨，松手在 releaseBow 里结算
    if (this.bowDrawTicks >= 0) {
      if (this.controls.isMouseDown(MOUSE_RIGHT)) {
        this.bowDrawTicks = Math.min(this.bowDrawTicks + 1, BOW_FULL_DRAW_TICKS);
      } else {
        this.releaseBow();
      }
    }
  }

  /** 开始拉弓（手里有箭或创造模式才拉得开）。 */
  private drawBow(): void {
    if (this.bowDrawTicks >= 0) {
      return;
    }
    if (!this.rules.infiniteItems && this.player.inventory.countOf(ARROW_ITEM_ID) === 0) {
      return;
    }
    this.bowDrawTicks = 0;
  }

  /** 松手放箭：拉得越满，箭越快越疼；点一下就松不出箭。 */
  private releaseBow(): void {
    const drawn = this.bowDrawTicks;
    this.bowDrawTicks = -1;
    const ratio = Math.min(1, drawn / BOW_FULL_DRAW_TICKS);
    if (ratio < BOW_MIN_DRAW_RATIO) {
      return;
    }
    if (!this.rules.infiniteItems && !this.player.inventory.removeItems(ARROW_ITEM_ID, 1)) {
      return;
    }
    const p = this.player;
    const dir = this.lookDirection();
    const arrow = new ArrowEntity(p.id, true, BOW_MAX_ARROW_DAMAGE * ratio);
    arrow.setPosition(p.x, p.eyeY, p.z);
    const speed = BOW_MAX_ARROW_SPEED * ratio;
    arrow.vx = dir.x * speed;
    arrow.vy = dir.y * speed;
    arrow.vz = dir.z * speed;
    this.spawnEntity(arrow);
    this.sound.play('bow');
    this.damageHeldTool(1);
    this.renderer.hand.swing();
    this.useCooldown = BOW_RELEASE_COOLDOWN_TICKS;
  }

  /** 选择快捷栏。 */
  selectSlot(index: number): void {
    this.player.selectedSlot = index;
    this.store.patch({ selectedSlot: index });
  }

  /** 由 UI 请求锁定指针（点击画面）。触屏设备没有指针锁定，直接忽略。 */
  requestPointerLock(): void {
    if (this.isTouch) {
      return;
    }
    this.controls.requestLock();
  }

  // ---------------------------------------------------------------- 触屏输入转发

  /** 触屏按钮：按下/抬起按键（与键盘走同一条处理链）。 */
  setKeyInput(code: string, down: boolean): void {
    this.controls.setVirtualKey(code, down);
  }

  /** 触屏按钮：按下/抬起鼠标键（挖掘、放置）。 */
  setMouseInput(button: number, down: boolean): void {
    this.controls.setVirtualMouse(button, down);
  }

  /** 触屏摇杆：移动输入（各分量 -1~1）。 */
  setMoveInput(forward: number, strafe: number): void {
    this.controls.setVirtualMove(forward, strafe);
  }

  /** 触屏拖动：按像素位移转动视角（灵敏度在 Controls 内按来源换算）。 */
  lookBy(dxPixels: number, dyPixels: number): void {
    this.controls.lookByPixels(dxPixels, dyPixels, 'touch');
  }

  /** 打开界面。 */
  openScreen(screen: Screen, openBlock: { x: number; y: number; z: number } | null = null): void {
    this.craftGridSize = screen === Screen.CRAFTING ? 3 : 2;
    this.setTrappedChestPowered(this.store.get().openBlock, false);
    this.setTrappedChestPowered(openBlock, true);
    this.store.patch({ screen, openBlock });
    this.isPaused = screen === Screen.PAUSE || screen === Screen.STATS;
    if (screen !== Screen.NONE) {
      this.controls.exitLock();
    }
  }

  /** 正在编辑的告示牌坐标；没在编辑时为 null。 */
  private editingSign: { x: number; y: number; z: number } | null = null;

  /** 当前正在编辑的告示牌文字（UI 读）。 */
  get signLines(): readonly string[] {
    const at = this.editingSign;
    const entity = at ? this.blockEntities.get(at.x, at.y, at.z) : null;
    return entity?.type === BlockEntityType.SIGN ? entity.lines : EMPTY_SIGN_LINES;
  }

  /**
   * 改告示牌的某一行（UI 调）。
   * @param index 行号 0 ~ SIGN_LINE_COUNT-1
   */
  setSignLine(index: number, text: string): void {
    const at = this.editingSign;
    if (!at || index < 0 || index >= SIGN_LINE_COUNT) {
      return;
    }
    const entity = this.blockEntities.get(at.x, at.y, at.z);
    if (entity?.type !== BlockEntityType.SIGN) {
      return;
    }
    // 字数上限与换行符都在这里挡掉，免得渲染时排不下
    entity.lines[index] = text.replace(/[\r\n]/g, '').slice(0, SIGN_LINE_MAX_CHARS);
    this.store.patch({ signVersion: this.store.get().signVersion + 1 });
  }

  /** 刚放下告示牌：建好方块实体并打开编辑界面。 */
  private beginEditingSign(x: number, y: number, z: number): void {
    this.blockEntities.getOrCreate(x, y, z, () => ({
      type: BlockEntityType.SIGN,
      lines: new Array<string>(SIGN_LINE_COUNT).fill(''),
    }));
    this.editingSign = { x, y, z };
    this.openScreen(Screen.SIGN, { x, y, z });
  }

  /** 关掉告示牌编辑界面（写完了）。 */
  finishEditingSign(): void {
    this.editingSign = null;
    this.closeScreen();
  }

  /** 陷阱箱被打开 / 关闭时切换它的通电位（1.8.9 按查看人数输出，这里只有本地玩家）。 */
  private setTrappedChestPowered(at: { x: number; y: number; z: number } | null, powered: boolean): void {
    if (!at || this.world.getBlock(at.x, at.y, at.z) !== BlockId.TRAPPED_CHEST) {
      return;
    }
    const meta = this.world.getMeta(at.x, at.y, at.z);
    if (((meta & REDSTONE_POWERED_BIT) !== 0) === powered) {
      return;
    }
    this.world.setBlock(
      at.x,
      at.y,
      at.z,
      BlockId.TRAPPED_CHEST,
      powered ? meta | REDSTONE_POWERED_BIT : meta & ~REDSTONE_POWERED_BIT,
    );
  }

  /**
   * 关闭界面并回到游戏。
   * 合成格与光标上的物品必须先收回背包；背包放不下时保持界面打开并提示，
   * 避免玩家正在挪动的物品被丢进世界。
   */
  /** 字幕放完 / 被跳过：回到游戏。 */
  closeCredits(): void {
    if (this.store.get().screen === Screen.CREDITS) {
      this.openScreen(Screen.NONE);
      this.requestPointerLock();
    }
  }

  closeScreen(): void {
    const leftover = this.containers.returnCraftingItems() + this.containers.returnCursor();
    if (leftover > 0) {
      this.showToast('背包已满，请先腾出空间');
      return;
    }
    this.isPaused = false;
    this.setTrappedChestPowered(this.store.get().openBlock, false);
    this.store.patch({ screen: Screen.NONE, openBlock: null });
    this.requestPointerLock();
  }

  /** 恢复游戏（暂停菜单）。 */
  resume(): void {
    this.closeScreen();
  }

  /** 设置渲染距离。 */
  setRenderDistance(distance: number): void {
    this.renderDistance = distance;
    this.renderer.setRenderDistance(distance);
  }

  get currentRenderDistance(): number {
    return this.renderDistance;
  }

  // ---------------------------------------------------------------- 玩家移动

  private updatePlayerMovement(dt: number): void {
    const p = this.player;
    p.yaw = this.controls.yaw;
    p.pitch = this.controls.pitch;
    // 联机刚进场时地形还在路上，先把人悬在原地，别让他掉进虚空摔死
    if (this.isWaitingForTerrain()) {
      p.vx = 0;
      p.vy = 0;
      p.vz = 0;
      p.fallDistance = 0;
      return;
    }
    if (p.health <= 0) {
      p.move(this, dt);
      return;
    }
    const input =
      this.store.get().screen === Screen.NONE
        ? this.controls.read()
        : { forward: 0, strafe: 0, jump: false, sneak: false, sprint: false, leftMouse: false, rightMouse: false };
    p.isSneaking = input.sneak && !p.isFlying;
    const canSprint = input.sprint && input.forward > 0 && (p.food > SPRINT_FOOD_THRESHOLD || !this.rules.usesHunger);
    p.isSprinting = canSprint;
    const forwardX = -Math.sin(p.yaw);
    const forwardZ = -Math.cos(p.yaw);
    const rightX = Math.cos(p.yaw);
    const rightZ = -Math.sin(p.yaw);
    let dirX = forwardX * input.forward + rightX * input.strafe;
    let dirZ = forwardZ * input.forward + rightZ * input.strafe;
    const len = Math.hypot(dirX, dirZ);
    if (len > 1) {
      dirX /= len;
      dirZ /= len;
    }
    if (p.isFlying) {
      this.updateFlying(dt, dirX, dirZ, input.jump, input.sneak);
      return;
    }
    let speed = PLAYER_WALK_SPEED * p.speedMultiplier;
    if (p.isSprinting) {
      speed *= PLAYER_SPRINT_MULTIPLIER;
    }
    if (p.isSneaking) {
      speed *= PLAYER_SNEAK_MULTIPLIER;
    }
    if (p.inWater) {
      speed = PLAYER_SWIM_SPEED;
    }
    const accel = p.onGround ? 14 : p.inWater ? 6 : 2.5;
    this.steerPlayer(dirX * speed, dirZ * speed, dt, accel);
    this.applyClimbing(input.forward, input.jump, input.sneak);
    if (input.jump) {
      if (p.onGround) {
        // 站在地上（含浅水底）就正常起跳；疾跑起跳只在刚按下时加一次前冲
        p.vy = PLAYER_JUMP_VELOCITY * p.jumpMultiplier;
        p.onJump();
        this.achievements.addStat(StatId.JUMPS);
        if (p.isSprinting && !this.jumpWasDown) {
          p.vx += forwardX * 1.5;
          p.vz += forwardZ * 1.5;
        }
      } else if (p.inWater) {
        p.vy = Math.min(p.vy + WATER_SWIM_UP_ACCEL * dt, WATER_SWIM_UP_MAX);
      }
    }
    this.jumpWasDown = input.jump;
    p.move(this, dt);
    // 落地时的摔落伤害通过 LivingEntity.onLand 处理；创造/无伤模式忽略
    if (!this.rules.takesDamage && p.health < p.maxHealth) {
      p.health = p.maxHealth;
    }
  }

  /** 玩家是否正贴着梯子等可攀爬方块（身体所在的格子里有就算）。 */
  private isPlayerClimbing(): boolean {
    const p = this.player;
    const box = p.box();
    const x0 = Math.floor(box.minX);
    const x1 = Math.floor(box.maxX);
    const z0 = Math.floor(box.minZ);
    const z1 = Math.floor(box.maxZ);
    const y0 = Math.floor(box.minY);
    const y1 = Math.floor(box.maxY);
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          if (getBlock(this.world.getBlock(x, y, z)).climbable) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /** 在梯子上：下滑限速、前进或跳跃向上爬、潜行停住，且不累计摔落距离。 */
  private applyClimbing(forward: number, jump: boolean, sneak: boolean): void {
    const p = this.player;
    if (!this.isPlayerClimbing()) {
      return;
    }
    if (jump || forward > 0) {
      p.vy = LADDER_CLIMB_SPEED;
    } else if (sneak) {
      p.vy = 0;
    } else {
      p.vy = Math.max(p.vy, -LADDER_SLIDE_SPEED);
    }
    p.fallDistance = 0;
  }

  private steerPlayer(targetVx: number, targetVz: number, dt: number, accel: number): void {
    const p = this.player;
    const k = Math.min(1, dt * accel);
    p.vx += (targetVx - p.vx) * k;
    p.vz += (targetVz - p.vz) * k;
  }

  private updateFlying(dt: number, dirX: number, dirZ: number, up: boolean, down: boolean): void {
    const p = this.player;
    p.hasGravity = false;
    const speed = PLAYER_FLY_SPEED * (p.isSprinting ? 2 : 1);
    this.steerPlayer(dirX * speed, dirZ * speed, dt, 10);
    let targetVy = 0;
    if (up) {
      targetVy = speed * 0.7;
    } else if (down) {
      targetVy = -speed * 0.7;
    }
    p.vy += (targetVy - p.vy) * Math.min(1, dt * 10);
    const wasOnGround = p.onGround;
    p.move(this, dt);
    if (down && p.onGround && wasOnGround) {
      p.isFlying = false;
      p.hasGravity = true;
    }
    p.fallDistance = 0;
  }

  private updateCamera(): void {
    const cam = this.renderer.camera;
    const p = this.player;
    cam.position.set(p.x, p.eyeY, p.z);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(p.pitch, p.yaw, 0);
    // 视线命中
    const dir = this.lookDirection();
    this.currentHit = raycastBlocks(this.world, p.x, p.eyeY, p.z, dir.x, dir.y, dir.z, this.rules.reach);
    if (this.breakTarget && this.currentHit) {
      const same =
        this.breakTarget.x === this.currentHit.x &&
        this.breakTarget.y === this.currentHit.y &&
        this.breakTarget.z === this.currentHit.z;
      if (!same) {
        this.resetBreaking();
      }
    }
  }

  /** 视线在水平面上的主方向（单位方向，x 与 z 只有一个非零）。 */
  private lookHorizontal(): readonly [number, number] {
    const dir = this.lookDirection();
    return Math.abs(dir.x) >= Math.abs(dir.z) ? [Math.sign(dir.x), 0] : [0, Math.sign(dir.z)];
  }

  /** 视线主方向对应的朝向序号。 */
  private lookFacingIndex(): number {
    const [dx, dz] = this.lookHorizontal();
    return facingIndexOf(dx, dz);
  }

  private lookDirection(): THREE.Vector3 {
    const p = this.player;
    const cp = Math.cos(p.pitch);
    return new THREE.Vector3(-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp);
  }

  private isPlayerUnderwater(): boolean {
    const p = this.player;
    return this.world.isLiquidAt(Math.floor(p.x), Math.floor(p.eyeY), Math.floor(p.z));
  }

  /** 方块被破坏时炸出一小把碎屑（贴图取自方块顶面）。 */
  private spawnBreakParticles(x: number, y: number, z: number, def: BlockDef): void {
    const level = this.lightLevelAt(x, y + 1, z) / MAX_LIGHT;
    this.renderer.particles.spawnBlockBreak(x, y, z, def.textures.top, BREAK_PARTICLE_COUNT, 0.3 + 0.7 * level);
  }

  /**
   * 世界与实体的最低亮度：夜视与维度自带的环境光取大者。
   * 下界本身就有一点微光，末地更暗，主世界为 0（完全按光照走）。
   */
  private minLight(): number {
    const nightVision = this.player.hasEffect(EffectId.NIGHT_VISION) ? NIGHT_VISION_MIN_LIGHT : 0;
    return Math.max(nightVision, this.current.def.ambientLight);
  }

  private brightnessAtPlayer(): number {
    const p = this.player;
    if (p.hasEffect(EffectId.NIGHT_VISION)) {
      return 1;
    }
    const level = this.lightLevelAt(Math.floor(p.x), Math.floor(p.eyeY), Math.floor(p.z)) / MAX_LIGHT;
    return 0.15 + 0.85 * (level / (4 - 3 * level));
  }

  // ---------------------------------------------------------------- 挖掘 / 放置 / 交互

  private continueBreaking(): void {
    const hit = this.currentHit;
    if (!hit || !this.rules.canModifyBlocks) {
      this.resetBreaking();
      return;
    }
    const id = this.world.getBlock(hit.x, hit.y, hit.z);
    const def = getBlock(id);
    if (this.rules.instantBreak) {
      if (this.creativeBreakDelay > 0) {
        this.creativeBreakDelay--;
        return;
      }
      this.creativeBreakDelay = CREATIVE_BLOCK_BREAK_DELAY_TICKS;
      if (def.hardness >= 0) {
        this.breakBlock(hit.x, hit.y, hit.z, false);
      }
      return;
    }
    if (!this.breakTarget || this.breakTarget.id !== id) {
      this.breakTarget = { x: hit.x, y: hit.y, z: hit.z, id };
      this.breakProgressTicks = 0;
      this.breakNeededTicks = breakTicks(def, this.player.heldItem);
      if (!Number.isFinite(this.breakNeededTicks)) {
        this.breakNeededTicks = 0;
        return;
      }
    }
    if (this.breakNeededTicks === 0) {
      return;
    }
    this.breakProgressTicks++;
    if (this.tick % 4 === 0) {
      this.renderer.hand.swing();
    }
    if (this.breakProgressTicks >= this.breakNeededTicks) {
      this.breakBlock(hit.x, hit.y, hit.z, true);
      this.resetBreaking();
    }
  }

  private resetBreaking(): void {
    this.breakTarget = null;
    this.breakProgressTicks = 0;
    this.breakNeededTicks = 0;
  }

  /** 破坏方块（含掉落、经验、工具耐久）。 */
  breakBlock(x: number, y: number, z: number, withDrops: boolean): void {
    const id = this.world.getBlock(x, y, z);
    if (id === BlockId.AIR) {
      return;
    }
    // 联机时由服务端说了算：只发意图，等广播回来再改世界
    if (this.sendBlockIntent(x, y, z, BlockId.AIR, 0)) {
      return;
    }
    const def = getBlock(id);
    this.achievements.addStat(StatId.BLOCKS_MINED);
    this.spawnBreakParticles(x, y, z, def);
    // 床和门都是两格一体：先把另一半悄悄拆掉，掉落只算一次
    const partner = this.multiBlockPartner(x, y, z);
    this.world.setBlock(x, y, z, BlockId.AIR);
    if (partner && this.world.getBlock(partner.x, partner.y, partner.z) === id) {
      this.world.setBlock(partner.x, partner.y, partner.z, BlockId.AIR);
    }
    this.playBlockSound(breakSound(soundGroupOf(def)), x, y, z, 'break');
    this.renderer.hand.swing();
    if (withDrops && !this.rules.infiniteItems && def.crop) {
      this.dropCrop(x, y, z, def.crop);
      this.player.onBlockBroken();
    } else if (withDrops && !this.rules.infiniteItems) {
      const held = this.player.heldItem;
      for (const drop of rollDrops(def, this.world.getMeta(x, y, z), held, this.rng)) {
        this.dropItem(x + 0.5, y + 0.5, z + 0.5, drop, 0.2);
      }
      this.dropXp(x + 0.5, y + 0.5, z + 0.5, rollXp(def, held, this.rng));
      this.damageHeldTool(1);
      this.player.onBlockBroken();
    }
    this.onBlockRemoved(x, y, z);
    this.removeBlockEntity(x, y, z);
  }

  /** 方块移除后：上方需要支撑的方块掉落 / 重力方块下落。 */
  private onBlockRemoved(x: number, y: number, z: number): void {
    const aboveId = this.world.getBlock(x, y + 1, z);
    const above = getBlock(aboveId);
    if (above.needsSupport) {
      const aboveMeta = this.world.getMeta(x, y + 1, z);
      this.world.setBlock(x, y + 1, z, BlockId.AIR);
      this.dropBlockLoot(x, y + 1, z, above, aboveMeta);
    }
    if (above.hasGravity) {
      this.pendingGravity.push({ x, y: y + 1, z });
    }
  }

  /** 植物等被水冲走时掉落物品。 */
  private onBlockWashed(x: number, y: number, z: number, id: number, meta: number): void {
    this.dropBlockLoot(x, y, z, getBlock(id), meta);
  }

  /** 在方块中心掉落其战利品（创造模式不掉落）。 */
  private dropBlockLoot(x: number, y: number, z: number, def: BlockDef, meta = 0): void {
    if (this.rules.infiniteItems) {
      return;
    }
    for (const drop of rollDrops(def, meta, null, this.rng)) {
      this.dropItem(x + 0.5, y + 0.5, z + 0.5, drop, 0.2);
    }
  }

  private pendingGravity: { x: number; y: number; z: number }[] = [];

  private tickGravityBlocks(): void {
    if (this.pendingGravity.length === 0) {
      return;
    }
    const batch = this.pendingGravity;
    this.pendingGravity = [];
    for (const pos of batch) {
      const id = this.world.getBlock(pos.x, pos.y, pos.z);
      if (!getBlock(id).hasGravity) {
        continue;
      }
      let ty = pos.y;
      while (ty - 1 >= 0 && REPLACEABLE_BLOCKS.has(this.world.getBlock(pos.x, ty - 1, pos.z))) {
        ty--;
      }
      if (ty === pos.y) {
        continue;
      }
      this.world.setBlock(pos.x, pos.y, pos.z, BlockId.AIR);
      this.world.setBlock(pos.x, ty, pos.z, id);
      // 链式：再上方的重力方块继续
      if (getBlock(this.world.getBlock(pos.x, pos.y + 1, pos.z)).hasGravity) {
        this.pendingGravity.push({ x: pos.x, y: pos.y + 1, z: pos.z });
      }
    }
  }

  private damageHeldTool(amount: number): void {
    const held = this.player.heldItem;
    if (!held) {
      return;
    }
    const def = getItem(held.id);
    const durability = def?.tool?.durability ?? def?.durability;
    if (!durability) {
      return;
    }
    if (unbreakingSkips(enchantLevel(held, EnchantmentId.UNBREAKING), false, this.rng)) {
      return;
    }
    const damage = (held.damage ?? 0) + amount;
    if (damage >= durability) {
      this.player.inventory.set(this.player.selectedSlot, null);
      this.sound.play('break');
      return;
    }
    this.player.inventory.set(this.player.selectedSlot, { ...held, damage });
  }

  private useItem(): void {
    if (this.tryToggleRide()) {
      return;
    }
    const hit = this.currentHit;
    const held = this.player.heldItem;
    const p = this.player;
    this.useCooldown = PLACE_COOLDOWN_TICKS;
    if (hit && !p.isSneaking) {
      const targetDef = getBlock(this.world.getBlock(hit.x, hit.y, hit.z));
      if (targetDef.interactive && this.interactWithBlock(targetDef, hit)) {
        return;
      }
    }
    if (!held) {
      return;
    }
    const def = getItem(held.id);
    if (!def) {
      return;
    }
    if (def.kind === ItemKind.FOOD && def.food) {
      if (p.canEat || !this.rules.usesHunger) {
        p.eat(def.food.hunger, def.food.saturation);
        this.sound.play('eat');
        this.useCooldown = EAT_COOLDOWN_TICKS;
        if (def.food.leftover) {
          // 蘑菇煲这类吃完留个空容器（与桶 / 玻璃瓶一致，创造模式不消耗也不换）
          this.replaceHeldItem(def.food.leftover);
        } else if (!this.rules.infiniteItems) {
          p.inventory.consume(p.selectedSlot, 1);
        }
        this.renderer.hand.swing();
      }
      return;
    }
    if (def.id === BOW_ITEM_ID) {
      this.drawBow();
      return;
    }
    if (THROWN_ITEM_IDS.has(def.id)) {
      this.throwItem(def.id);
      return;
    }
    if (def.potion) {
      if (def.splash) {
        this.throwPotion(held);
      } else {
        this.drinkPotion(def.potion);
      }
      return;
    }
    if (def.id === 'glass_bottle' && this.tryFillBottle()) {
      return;
    }
    if (def.id === ENDER_EYE_ITEM && this.useEnderEye(hit)) {
      return;
    }
    if (def.id === MINECART_ITEM && hit && this.tryPlaceMinecart(hit)) {
      return;
    }
    if (def.id === 'shears' && this.tryShearMob()) {
      return;
    }
    if (def.id === 'bucket' && this.tryMilkCow()) {
      return;
    }
    if (def.id === 'flint_and_steel' && hit && this.tryIgnite(hit)) {
      return;
    }
    if (def.id === 'milk_bucket') {
      // 原版行为：喝牛奶清掉身上所有状态效果
      this.player.clearEffects();
      this.replaceHeldItem('bucket');
      this.sound.play('drink');
      this.renderer.hand.swing();
      return;
    }
    if (BUCKET_FLUIDS[def.id] !== undefined && this.tryUseBucket(def.id, hit)) {
      return;
    }
    if (this.tryFeedMob(def.id)) {
      return;
    }
    if (def.tool?.type === ToolType.HOE && hit && this.tryTill(hit)) {
      return;
    }
    if (hit && this.tryPlantSeeds(def.id, hit)) {
      return;
    }
    if (def.kind === ItemKind.BLOCK && def.blockId !== undefined && hit) {
      this.tryPlaceBlock(def.blockId, hit, def.blockMeta ?? 0);
      return;
    }
    // 红石粉 / 线：方块本身没有物品形态，手里的材料放下去变成对应方块
    const materialBlock = blockForMaterial(def.id);
    if (materialBlock !== null && hit) {
      this.tryPlaceBlock(materialBlock, hit);
    }
  }

  /** 喝药水：给自己挂上效果，瓶子变回玻璃瓶（水瓶喝了什么也不发生）。 */
  private drinkPotion(potionId: string): void {
    const potion = POTION_DEFS[potionId];
    if (potion?.effect) {
      this.player.addEffect(potion.effect, potion.ticks, potion.amplifier, this);
    }
    this.replaceHeldItem('glass_bottle');
    this.sound.play('drink');
    this.useCooldown = EAT_COOLDOWN_TICKS;
    this.renderer.hand.swing();
  }

  /** 扔雪球 / 鸡蛋：和喷溅药水同一条飞行轨迹，砸中之后的效果不同。 */
  private throwItem(itemId: string): void {
    const p = this.player;
    const dir = this.lookDirection();
    const thrown = new ThrownItemEntity(itemId, p.id);
    thrown.setPosition(p.x, p.eyeY, p.z);
    thrown.vx = dir.x * SPLASH_POTION_SPEED;
    thrown.vy = dir.y * SPLASH_POTION_SPEED;
    thrown.vz = dir.z * SPLASH_POTION_SPEED;
    this.spawnEntity(thrown);
    if (!this.rules.infiniteItems) {
      p.inventory.consume(p.selectedSlot, 1);
    }
    this.sound.play('bow');
    this.useCooldown = THROW_COOLDOWN_TICKS;
    this.renderer.hand.swing();
  }

  /** 落地的雪球 / 鸡蛋：雪球把生物打退，鸡蛋有小概率孵出一只小鸡。 */
  private resolveThrownItems(): void {
    for (const e of this.entities.values()) {
      if (!(e instanceof ThrownItemEntity) || !e.impact || e.isDead) {
        continue;
      }
      e.isDead = true;
      const { x, y, z } = e.impact;
      this.sound.play('pop', Math.hypot(x - this.player.x, y - this.player.y, z - this.player.z));
      if (e.itemId === 'snowball') {
        // 1.8.9：雪球只对烈焰人有伤害，对别的生物只有击退
        const target = e.hitEntity;
        if (target instanceof Mob && !target.isDead) {
          if (target.type === MobType.BLAZE) {
            target.hurt(this, SNOWBALL_BLAZE_DAMAGE, this.player);
          }
          // 击退方向按"从落点推开"算
          target.applyKnockback(x, z);
        }
        continue;
      }
      if (this.rng() < EGG_HATCH_CHANCE) {
        const chick = new Mob(MobType.CHICKEN);
        chick.setPosition(x, y, z);
        chick.setBaby(true);
        this.spawnEntity(chick);
      }
    }
  }

  /** 扔出喷溅药水：从眼睛位置沿视线飞出。 */
  private throwPotion(held: ItemStack): void {
    const p = this.player;
    const dir = this.lookDirection();
    const potion = new ThrownPotionEntity({ id: held.id, count: 1 }, p.id);
    potion.setPosition(p.x, p.eyeY, p.z);
    potion.vx = dir.x * SPLASH_POTION_SPEED;
    potion.vy = dir.y * SPLASH_POTION_SPEED;
    potion.vz = dir.z * SPLASH_POTION_SPEED;
    this.spawnEntity(potion);
    if (!this.rules.infiniteItems) {
      p.inventory.consume(p.selectedSlot, 1);
    }
    this.sound.play('bow');
    this.renderer.hand.swing();
  }

  /** 已经碎掉的喷溅药水：给范围内的活体上效果，离得越远效果越短。 */
  private resolveSplashImpacts(): void {
    for (const e of this.entities.values()) {
      if (!(e instanceof ThrownPotionEntity) || !e.impact || e.isDead) {
        continue;
      }
      e.isDead = true;
      const { x, y, z } = e.impact;
      const potion = POTION_DEFS[getItem(e.stack.id)?.potion ?? ''];
      this.renderer.particles.spawnBlockBreak(
        x - 0.5,
        y - 0.5,
        z - 0.5,
        SPLASH_PARTICLE_TEXTURE,
        SPLASH_PARTICLE_COUNT,
        1,
      );
      this.sound.play('break', Math.hypot(x - this.player.x, y - this.player.y, z - this.player.z));
      if (!potion) {
        continue;
      }
      for (const target of this.livingEntitiesNear(x, y, z, SPLASH_POTION_RADIUS)) {
        const factor = 1 - Math.sqrt(target.distanceSqToPoint(x, y, z)) / SPLASH_POTION_RADIUS;
        if (potion.effect === undefined) {
          // 水瓶：只灭火
          target.fireTicks = 0;
          continue;
        }
        const ticks = Math.floor(potion.ticks * Math.max(SPLASH_POTION_MIN_FACTOR, factor));
        target.addEffect(potion.effect, ticks, potion.amplifier, this);
      }
    }
  }

  /** 玻璃瓶对着水右键装成水瓶（不消耗水源，1.8.9 同）。 */
  private tryFillBottle(): boolean {
    const p = this.player;
    const dir = this.lookDirection();
    const fluidHit = raycastBlocks(this.world, p.x, p.eyeY, p.z, dir.x, dir.y, dir.z, this.rules.reach, true);
    if (!fluidHit || this.world.getBlock(fluidHit.x, fluidHit.y, fluidHit.z) !== BlockId.WATER) {
      return false;
    }
    this.replaceHeldItem(potionItemId(PotionBase.WATER));
    this.renderer.hand.swing();
    return true;
  }

  /**
   * 末影之眼：对着末地传送门框架用就镶上去（12 块齐了就点亮传送门）；
   * 对着别处用则报出最近要塞的方向与距离（代替原版"扔出去追着飞"的表现）。
   * @returns 是否已处理
   */
  private useEnderEye(hit: RayHit | null): boolean {
    if (hit && this.world.getBlock(hit.x, hit.y, hit.z) === BlockId.END_PORTAL_FRAME) {
      return this.fillPortalFrame(hit);
    }
    const stronghold = this.nearestStronghold();
    if (!stronghold) {
      return false;
    }
    const dx = stronghold.centerX - this.player.x;
    const dz = stronghold.centerZ - this.player.z;
    const distance = Math.round(Math.hypot(dx, dz));
    this.showToast(`要塞在${compassLabel(dx, dz)}方向约 ${distance} 格`);
    this.renderer.hand.swing();
    this.useCooldown = EAT_COOLDOWN_TICKS;
    return true;
  }

  /** 离玩家最近的要塞。 */
  private nearestStronghold(): Stronghold | null {
    const generator = this.dimensionOf(DimensionId.OVERWORLD).generator;
    if (!(generator instanceof TerrainGenerator)) {
      return null;
    }
    return generator.strongholds?.nearest(this.player.x, this.player.z) ?? null;
  }

  /**
   * 往框架里镶一颗末影之眼；12 块都镶好就把中间 3×3 点成末地传送门。
   * @returns 是否镶上了
   */
  private fillPortalFrame(hit: RayHit): boolean {
    const meta = this.world.getMeta(hit.x, hit.y, hit.z);
    if ((meta & PORTAL_FRAME_EYE_BIT) !== 0) {
      return false;
    }
    this.world.setMeta(hit.x, hit.y, hit.z, meta | PORTAL_FRAME_EYE_BIT);
    this.sound.play('place');
    this.renderer.hand.swing();
    if (!this.rules.infiniteItems) {
      this.player.inventory.consume(this.player.selectedSlot, 1);
    }
    this.tryActivateEndPortal(hit.x, hit.y, hit.z);
    return true;
  }

  /** 框架围成的 3×3 里全是镶好眼的框架时，点亮末地传送门。 */
  private tryActivateEndPortal(x: number, y: number, z: number): void {
    // 从被点的框架往回推出中心：框架在半径 2 的方环上
    for (let cz = z - PORTAL_FRAME_RADIUS; cz <= z + PORTAL_FRAME_RADIUS; cz++) {
      for (let cx = x - PORTAL_FRAME_RADIUS; cx <= x + PORTAL_FRAME_RADIUS; cx++) {
        if (this.isPortalFrameComplete(cx, y, cz)) {
          this.lightEndPortal(cx, y, cz);
          return;
        }
      }
    }
  }

  /** 以 (cx, y, cz) 为中心的框架是否 12 块都镶好了眼。 */
  private isPortalFrameComplete(cx: number, y: number, cz: number): boolean {
    for (let dz = -PORTAL_FRAME_RADIUS; dz <= PORTAL_FRAME_RADIUS; dz++) {
      for (let dx = -PORTAL_FRAME_RADIUS; dx <= PORTAL_FRAME_RADIUS; dx++) {
        const onEdge = Math.abs(dx) === PORTAL_FRAME_RADIUS || Math.abs(dz) === PORTAL_FRAME_RADIUS;
        const isCorner = Math.abs(dx) === PORTAL_FRAME_RADIUS && Math.abs(dz) === PORTAL_FRAME_RADIUS;
        if (!onEdge || isCorner) {
          continue;
        }
        if (this.world.getBlock(cx + dx, y, cz + dz) !== BlockId.END_PORTAL_FRAME) {
          return false;
        }
        if ((this.world.getMeta(cx + dx, y, cz + dz) & PORTAL_FRAME_EYE_BIT) === 0) {
          return false;
        }
      }
    }
    return true;
  }

  private lightEndPortal(cx: number, y: number, cz: number): void {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        this.world.setBlock(cx + dx, y, cz + dz, BlockId.END_PORTAL);
      }
    }
    this.sound.play('level');
    this.showToast('末地传送门被激活了');
  }

  /** 打火石：在命中面外侧点一团火。 */
  private tryIgnite(hit: RayHit): boolean {
    if (!this.rules.canModifyBlocks) {
      return false;
    }
    const px = hit.x + hit.nx;
    const py = hit.y + hit.ny;
    const pz = hit.z + hit.nz;
    if (!this.world.inBounds(px, py, pz) || this.world.getBlock(px, py, pz) !== BlockId.AIR) {
      return false;
    }
    // 点在黑曜石框架里就是开传送门，否则才是点一团火
    if (this.world.getBlock(hit.x, hit.y, hit.z) === BlockId.OBSIDIAN && tryLightPortal(this.world, px, py, pz)) {
      this.sound.play('fizz', 0);
      this.renderer.hand.swing();
      this.damageHeldTool(1);
      return true;
    }
    this.world.setBlock(px, py, pz, BlockId.FIRE, 0);
    this.sound.play('fuse', 0);
    this.renderer.hand.swing();
    this.damageHeldTool(1);
    return true;
  }

  /** 空桶对着牛右键挤奶。 */
  private tryMilkCow(): boolean {
    const target = this.findEntityInCrosshair();
    if (!(target instanceof Mob) || target.type !== MobType.COW || target.isBaby) {
      return false;
    }
    this.replaceHeldItem('milk_bucket');
    this.renderer.hand.swing();
    return true;
  }

  /**
   * 桶：空桶装起流体源、装满的桶把流体倒出来。
   * @returns 是否已处理
   */
  private tryUseBucket(itemId: string, hit: RayHit | null): boolean {
    if (!this.rules.canModifyBlocks) {
      return false;
    }
    const fluid = BUCKET_FLUIDS[itemId];
    if (fluid === BlockId.AIR) {
      return this.tryFillBucket();
    }
    if (!hit) {
      return false;
    }
    const px = hit.x + hit.nx;
    const py = hit.y + hit.ny;
    const pz = hit.z + hit.nz;
    if (!this.world.inBounds(px, py, pz) || !REPLACEABLE_BLOCKS.has(this.world.getBlock(px, py, pz))) {
      return false;
    }
    if (fluid === BlockId.WATER && this.current.def.waterEvaporates) {
      // 下界没有水：倒出来的一瞬间就蒸发，桶照样变空
      this.replaceHeldItem('bucket');
      this.sound.play('fizz');
      this.renderer.hand.swing();
      return true;
    }
    this.world.setBlock(px, py, pz, fluid, WATER_SOURCE_META);
    this.replaceHeldItem('bucket');
    this.sound.play('place');
    this.renderer.hand.swing();
    return true;
  }

  /** 空桶：把准星指向的流体源装进桶里。 */
  private tryFillBucket(): boolean {
    const p = this.player;
    const dir = this.lookDirection();
    const fluidHit = raycastBlocks(this.world, p.x, p.eyeY, p.z, dir.x, dir.y, dir.z, this.rules.reach, true);
    if (!fluidHit) {
      return false;
    }
    const id = this.world.getBlock(fluidHit.x, fluidHit.y, fluidHit.z);
    const filled = FILLED_BUCKETS[id];
    if (!filled || this.world.getMeta(fluidHit.x, fluidHit.y, fluidHit.z) !== WATER_SOURCE_META) {
      return false;
    }
    this.world.setBlock(fluidHit.x, fluidHit.y, fluidHit.z, BlockId.AIR);
    this.replaceHeldItem(filled);
    this.renderer.hand.swing();
    return true;
  }

  /** 把手上的一个物品换成另一个（桶的装 / 倒）。创造模式不消耗也不发放。 */
  private replaceHeldItem(itemId: string): void {
    if (this.rules.infiniteItems) {
      return;
    }
    const held = this.player.heldItem;
    if (!held) {
      return;
    }
    if (held.count > 1) {
      this.player.inventory.consume(this.player.selectedSlot, 1);
      const remaining = this.player.inventory.add({ id: itemId, count: 1 });
      if (remaining > 0) {
        this.dropItem(this.player.x, this.player.eyeY, this.player.z, { id: itemId, count: remaining }, 0.2);
      }
      return;
    }
    this.player.inventory.set(this.player.selectedSlot, { id: itemId, count: 1 });
  }

  /** 用剪刀剪准星里的羊。 */
  private tryShearMob(): boolean {
    const target = this.findEntityInCrosshair();
    if (!(target instanceof Mob)) {
      return false;
    }
    const wool = target.shear(this.rng);
    if (wool === 0) {
      return false;
    }
    this.dropItem(target.x, target.y + target.height * 0.5, target.z, { id: 'wool', count: wool }, 0.2);
    this.sound.play('break', 0);
    this.renderer.hand.swing();
    this.damageHeldTool(1);
    return true;
  }

  /** 用手里的食物喂准星里的动物，让它进入求爱状态。 */
  private tryFeedMob(itemId: string): boolean {
    const target = this.findEntityInCrosshair();
    if (!(target instanceof Mob) || !target.canBreedWith(itemId)) {
      return false;
    }
    target.enterLove();
    this.spawnHeartParticles(target);
    this.renderer.hand.swing();
    if (!this.rules.infiniteItems) {
      this.player.inventory.consume(this.player.selectedSlot, 1);
    }
    return true;
  }

  /** 求爱 / 繁殖成功时在动物头顶冒爱心。 */
  private spawnHeartParticles(mob: Mob): void {
    for (let i = 0; i < HEART_PARTICLE_COUNT; i++) {
      this.renderer.particles.spawn(
        mob.x + (Math.random() - 0.5) * mob.width,
        mob.y + mob.height * 0.9,
        mob.z + (Math.random() - 0.5) * mob.width,
        HEART_PARTICLE_TEXTURE,
        { speed: 1.2, minLife: 0.6, maxLife: 1, size: 0.18 },
      );
    }
  }

  /** 两只同类动物都在求爱状态且靠得够近时生一只幼崽。 */
  private tickBreeding(): void {
    const mobs: Mob[] = [];
    for (const e of this.entities.values()) {
      if (e instanceof Mob && e.loveTicks > 0 && e.health > 0) {
        mobs.push(e);
      }
    }
    for (let i = 0; i < mobs.length; i++) {
      for (let j = i + 1; j < mobs.length; j++) {
        const a = mobs[i];
        const b = mobs[j];
        if (a.loveTicks === 0 || b.loveTicks === 0 || a.type !== b.type) {
          continue;
        }
        const dist = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        if (dist > MOB_MATE_SEEK_RANGE) {
          continue;
        }
        if (dist > MOB_BREED_RANGE) {
          // 还不够近：互相走过去
          a.mateTarget ??= b;
          b.mateTarget ??= a;
          continue;
        }
        this.breed(a, b);
      }
    }
  }

  /** 生一只幼崽并让父母进入繁殖冷却。 */
  private breed(a: Mob, b: Mob): void {
    this.achievements.onBred(a.type);
    a.loveTicks = 0;
    b.loveTicks = 0;
    a.mateTarget = null;
    b.mateTarget = null;
    a.breedCooldown = MOB_BREED_COOLDOWN_TICKS;
    b.breedCooldown = MOB_BREED_COOLDOWN_TICKS;
    const baby = new Mob(a.type);
    baby.setBaby(true);
    baby.setPosition((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    this.entities.set(baby.id, baby);
    this.spawnHeartParticles(baby);
    const xp = MOB_BREED_XP_MIN + Math.floor(this.rng() * (MOB_BREED_XP_MAX - MOB_BREED_XP_MIN + 1));
    this.dropXp(baby.x, baby.y + baby.height, baby.z, xp);
  }

  /** 锄地：对着草方块或泥土的顶面用锄，且上方是空的，变成耕地。 */
  private tryTill(hit: RayHit): boolean {
    if (!this.rules.canModifyBlocks || hit.ny !== 1) {
      return false;
    }
    const id = this.world.getBlock(hit.x, hit.y, hit.z);
    if (id !== BlockId.GRASS && id !== BlockId.DIRT) {
      return false;
    }
    if (this.world.getBlock(hit.x, hit.y + 1, hit.z) !== BlockId.AIR) {
      return false;
    }
    this.world.setBlock(hit.x, hit.y, hit.z, BlockId.FARMLAND);
    this.sound.play('place');
    this.renderer.hand.swing();
    this.damageHeldTool(1);
    return true;
  }

  /** 播种：对着耕地顶面用种子 / 胡萝卜 / 土豆。 */
  private tryPlantSeeds(itemId: string, hit: RayHit): boolean {
    const cropBlock = cropBlockForSeed(itemId);
    if (cropBlock === null || !this.rules.canModifyBlocks || hit.ny !== 1) {
      return false;
    }
    const soil = getBlock(cropBlock).crop?.soil ?? BlockId.FARMLAND;
    if (this.world.getBlock(hit.x, hit.y, hit.z) !== soil) {
      return false;
    }
    if (this.world.getBlock(hit.x, hit.y + 1, hit.z) !== BlockId.AIR) {
      return false;
    }
    this.world.setBlock(hit.x, hit.y + 1, hit.z, cropBlock, 0);
    this.sound.play('place');
    this.renderer.hand.swing();
    if (!this.rules.infiniteItems) {
      this.player.inventory.consume(this.player.selectedSlot, 1);
    }
    return true;
  }

  private interactWithBlock(def: BlockDef, hit: RayHit): boolean {
    switch (def.id) {
      case BlockId.CRAFTING_TABLE:
        this.openScreen(Screen.CRAFTING, { x: hit.x, y: hit.y, z: hit.z });
        return true;
      case BlockId.CHEST:
      case BlockId.TRAPPED_CHEST:
        this.blockEntities.getOrCreate(hit.x, hit.y, hit.z, () => ({
          type: BlockEntityType.CHEST,
          items: new Array<ItemStack | null>(CHEST_SLOT_COUNT).fill(null),
        }));
        this.sound.play('chest');
        this.openScreen(Screen.CHEST, { x: hit.x, y: hit.y, z: hit.z });
        return true;
      case BlockId.FURNACE:
        this.blockEntities.getOrCreate(hit.x, hit.y, hit.z, () => ({
          type: BlockEntityType.FURNACE,
          state: createFurnace(),
        }));
        this.openScreen(Screen.FURNACE, { x: hit.x, y: hit.y, z: hit.z });
        return true;
      case BlockId.BREWING_STAND:
        this.blockEntities.getOrCreate(hit.x, hit.y, hit.z, () => ({
          type: BlockEntityType.BREWING_STAND,
          state: createBrewingStand(),
        }));
        this.openScreen(Screen.BREWING, { x: hit.x, y: hit.y, z: hit.z });
        return true;
      case BlockId.ENCHANTING_TABLE:
        this.enchantShelves = this.countBookshelves(hit.x, hit.y, hit.z);
        this.rerollEnchantSeed();
        this.openScreen(Screen.ENCHANTING, { x: hit.x, y: hit.y, z: hit.z });
        return true;
      case BlockId.ANVIL:
        this.anvilNameText = '';
        this.openScreen(Screen.ANVIL, { x: hit.x, y: hit.y, z: hit.z });
        return true;
      case BlockId.BEACON:
        this.openScreen(Screen.BEACON, { x: hit.x, y: hit.y, z: hit.z });
        return true;
      case BlockId.HOPPER:
        this.blockEntities.getOrCreate(hit.x, hit.y, hit.z, () => ({
          type: BlockEntityType.HOPPER,
          items: new Array<ItemStack | null>(HOPPER_SLOT_COUNT).fill(null),
          cooldown: 0,
        }));
        this.openScreen(Screen.CHEST, { x: hit.x, y: hit.y, z: hit.z });
        return true;
      case BlockId.DISPENSER:
      case BlockId.DROPPER:
        this.blockEntities.getOrCreate(hit.x, hit.y, hit.z, () => ({
          type: BlockEntityType.DISPENSER,
          items: new Array<ItemStack | null>(DISPENSER_SLOT_COUNT).fill(null),
        }));
        this.openScreen(Screen.CHEST, { x: hit.x, y: hit.y, z: hit.z });
        return true;
      case BlockId.LEVER:
        this.toggleLever(hit.x, hit.y, hit.z);
        return true;
      case BlockId.STONE_BUTTON:
        this.pressButton(hit.x, hit.y, hit.z);
        return true;
      case BlockId.REPEATER:
      case BlockId.REPEATER_ON:
        this.cycleRepeaterDelay(hit.x, hit.y, hit.z);
        return true;
      case BlockId.COMPARATOR:
        this.toggleComparatorMode(hit.x, hit.y, hit.z);
        return true;
      case BlockId.NOTE_BLOCK:
        this.cycleNote(hit.x, hit.y, hit.z);
        return true;
      case BlockId.BED:
        this.useBed(hit.x, hit.y, hit.z);
        return true;
      case BlockId.WOODEN_DOOR:
      case BlockId.FENCE_GATE:
      case BlockId.TRAPDOOR:
        this.toggleDoor(hit.x, hit.y, hit.z);
        return true;
      case BlockId.CAKE:
        return this.eatCakeSlice(hit.x, hit.y, hit.z);
      case BlockId.TNT:
        this.primeTnt(hit.x, hit.y, hit.z);
        return true;
      default:
        return false;
    }
  }

  /**
   * 放置时按点击位置与朝向算出 meta：
   * 半砖分上下半，楼梯的高侧朝玩家视线方向、点在上半则上下颠倒。
   */
  private placementMeta(def: BlockDef, hit: RayHit): number {
    if (def.id === BlockId.RAIL || def.id === BlockId.POWERED_RAIL) {
      // 铁轨按玩家面朝的轴铺：看得更偏 X 就铺东西向，否则南北向
      const [dx, dz] = this.lookHorizontal();
      return Math.abs(dx) >= Math.abs(dz) ? RailShape.EAST_WEST : RailShape.NORTH_SOUTH;
    }
    if (def.shape === BlockShape.BED || def.shape === BlockShape.FENCE_GATE) {
      // 床头朝视线方向（放在玩家前方）；栅栏门的门板横在视线方向上
      return this.lookFacingIndex();
    }
    if (def.shape === BlockShape.LADDER) {
      // 梯子贴在被点击的那面墙上，正面朝命中面的法线方向
      return facingIndexOf(hit.nx, hit.nz);
    }
    if (def.hasFacing) {
      // 正面朝向玩家：与视线方向相反
      const [dx, dz] = this.lookHorizontal();
      return facingIndexOf(-dx, -dz);
    }
    if (def.shape === BlockShape.SIGN) {
      // 点侧面就挂在那面墙上（正面朝外），点顶面就立在地上、正面朝玩家
      if (hit.ny === 0) {
        return facingIndexOf(hit.nx, hit.nz) | SIGN_WALL_BIT;
      }
      const [dx, dz] = this.lookHorizontal();
      return facingIndexOf(-dx, -dz);
    }
    if (def.shape === BlockShape.TRAPDOOR) {
      // 铰链朝玩家点的那面墙；点上半格就装在格子上沿
      const upper = hit.ny < 0 || (hit.ny === 0 && hit.hy - Math.floor(hit.hy) >= 0.5);
      const [dx, dz] = this.lookHorizontal();
      return facingIndexOf(-dx, -dz) | (upper ? TRAPDOOR_TOP_BIT : 0);
    }
    if (def.shape !== BlockShape.SLAB && def.shape !== BlockShape.STAIRS) {
      return 0;
    }
    const upperHalf = hit.ny < 0 || (hit.ny === 0 && hit.hy - Math.floor(hit.hy) >= 0.5);
    if (def.shape === BlockShape.SLAB) {
      return upperHalf ? SLAB_TOP_BIT : 0;
    }
    return this.lookFacingIndex() | (upperHalf ? STAIRS_FLIP_BIT : 0);
  }

  /** 床要占两格：床尾在点击处、床头在视线方向，两格都得是空的且下方有支撑。 */
  private canPlaceBed(x: number, y: number, z: number, meta: number): boolean {
    const [fx, fz] = FACINGS[meta & FACING_MASK];
    const hx = x + fx;
    const hz = z + fz;
    if (!this.world.inBounds(hx, y, hz)) {
      return false;
    }
    if (!REPLACEABLE_BLOCKS.has(this.world.getBlock(hx, y, hz))) {
      return false;
    }
    return this.world.isSolidAt(x, y - 1, z) && this.world.isSolidAt(hx, y - 1, hz);
  }

  /** 取某个方块的选中线框包围盒（连接型方块要先算四邻连接）。 */
  private outlineBoxAt(x: number, y: number, z: number): BlockBox {
    const def = getBlock(this.world.getBlock(x, y, z));
    const connections = needsConnections(def)
      ? computeConnections(def, (dx, dz) => getBlock(this.world.getBlock(x + dx, y, z + dz)))
      : 0;
    return outlineBox(def, this.world.getMeta(x, y, z), connections);
  }

  /** 门要占上下两格，且下方得有支撑。 */
  private canPlaceDoor(x: number, y: number, z: number): boolean {
    if (!this.world.inBounds(x, y + 1, z) || !REPLACEABLE_BLOCKS.has(this.world.getBlock(x, y + 1, z))) {
      return false;
    }
    return this.world.isSolidAt(x, y - 1, z);
  }

  /** 双格方块（床 / 门）另一半的坐标；不是双格方块时返回 null。 */
  private multiBlockPartner(x: number, y: number, z: number): { x: number; y: number; z: number } | null {
    const shape = getBlock(this.world.getBlock(x, y, z)).shape;
    const meta = this.world.getMeta(x, y, z);
    if (shape === BlockShape.BED) {
      const [fx, fz] = FACINGS[meta & FACING_MASK];
      const sign = (meta & BED_HEAD_BIT) === 0 ? 1 : -1;
      return { x: x + fx * sign, y, z: z + fz * sign };
    }
    if (shape === BlockShape.DOOR) {
      return { x, y: y + ((meta & DOOR_UPPER_BIT) === 0 ? 1 : -1), z };
    }
    return null;
  }

  /** 对着同种半砖的开放面再放一块 → 合并成双层方块；返回是否已处理。 */
  private tryMergeSlab(def: BlockDef, hit: RayHit): boolean {
    if (def.shape !== BlockShape.SLAB || def.doubleSlabId === undefined) {
      return false;
    }
    if (this.world.getBlock(hit.x, hit.y, hit.z) !== def.id) {
      return false;
    }
    const isTopHalf = (this.world.getMeta(hit.x, hit.y, hit.z) & SLAB_TOP_BIT) !== 0;
    const clickedUpperHalf = hit.ny > 0 || (hit.ny === 0 && hit.hy - Math.floor(hit.hy) >= 0.5);
    if (isTopHalf === clickedUpperHalf) {
      return false;
    }
    this.world.setBlock(hit.x, hit.y, hit.z, def.doubleSlabId);
    this.sound.play('place');
    this.renderer.hand.swing();
    if (!this.rules.infiniteItems) {
      this.player.inventory.consume(this.player.selectedSlot, 1);
    }
    return true;
  }

  private tryPlaceBlock(blockId: number, hit: RayHit, variantMeta = 0): void {
    if (!this.rules.canModifyBlocks) {
      return;
    }
    const def = getBlock(blockId);
    if (this.tryMergeSlab(def, hit)) {
      return;
    }
    let px = hit.x + hit.nx;
    let py = hit.y + hit.ny;
    let pz = hit.z + hit.nz;
    const targetId = this.world.getBlock(hit.x, hit.y, hit.z);
    if (REPLACEABLE_BLOCKS.has(targetId) && targetId !== BlockId.AIR) {
      px = hit.x;
      py = hit.y;
      pz = hit.z;
    }
    if (!this.world.inBounds(px, py, pz)) {
      return;
    }
    const existing = this.world.getBlock(px, py, pz);
    if (!REPLACEABLE_BLOCKS.has(existing)) {
      return;
    }
    if (def.needsSupport && !this.world.isSolidAt(px, py - 1, pz)) {
      return;
    }
    const meta = this.placementMeta(def, hit) | variantMeta;
    if (def.shape === BlockShape.BED && !this.canPlaceBed(px, py, pz, meta)) {
      return;
    }
    if (def.shape === BlockShape.DOOR && !this.canPlaceDoor(px, py, pz)) {
      return;
    }
    // 梯子只能贴在竖直墙面上
    if (def.shape === BlockShape.LADDER && (hit.ny !== 0 || !this.world.isSolidAt(hit.x, hit.y, hit.z))) {
      return;
    }
    if (def.solid) {
      for (const b of collisionBoxes(def, meta)) {
        const box = new AABB(px + b.x0, py + b.y0, pz + b.z0, px + b.x1, py + b.y1, pz + b.z1);
        if (box.intersects(this.player.box())) {
          return;
        }
        for (const e of this.entities.values()) {
          if (e instanceof Mob && box.intersects(e.box())) {
            return;
          }
        }
      }
    }
    if (this.sendBlockIntent(px, py, pz, blockId, meta)) {
      this.playBlockSound(placeSound(soundGroupOf(def)), px, py, pz, 'place');
      if (!this.rules.infiniteItems) {
        this.player.inventory.consume(this.player.selectedSlot, 1);
      }
      return;
    }
    this.world.setBlock(px, py, pz, blockId, meta);
    this.playBlockSound(placeSound(soundGroupOf(def)), px, py, pz, 'place');
    if (blockId === BlockId.WITHER_SKULL) {
      this.trySummonWither(px, py, pz);
    }
    if (blockId === BlockId.SIGN) {
      this.beginEditingSign(px, py, pz);
    }
    this.achievements.addStat(StatId.BLOCKS_PLACED);
    if (def.shape === BlockShape.BED) {
      const [fx, fz] = FACINGS[meta & FACING_MASK];
      this.world.setBlock(px + fx, py, pz + fz, blockId, meta | BED_HEAD_BIT);
    }
    if (def.shape === BlockShape.DOOR) {
      this.world.setBlock(px, py + 1, pz, blockId, meta | DOOR_UPPER_BIT);
    }
    this.sound.play('place');
    this.renderer.hand.swing();
    if (!this.rules.infiniteItems) {
      this.player.inventory.consume(this.player.selectedSlot, 1);
    }
    if (def.hasGravity) {
      this.pendingGravity.push({ x: px, y: py, z: pz });
    }
  }

  private pickBlock(): void {
    if (!this.rules.infiniteItems || !this.currentHit) {
      return;
    }
    const { x, y, z } = this.currentHit;
    const def = getBlock(this.world.getBlock(x, y, z));
    const item = getItem(blockVariant(def, this.world.getMeta(x, y, z)).name);
    if (!item) {
      return;
    }
    this.player.inventory.set(this.player.selectedSlot, { id: item.id, count: 1 });
  }

  private tryAttack(): void {
    if (this.attackCooldown > 0) {
      return;
    }
    if (this.tryReflectFireball() || this.tryBreakCrystal()) {
      return;
    }
    const target = this.findEntityInCrosshair();
    if (!target) {
      return;
    }
    this.attackCooldown = ATTACK_COOLDOWN_TICKS;
    // 力量 / 虚弱与锋利直接加减近战伤害（1.8.9 的算法）
    const held = this.player.heldItem;
    const damage = Math.max(
      0,
      getAttackDamage(held?.id ?? null) +
        this.player.meleeDamageBonus +
        enchantLevel(held, EnchantmentId.SHARPNESS) * SHARPNESS_DAMAGE_PER_LEVEL,
    );
    target.lastDamageCause = 'mob';
    if (target.hurt(this, damage, this.player, true)) {
      this.achievements.onDamageDealt(damage);
      this.sound.play('hit');
      this.player.onAttack();
      const knockback = enchantLevel(held, EnchantmentId.KNOCKBACK);
      if (knockback > 0) {
        target.applyKnockback(this.player.x, this.player.z, knockback * KNOCKBACK_PER_LEVEL);
      }
      const fireAspect = enchantLevel(held, EnchantmentId.FIRE_ASPECT);
      if (fireAspect > 0) {
        target.setOnFire(fireAspect * FIRE_ASPECT_TICKS_PER_LEVEL);
      }
      if (held && getItem(held.id)?.tool) {
        this.damageHeldTool(getItem(held.id)?.tool?.type === ToolType.SWORD ? 1 : 2);
      }
    }
    this.renderer.hand.swing();
  }

  /**
   * 挥手打中飞行中的恶魂火球就把它弹回去（1.8.9 的经典打法）。
   * @returns 是否打中了火球
   */
  private tryReflectFireball(): boolean {
    const dir = this.lookDirection();
    const p = this.player;
    const origin = new THREE.Vector3(p.x, p.eyeY, p.z);
    const ray = new THREE.Ray(origin, dir);
    for (const e of this.entities.values()) {
      if (!(e instanceof FireballEntity) || e.isDead) {
        continue;
      }
      const center = new THREE.Vector3(e.x, e.y, e.z);
      if (origin.distanceTo(center) > this.rules.reach + FIREBALL_REFLECT_EXTRA_REACH) {
        continue;
      }
      if (ray.distanceToPoint(center) > FIREBALL_REFLECT_TOLERANCE) {
        continue;
      }
      e.reflect(p.id);
      this.sound.play('hit');
      this.renderer.hand.swing();
      this.attackCooldown = ATTACK_COOLDOWN_TICKS;
      return true;
    }
    return false;
  }

  private findEntityInCrosshair(): LivingEntity | null {
    const dir = this.lookDirection();
    const p = this.player;
    const origin = new THREE.Vector3(p.x, p.eyeY, p.z);
    const ray = new THREE.Ray(origin, dir);
    let best: LivingEntity | null = null;
    let bestDist = this.rules.reach;
    if (this.currentHit) {
      bestDist = Math.min(bestDist, this.currentHit.distance);
    }
    const tmp = new THREE.Vector3();
    for (const e of this.entities.values()) {
      if (!(e instanceof LivingEntity) || e.health <= 0) {
        continue;
      }
      const b = e.box().expand(0.1, 0.1, 0.1);
      const box3 = new THREE.Box3(new THREE.Vector3(b.minX, b.minY, b.minZ), new THREE.Vector3(b.maxX, b.maxY, b.maxZ));
      const hit = ray.intersectBox(box3, tmp);
      if (hit) {
        const d = hit.distanceTo(origin);
        if (d < bestDist) {
          bestDist = d;
          best = e;
        }
      }
    }
    return best;
  }

  private dropHeld(entireStack: boolean): void {
    const held = this.player.heldItem;
    if (!held) {
      return;
    }
    const count = entireStack ? held.count : 1;
    const dir = this.lookDirection();
    const p = this.player;
    const drop = new ItemDropEntity({ ...held, count });
    drop.setPosition(p.x + dir.x * 0.5, p.eyeY - 0.3, p.z + dir.z * 0.5);
    drop.vx = dir.x * ITEM_DROP_SPAWN_SPEED * 1.5;
    drop.vy = dir.y * ITEM_DROP_SPAWN_SPEED + 1.5;
    drop.vz = dir.z * ITEM_DROP_SPAWN_SPEED * 1.5;
    drop.pickupDelay = 40;
    this.spawnEntity(drop);
    this.player.inventory.consume(this.player.selectedSlot, count);
  }

  private mergeItemDrops(): void {
    if (this.tick % 10 !== 0) {
      return;
    }
    const drops: ItemDropEntity[] = [];
    for (const e of this.entities.values()) {
      if (e instanceof ItemDropEntity && !e.isDead) {
        drops.push(e);
      }
    }
    for (let i = 0; i < drops.length; i++) {
      for (let j = i + 1; j < drops.length; j++) {
        const a = drops[i];
        const b = drops[j];
        if (a.isDead || b.isDead) {
          continue;
        }
        if (a.distanceSqTo(b) < 1 && a.tryMerge(b)) {
          this.entities.delete(b.id);
        }
      }
    }
  }

  // ---------------------------------------------------------------- TNT / 爆炸 / 熔炉

  private primeTnt(x: number, y: number, z: number): void {
    if (this.primedTnt.some((t) => t.x === x && t.y === y && t.z === z)) {
      return;
    }
    this.primedTnt.push({ x, y, z, ticks: TNT_FUSE_TICKS });
    this.sound.play('fuse');
  }

  private tickTnt(): void {
    if (this.primedTnt.length === 0) {
      return;
    }
    const remaining: typeof this.primedTnt = [];
    for (const tnt of this.primedTnt) {
      if (this.world.getBlock(tnt.x, tnt.y, tnt.z) !== BlockId.TNT) {
        continue;
      }
      tnt.ticks--;
      if (tnt.ticks <= 0) {
        this.world.setBlock(tnt.x, tnt.y, tnt.z, BlockId.AIR);
        this.explode(tnt.x + 0.5, tnt.y + 0.5, tnt.z + 0.5, TNT_EXPLOSION_RADIUS, -1);
      } else {
        remaining.push(tnt);
      }
    }
    this.primedTnt = remaining;
  }

  /** 熔炉与酿造台各自推进一格；有变化且正打开着对应界面时刷新 UI。 */
  private tickFurnaces(): void {
    let changed = false;
    for (const entity of this.blockEntities.values()) {
      if (entity.type === BlockEntityType.FURNACE && tickFurnace(entity.state)) {
        changed = true;
      } else if (entity.type === BlockEntityType.BREWING_STAND && tickBrewing(entity.state)) {
        changed = true;
      }
    }
    const screen = this.store.get().screen;
    if (changed && (screen === Screen.FURNACE || screen === Screen.BREWING)) {
      this.store.patch({ inventoryVersion: this.store.get().inventoryVersion + 1 });
    }
  }

  /** 当前打开的熔炉状态。 */
  get openFurnace(): FurnaceState | null {
    const pos = this.store.get().openBlock;
    if (!pos) {
      return null;
    }
    const entity = this.blockEntities.get(pos.x, pos.y, pos.z);
    return entity?.type === BlockEntityType.FURNACE ? entity.state : null;
  }

  /**
   * 附魔台周围生效的书架数：与 1.8.9 一致，数距离 2 格、同层与上一层的书架，
   * 且书架与附魔台之间那一格必须是空气。
   */
  private countBookshelves(x: number, y: number, z: number): number {
    let count = 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) {
          continue;
        }
        if (
          this.world.getBlock(x + dx, y, z + dz) !== BlockId.AIR ||
          this.world.getBlock(x + dx, y + 1, z + dz) !== BlockId.AIR
        ) {
          continue;
        }
        for (const [ox, oz] of BOOKSHELF_RING_OFFSETS[(dx + 1) * 3 + (dz + 1)]) {
          if (this.world.getBlock(x + ox, y, z + oz) === BlockId.BOOKSHELF) {
            count++;
          }
          if (this.world.getBlock(x + ox, y + 1, z + oz) === BlockId.BOOKSHELF) {
            count++;
          }
        }
      }
    }
    return Math.min(MAX_BOOKSHELVES, count);
  }

  private rerollEnchantSeed(): void {
    this.enchantSeed = Math.floor(this.rng() * 0x7fffffff);
    this.enchantOptionsCache = null;
  }

  /** 附魔台当前的三档选项（格子里没有可附魔物品时为 null）。同一种子 + 同一物品结果不变。 */
  get enchantOptions(): EnchantOption[] | null {
    const item = this.enchantingSlots[ENCHANT_ITEM_SLOT];
    const key = item ? `${this.enchantSeed}:${item.id}` : '';
    if (this.enchantOptionsCache?.key === key) {
      return this.enchantOptionsCache.options;
    }
    const options = item
      ? rollOptions(item, this.enchantShelves, createRng(this.enchantSeed ^ hashString(item.id)))
      : null;
    this.enchantOptionsCache = { key, options };
    return options;
  }

  /** 附魔台周围的书架数（UI 显示）。 */
  get enchantBookshelves(): number {
    return this.enchantShelves;
  }

  /** 玩家能不能选某一档：等级够、青金石够（创造模式免费）。 */
  canEnchant(index: number): boolean {
    const option = this.enchantOptions?.[index];
    if (!option || Object.keys(option.enchants).length === 0) {
      return false;
    }
    if (this.rules.infiniteItems) {
      return true;
    }
    const lapis = this.enchantingSlots[ENCHANT_LAPIS_SLOT];
    return this.player.xpLevel >= option.cost && (lapis?.count ?? 0) >= LAPIS_PER_OPTION[index];
  }

  /** 选择附魔台的第 index 档：扣等级与青金石，把附魔写到物品上，然后重掷种子。 */
  enchant(index: number): void {
    if (!this.canEnchant(index)) {
      return;
    }
    const option = this.enchantOptions as EnchantOption[];
    const item = this.enchantingSlots[ENCHANT_ITEM_SLOT] as ItemStack;
    this.enchantingSlots[ENCHANT_ITEM_SLOT] = applyEnchants(item, option[index].enchants);
    if (!this.rules.infiniteItems) {
      const lapis = this.enchantingSlots[ENCHANT_LAPIS_SLOT] as ItemStack;
      const left = lapis.count - LAPIS_PER_OPTION[index];
      this.enchantingSlots[ENCHANT_LAPIS_SLOT] = left > 0 ? { ...lapis, count: left } : null;
      this.player.removeXpLevels(LEVELS_PER_OPTION[index]);
    }
    this.rerollEnchantSeed();
    this.achievements.onEnchanted();
    this.sound.play('level');
    this.notifyChanged();
  }

  // ---------------------------------------------------------------- 铁砧

  /** 铁砧输入框的名字。 */
  get anvilName(): string {
    return this.anvilNameText;
  }

  /** 玩家在铁砧里改名字。 */
  setAnvilName(name: string): void {
    this.anvilNameText = name;
    this.notifyChanged();
  }

  /** 铁砧的完整计算结果（含消耗），UI 显示用；无产物为 null。 */
  get anvilPreview(): AnvilResult | null {
    return anvilResult(this.anvilSlots[0], this.anvilSlots[1], this.anvilNameText);
  }

  /** 这次铁砧操作玩家付不付得起：等级够且不超过上限（创造模式免费）。 */
  canAffordAnvil(result: AnvilResult): boolean {
    if (this.rules.infiniteItems) {
      return true;
    }
    return result.cost <= ANVIL_MAX_COST && this.player.xpLevel >= result.cost;
  }

  anvilOutput(): ItemStack | null {
    const result = this.anvilPreview;
    return result && this.canAffordAnvil(result) ? result.output : null;
  }

  consumeAnvilInputs(): void {
    const result = this.anvilPreview;
    if (!result) {
      return;
    }
    this.anvilSlots[0] = null;
    const right = this.anvilSlots[1];
    if (right && result.rightConsumed > 0) {
      const left = right.count - result.rightConsumed;
      this.anvilSlots[1] = left > 0 ? { ...right, count: left } : null;
    }
    if (!this.rules.infiniteItems) {
      this.player.removeXpLevels(result.cost);
    }
    this.anvilNameText = '';
    this.sound.play('anvil');
  }

  /** 当前打开的酿造台状态。 */
  get openBrewingStand(): BrewingState | null {
    const pos = this.store.get().openBlock;
    if (!pos) {
      return null;
    }
    const entity = this.blockEntities.get(pos.x, pos.y, pos.z);
    return entity?.type === BlockEntityType.BREWING_STAND ? entity.state : null;
  }

  /** 当前打开的箱子内容。 */
  get openChestItems(): (ItemStack | null)[] | null {
    const pos = this.store.get().openBlock;
    if (!pos) {
      return null;
    }
    const entity = this.blockEntities.get(pos.x, pos.y, pos.z);
    // 漏斗与发射器复用箱子界面
    return containerSlots(entity);
  }

  /** 收获作物：成熟掉主产物（外加种子），没长成只掉回一颗种子。 */
  private dropCrop(x: number, y: number, z: number, crop: NonNullable<BlockDef['crop']>): void {
    const cx = x + 0.5;
    const cy = y + 0.5;
    const cz = z + 0.5;
    if (this.world.getMeta(x, y, z) < (crop.maxStage ?? CROP_MAX_STAGE)) {
      this.dropItem(cx, cy, cz, { id: crop.seedItem, count: 1 }, 0.2);
      return;
    }
    const { item, min, max } = crop.produce;
    const count = min + Math.floor(this.rng() * (max - min + 1));
    if (count > 0) {
      this.dropItem(cx, cy, cz, { id: item, count }, 0.2);
    }
    if (crop.extraSeeds) {
      const seeds = crop.extraSeeds.min + Math.floor(this.rng() * (crop.extraSeeds.max - crop.extraSeeds.min + 1));
      if (seeds > 0) {
        this.dropItem(cx, cy, cz, { id: crop.seedItem, count: seeds }, 0.2);
      }
    }
  }

  /**
   * chunk 加入世界后补上世界生成留下的方块实体（战利品箱、刷怪笼）。
   * 已经存在实体的位置不覆盖——否则 chunk 卸载再加载时箱子会重新装满。
   */
  private applyPendingBlockEntities(chunk: Chunk): void {
    for (const pending of chunk.pendingBlockEntities) {
      const { x, y, z } = pending;
      if (this.blockEntities.get(x, y, z)) {
        continue;
      }
      if (pending.loot) {
        const items = new Array<ItemStack | null>(CHEST_SLOT_COUNT).fill(null);
        const loot = rollLoot(pending.loot, this.rng);
        loot.forEach((stack, i) => {
          items[Math.min(items.length - 1, i * LOOT_SLOT_STRIDE)] = stack;
        });
        this.blockEntities.set(x, y, z, { type: BlockEntityType.CHEST, items });
      } else if (pending.spawns) {
        this.blockEntities.set(x, y, z, {
          type: BlockEntityType.SPAWNER,
          x,
          y,
          z,
          mob: pending.spawns,
          delay: SPAWNER_MIN_DELAY_TICKS,
        });
      }
    }
  }

  /** 下雨时在玩家周围下雨滴 / 雪花粒子（浇火由 RandomTickSystem 在火自己的 tick 里做）。 */
  private tickWeatherEffects(): void {
    if (!this.weather.isRaining) {
      return;
    }
    const p = this.player;
    const snowing = biomeHasSnowfall(this.generator.biomeAt(Math.floor(p.x), Math.floor(p.z)));
    const texture = snowing ? 'particle_snow' : 'particle_rain';
    const count = Math.round(RAIN_PARTICLES_PER_TICK * this.weather.rainLevel);
    for (let i = 0; i < count; i++) {
      const x = p.x + (this.rng() - 0.5) * 2 * RAIN_PARTICLE_RADIUS;
      const z = p.z + (this.rng() - 0.5) * 2 * RAIN_PARTICLE_RADIUS;
      const surface = this.world.getHeight(Math.floor(x), Math.floor(z));
      // 只在露天的位置下雨：玩家头顶被挡住时不撒
      if (surface > p.eyeY + RAIN_PARTICLE_HEIGHT) {
        continue;
      }
      this.renderer.particles.spawn(x, p.y + RAIN_PARTICLE_HEIGHT, z, texture, RAIN_PARTICLE_OPTIONS);
    }
  }

  /** 刷怪笼：玩家靠近时倒计时，到点在周围生成几只生物。 */
  private tickSpawners(): void {
    for (const entity of this.blockEntities.values()) {
      if (entity.type !== BlockEntityType.SPAWNER) {
        continue;
      }
      if (this.player.distanceSqToPoint(entity.x, entity.y, entity.z) > SPAWNER_ACTIVATE_RANGE_SQ) {
        continue;
      }
      if (entity.delay > 0) {
        entity.delay--;
        continue;
      }
      entity.delay =
        SPAWNER_MIN_DELAY_TICKS + Math.floor(this.rng() * (SPAWNER_MAX_DELAY_TICKS - SPAWNER_MIN_DELAY_TICKS));
      this.spawnFromSpawner(entity.mob, entity.x, entity.y, entity.z);
    }
  }

  private spawnFromSpawner(mobType: MobType, x: number, y: number, z: number): void {
    if (!this.rules.mobsHostile) {
      return;
    }
    let nearby = 0;
    for (const e of this.entities.values()) {
      if (e instanceof Mob && e.type === mobType && e.distanceSqToPoint(x, y, z) <= SPAWNER_ACTIVATE_RANGE_SQ) {
        nearby++;
      }
    }
    if (nearby >= SPAWNER_NEARBY_LIMIT) {
      return;
    }
    const count = SPAWNER_MIN_COUNT + Math.floor(this.rng() * (SPAWNER_MAX_COUNT - SPAWNER_MIN_COUNT + 1));
    for (let i = 0; i < count; i++) {
      const sx = x + Math.floor((this.rng() - 0.5) * 2 * SPAWNER_SPAWN_RANGE);
      const sz = z + Math.floor((this.rng() - 0.5) * 2 * SPAWNER_SPAWN_RANGE);
      const sy = y + Math.floor((this.rng() - 0.5) * 2);
      this.spawner.spawnMobAt(this, mobType, sx, sy, sz);
    }
  }

  /** 方块被破坏时清掉它的方块实体，并把里面的物品掉出来。 */
  private removeBlockEntity(x: number, y: number, z: number): void {
    const entity = this.blockEntities.remove(x, y, z);
    if (!entity) {
      return;
    }
    // 刷怪笼 / 信标 / 告示牌里没有物品，直接走
    if (
      entity.type === BlockEntityType.SPAWNER ||
      entity.type === BlockEntityType.BEACON ||
      entity.type === BlockEntityType.SIGN
    ) {
      return;
    }
    const stacks: (ItemStack | null)[] =
      entity.type === BlockEntityType.FURNACE
        ? [entity.state.input, entity.state.fuel, entity.state.output]
        : entity.type === BlockEntityType.BREWING_STAND
          ? [entity.state.ingredient, ...entity.state.bottles]
          : entity.items;
    for (const stack of stacks) {
      if (stack) {
        this.dropItem(x + 0.5, y + 0.5, z + 0.5, stack, 0.2);
      }
    }
  }

  // ---------------------------------------------------------------- 背包 / 合成 UI 交互（委托 ContainerController）

  /** 当前合成结果。 */
  craftResult(): ItemStack | null {
    return this.containers.craftResult();
  }

  /** 光标物品。 */
  get cursor(): ItemStack | null {
    return this.containers.cursor;
  }

  /** 处理 UI 格子点击。 */
  handleSlotClick(ref: SlotRef, button: number, shift: boolean): void {
    this.containers.handleSlotClick(ref, button, shift);
  }

  /** 创造模式：丢弃光标物品。 */
  clearCursor(): void {
    this.containers.clearCursor();
  }

  private bumpInventory(): void {
    this.store.patch({ inventoryVersion: this.store.get().inventoryVersion + 1 });
  }

  // ---------------------------------------------------------------- ContainerHost 实现

  get inventory(): Inventory {
    return this.player.inventory;
  }

  get currentScreen(): Screen {
    return this.store.get().screen;
  }

  get isCreative(): boolean {
    return this.rules.infiniteItems;
  }

  onOutputTaken(kind: SlotRef['kind'], stack: ItemStack): void {
    if (kind === 'craftResult') {
      this.achievements.onCrafted(stack.id, stack.count);
    } else if (kind === 'furnaceOutput') {
      this.achievements.onItemObtained(stack.id);
    } else if (kind === 'brewBottle' && potionOfItem(stack.id)?.potion.effect) {
      this.achievements.onPotionBrewed();
    }
  }

  notifyChanged(): void {
    this.bumpInventory();
  }

  // ---------------------------------------------------------------- 死亡 / 复活

  private onPlayerDeath(): void {
    this.achievements.addStat(StatId.DEATHS);
    this.resetBreaking();
    const workspace = this.containers.drainWorkspace();
    if (!this.rules.infiniteItems) {
      for (const stack of [...workspace, ...this.player.inventory.drainAll()]) {
        this.dropItem(this.player.x, this.player.y + 1, this.player.z, stack, 0.5);
      }
    }
    this.player.xp = 0;
    this.player.xpLevel = 0;
    const isHardcore = this.rules.deleteWorldOnDeath;
    this.store.patch({
      screen: Screen.DEATH,
      deathMessage: this.deathMessage(),
      isHardcoreDeath: isHardcore,
    });
    this.controls.exitLock();
  }

  private killerLabel = '';

  private deathMessage(): string {
    switch (this.player.lastDamageCause) {
      case 'drown':
        return '你淹死了';
      case 'starve':
        return '你饿死了';
      case 'fall':
        return '你摔死了';
      case 'mob':
        return `你被${this.killerLabel}杀死了`;
      case 'arrow':
        return '你被骷髅射死了';
      case 'explosion':
        return '你被炸死了';
      case 'fire':
        return '你被烧死了';
      case 'lava':
        return '你试图在岩浆里游泳';
      default:
        return '';
    }
  }

  /** 复活。 */
  respawn(): void {
    if (this.rules.deleteWorldOnDeath) {
      return;
    }
    this.chunkManager.ensureLoaded(this.player.spawnX, this.player.spawnZ, SPAWN_PRELOAD_RADIUS);
    this.player.respawn();
    this.spawnProtection = SPAWN_PROTECTION_TICKS;
    this.player.lastDamageCause = 'generic';
    this.store.patch({ screen: Screen.NONE, deathMessage: '' });
    this.controls.requestLock();
  }

  /** 开 / 关一扇门或栅栏门：门的两半开合状态一起翻转。 */
  private toggleDoor(x: number, y: number, z: number): void {
    const meta = this.world.getMeta(x, y, z);
    const opened = (meta & DOOR_OPEN_BIT) === 0;
    const partner = this.multiBlockPartner(x, y, z);
    const apply = (bx: number, by: number, bz: number): void => {
      const m = this.world.getMeta(bx, by, bz);
      this.world.setMeta(bx, by, bz, opened ? m | DOOR_OPEN_BIT : m & ~DOOR_OPEN_BIT);
    };
    apply(x, y, z);
    if (partner && this.world.getBlock(partner.x, partner.y, partner.z) === this.world.getBlock(x, y, z)) {
      apply(partner.x, partner.y, partner.z);
    }
    this.sound.play('door');
  }

  /**
   * 吃一口蛋糕：饿了才吃得下，吃完最后一口蛋糕就没了。
   * @returns 是否真的吃了（吃饱时返回 false，让右键落到别的处理上）
   */
  private eatCakeSlice(x: number, y: number, z: number): boolean {
    const p = this.player;
    if (!p.canEat && this.rules.usesHunger) {
      return false;
    }
    p.eat(CAKE_SLICE_HUNGER, CAKE_SLICE_SATURATION);
    const bites = this.world.getMeta(x, y, z) + 1;
    if (bites >= CAKE_BITES) {
      this.world.setBlock(x, y, z, BlockId.AIR);
    } else {
      this.world.setBlock(x, y, z, BlockId.CAKE, bites);
    }
    this.sound.play('eat');
    this.useCooldown = EAT_COOLDOWN_TICKS;
    this.renderer.hand.swing();
    return true;
  }

  /** 右键音符盒：音高 +1（循环）并试听一下。 */
  private cycleNote(x: number, y: number, z: number): void {
    const meta = this.world.getMeta(x, y, z);
    const note = ((meta & NOTE_MASK) + 1) % NOTE_COUNT;
    this.world.setMeta(x, y, z, (meta & ~NOTE_MASK) | note);
    this.playNote(x, y, z, note);
  }

  /** 音符盒跟随红石：只在"没电 → 有电"的那一下响，持续通电不会一直响。 */
  private updateNoteBlock(x: number, y: number, z: number, powered: boolean): void {
    const meta = this.world.getMeta(x, y, z);
    const wasPowered = (meta & NOTE_POWERED_BIT) !== 0;
    if (wasPowered === powered) {
      return;
    }
    this.world.setMeta(x, y, z, powered ? meta | NOTE_POWERED_BIT : meta & ~NOTE_POWERED_BIT);
    if (powered) {
      this.playNote(x, y, z, meta & NOTE_MASK);
    }
  }

  private playNote(x: number, y: number, z: number, note: number): void {
    const p = this.player;
    this.sound.play('note', Math.hypot(x - p.x, y - p.y, z - p.z), notePitch(note));
    this.renderer.particles.spawn(x + 0.5, y + 1.1, z + 0.5, NOTE_PARTICLE_TEXTURE, NOTE_PARTICLE_OPTIONS);
  }

  /**
   * 右键床：把重生点设在床边，若是夜里且附近没有敌对生物就一觉睡到天亮。
   * （原版只在真正躺下时设置重生点，这里放宽为点一下就设，避免夜里被怪堵着白跑一趟。）
   */
  private useBed(x: number, y: number, z: number): void {
    if (this.current.def.bedExplodes) {
      this.explodeBed(x, y, z);
      return;
    }
    const foot =
      (this.world.getMeta(x, y, z) & BED_HEAD_BIT) === 0
        ? { x, y, z }
        : (this.multiBlockPartner(x, y, z) ?? { x, y, z });
    this.player.spawnX = foot.x + 0.5;
    this.player.spawnY = foot.y;
    this.player.spawnZ = foot.z + 0.5;
    const dayTick = this.timeTick % DAY_LENGTH_TICKS;
    if (dayTick < NIGHT_START_TICK || dayTick >= NIGHT_END_TICK) {
      this.showToast('重生点已设置，天亮时睡不着');
      return;
    }
    if (this.hasMonsterNearby(x, y, z)) {
      this.showToast('附近有怪物，睡不着');
      return;
    }
    this.timeTick += DAY_LENGTH_TICKS - dayTick;
    this.showToast('重生点已设置，一觉到天亮');
  }

  /** 主世界以外躺床：床炸成一个坑，玩家自己也吃伤害。 */
  private explodeBed(x: number, y: number, z: number): void {
    const partner = this.multiBlockPartner(x, y, z);
    this.world.setBlock(x, y, z, BlockId.AIR);
    if (partner) {
      this.world.setBlock(partner.x, partner.y, partner.z, BlockId.AIR);
    }
    this.explode(x + 0.5, y + 0.5, z + 0.5, BED_EXPLOSION_RADIUS, -1);
  }

  /** 床附近是否有敌对生物。 */
  private hasMonsterNearby(x: number, y: number, z: number): boolean {
    for (const e of this.entities.values()) {
      if (!(e instanceof Mob) || !e.def.hostile || e.isDead) {
        continue;
      }
      if (
        Math.abs(e.x - x) <= SLEEP_MONSTER_RADIUS &&
        Math.abs(e.y - y) <= SLEEP_MONSTER_RADIUS &&
        Math.abs(e.z - z) <= SLEEP_MONSTER_RADIUS
      ) {
        return true;
      }
    }
    return false;
  }

  private showToast(text: string): void {
    this.toastTicks = TOAST_TICKS;
    this.store.patch({ toast: text, toastVersion: this.store.get().toastVersion + 1 });
  }

  // ---------------------------------------------------------------- EntityContext 实现

  waterFlowAt(x: number, y: number, z: number): { x: number; z: number } {
    return this.fluids.flowVector(x, y, z);
  }

  get canMobsTargetPlayer(): boolean {
    return this.rules.mobsHostile && this.difficulty !== Difficulty.PEACEFUL && this.player.health > 0;
  }

  isDaytime(): boolean {
    return Sky.isDaytime(this.timeTick);
  }

  get isRaining(): boolean {
    return this.weather.isRaining;
  }

  lightLevelAt(x: number, y: number, z: number): number {
    const sky = this.world.getSkyLight(x, y, z) * this.renderer.sky.skyLevel;
    const block = this.world.getBlockLight(x, y, z);
    return Math.max(sky, block);
  }

  igniteAt(x: number, y: number, z: number): void {
    if (!this.rules.canModifyBlocks || this.world.getBlock(x, y, z) !== BlockId.AIR) {
      return;
    }
    if (!this.world.isSolidAt(x, y - 1, z)) {
      return;
    }
    this.world.setBlock(x, y, z, BlockId.FIRE, 0);
  }

  spawnEntity(entity: Entity): void {
    this.entities.set(entity.id, entity);
  }

  crystalsNear(x: number, y: number, z: number): EnderCrystalEntity[] {
    const out: EnderCrystalEntity[] = [];
    for (const e of this.entities.values()) {
      if (e instanceof EnderCrystalEntity && !e.isDead && e.distanceSqToPoint(x, y, z) <= CRYSTAL_HEAL_RANGE_SQ) {
        out.push(e);
      }
    }
    return out;
  }

  livingEntitiesNear(x: number, y: number, z: number, radius: number): LivingEntity[] {
    const radiusSq = radius * radius;
    const out: LivingEntity[] = [];
    if (this.player.distanceSqToPoint(x, y, z) <= radiusSq) {
      out.push(this.player);
    }
    for (const e of this.entities.values()) {
      if (e instanceof LivingEntity && !e.isDead && e.distanceSqToPoint(x, y, z) <= radiusSq) {
        out.push(e);
      }
    }
    return out;
  }

  dropItem(x: number, y: number, z: number, stack: ItemStack, spread = 0.2): ItemDropEntity {
    const drop = new ItemDropEntity({ ...stack });
    drop.setPosition(x, y, z);
    drop.vx = (this.rng() - 0.5) * ITEM_DROP_SPAWN_SPEED * spread * 4;
    drop.vy = ITEM_DROP_SPAWN_SPEED * (0.5 + this.rng() * 0.5);
    drop.vz = (this.rng() - 0.5) * ITEM_DROP_SPAWN_SPEED * spread * 4;
    this.spawnEntity(drop);
    return drop;
  }

  explode(x: number, y: number, z: number, radius: number, sourceId: number): void {
    this.sound.play('explode', Math.hypot(x - this.player.x, y - this.player.y, z - this.player.z));
    const r = Math.ceil(radius);
    for (let i = 0; i < EXPLOSION_PARTICLE_COUNT; i++) {
      this.renderer.particles.spawn(
        x + (Math.random() - 0.5) * radius,
        y + (Math.random() - 0.5) * radius,
        z + (Math.random() - 0.5) * radius,
        EXPLOSION_PARTICLE_TEXTURE,
        { speed: 6, minLife: 0.5, maxLife: 1.4, size: 0.25, brightness: 1 },
      );
    }
    this.world.batch(() => this.destroyBlocksInRadius(x, y, z, radius, r));
    this.damageEntitiesByExplosion(x, y, z, radius, sourceId);
  }

  private destroyBlocksInRadius(x: number, y: number, z: number, radius: number, r: number): void {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dz = -r; dz <= r; dz++) {
          const distSq = dx * dx + dy * dy + dz * dz;
          if (distSq > radius * radius) {
            continue;
          }
          const bx = Math.floor(x) + dx;
          const by = Math.floor(y) + dy;
          const bz = Math.floor(z) + dz;
          const id = this.world.getBlock(bx, by, bz);
          if (id === BlockId.AIR) {
            continue;
          }
          const def = getBlock(id);
          if (def.isBlastResistant || def.isLiquid) {
            continue;
          }
          if (def.id === BlockId.TNT) {
            this.world.setBlock(bx, by, bz, BlockId.AIR);
            this.primedTnt.push({ x: bx, y: by, z: bz, ticks: 0 });
            this.world.setBlock(bx, by, bz, BlockId.TNT);
            continue;
          }
          const meta = this.world.getMeta(bx, by, bz);
          this.world.setBlock(bx, by, bz, BlockId.AIR);
          if (this.rng() < EXPLOSION_DROP_CHANCE) {
            for (const drop of rollDrops(def, meta, null, this.rng)) {
              this.dropItem(bx + 0.5, by + 0.5, bz + 0.5, drop, 0.3);
            }
          }
        }
      }
    }
  }

  private damageEntitiesByExplosion(x: number, y: number, z: number, radius: number, sourceId: number): void {
    const hurtRadius = radius * 2;
    const damageAt = (ex: number, ey: number, ez: number): number => {
      const d = Math.hypot(ex - x, ey - y, ez - z);
      if (d > hurtRadius) {
        return 0;
      }
      return Math.round((1 - d / hurtRadius) * CREEPER_EXPLOSION_MAX_DAMAGE);
    };
    for (const e of this.entities.values()) {
      if (e instanceof LivingEntity && e.id !== sourceId) {
        const dmg = damageAt(e.x, e.y + e.height / 2, e.z);
        if (dmg > 0) {
          e.hurt(this, dmg, null);
          e.applyKnockback(x, z, 8);
        }
      }
    }
    const playerDamage =
      damageAt(this.player.x, this.player.y + 1, this.player.z) * DIFFICULTY_DAMAGE_MULTIPLIER[this.difficulty];
    if (playerDamage > 0) {
      this.player.lastDamageCause = 'explosion';
      this.hurtPlayer(playerDamage, null);
      this.player.applyKnockback(x, z, 8);
    }
  }

  hurtPlayer(amount: number, source: Entity | null): void {
    if (!this.rules.takesDamage || amount <= 0 || this.spawnProtection > 0) {
      return;
    }
    if (source instanceof Mob) {
      this.player.lastDamageCause = 'mob';
      this.killerLabel = source.def.label;
    } else if (source instanceof ArrowEntity) {
      this.player.lastDamageCause = 'arrow';
    }
    if (this.player.hurtBy(this, amount, source)) {
      this.achievements.addStat(StatId.DAMAGE_TAKEN, amount);
      this.sound.play('hurt');
      this.store.patch({ health: this.player.health });
    }
  }

  onEntityKilled(entity: Entity, byPlayer: boolean): void {
    if (entity instanceof EnderDragonEntity) {
      this.onDragonKilled(entity);
      return;
    }
    if (entity instanceof WitherEntity) {
      this.onWitherKilled(entity);
      return;
    }
    if (byPlayer && entity instanceof Mob) {
      this.achievements.onMobKilled(entity.def.hostile);
      this.dropXp(entity.x, entity.y + entity.height * 0.5, entity.z, entity.def.xp * XP_PER_MOB_KILL_MULTIPLIER);
    }
  }

  /** 在某处掉出若干经验球（总量超过一颗上限就拆成多颗）。 */
  dropXp(x: number, y: number, z: number, amount: number): void {
    let remaining = Math.floor(amount);
    // 一次掉的量很大时（末影龙 12000）就加大每颗的面值，免得刷出上千个实体
    const perOrb = Math.max(XP_ORB_MAX_AMOUNT, Math.ceil(remaining / MAX_XP_ORBS_PER_DROP));
    while (remaining > 0) {
      const chunkAmount = Math.min(perOrb, remaining);
      remaining -= chunkAmount;
      const orb = new XpOrbEntity(chunkAmount);
      orb.setPosition(x, y, z);
      orb.vx = (this.rng() - 0.5) * ITEM_DROP_SPAWN_SPEED;
      orb.vy = ITEM_DROP_SPAWN_SPEED * 0.5;
      orb.vz = (this.rng() - 0.5) * ITEM_DROP_SPAWN_SPEED;
      this.entities.set(orb.id, orb);
    }
  }

  random(): number {
    return this.rng();
  }

  playMobSound(mobType: string, kind: MobSoundKind, x: number, y: number, z: number, isBaby = false): void {
    const distance = Math.hypot(x - this.player.x, y - this.player.y, z - this.player.z);
    this.sound.playSpec(mobSound(mobType, kind), distance, isBaby ? BABY_PITCH : 1, 1, `mob:${mobType}:${kind}`);
  }

  playSound(name: string, x: number, y: number, z: number): void {
    this.sound.play(name, Math.hypot(x - this.player.x, y - this.player.y, z - this.player.z));
  }
}
