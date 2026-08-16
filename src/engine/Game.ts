import * as THREE from 'three';
import {
  BlockId,
  ToolType,
  blockVariant,
  cropBlockForSeed,
  getBlock,
  type BlockDef,
} from './blocks/BlockRegistry';
import { breakTicks, rollDrops, rollXp } from './blocks/blockBreaking';
import {
  BED_HEAD_BIT,
  BlockShape,
  DOOR_OPEN_BIT,
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
} from './constants/mobs';
import { CHEST_SLOT_COUNT } from './constants/ui';
import { rollLoot } from './world/structures/LootTables';
import { WATER_SOURCE_META, WATER_TICK_INTERVAL } from './constants/fluids';
import {
  DAY_LENGTH_TICKS,
  DEFAULT_RENDER_DISTANCE,
  MAX_LIGHT,
  NIGHT_END_TICK,
  NIGHT_START_TICK,
  SPAWN_PRELOAD_RADIUS,
} from './constants/world';
import { BlockEntityStore, BlockEntityType } from './world/BlockEntityStore';
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
import { ThrownPotionEntity } from './entities/ThrownPotionEntity';
import { FireballEntity } from './entities/FireballEntity';
import { Entity, allocateEntityId, resetEntityIds, type EntitySaveData } from './entities/Entity';
import type { EntityContext } from './entities/EntityContext';
import { ItemDropEntity } from './entities/ItemDropEntity';
import { XpOrbEntity } from './entities/XpOrbEntity';
import { LivingEntity } from './entities/LivingEntity';
import { EffectId, type ActiveEffect } from './entities/effects';
import { Mob } from './entities/Mob';
import { MobType, isMobType } from './entities/MobDefs';
import { MobSpawner } from './entities/MobSpawner';
import { Screen, isContainerScreen, type DebugInfo, type GameUiState } from './events/GameState';
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
import { getAttackDamage, getItem, ItemKind } from './items/ItemRegistry';
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
import { toChunkCoord } from './world/Chunk';
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
}

const INITIAL_TIME_TICK = 1000;
const MAX_FRAME_DT = 0.1;
const TNT_FUSE_TICKS = 60;
const TNT_EXPLOSION_RADIUS = 4;
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
  [[-2, -1], [-2, 0], [-2, 1]],
  [[-2, 2]],
  [[-1, -2], [0, -2], [1, -2]],
  [],
  [[-1, 2], [0, 2], [1, 2]],
  [[2, -2]],
  [[2, -1], [2, 0], [2, 1]],
  [[2, 2]],
];
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
/** 喷溅药水碎掉时的玻璃碎屑。 */
const SPLASH_PARTICLE_TEXTURE = 'glass';
const SPLASH_PARTICLE_COUNT = 10;

/** 游戏主循环与全部玩法逻辑的编排者。 */
export class Game implements EntityContext, ContainerHost {
  readonly player = new Player();
  readonly store: Store<GameUiState>;
  readonly meta: WorldMeta;
  readonly rules: GameModeRules;
  readonly difficulty: Difficulty;
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
    const dimension = new Dimension(DIMENSION_DEFS[id], createDimensionGenerator(id, this.meta), this);
    dimension.world.onChunkLoad((chunk) => this.applyPendingBlockEntities(chunk));
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
  private rafId = 0;
  private lastFrame = 0;
  private accumulator = 0;
  private running = false;
  private isPaused = false;
  private isDisposed = false;
  private readonly unsubscribeSettings: () => void;
  /** 是否触屏设备（决定是否显示触屏按钮、是否请求指针锁定）。 */
  readonly isTouch = isTouchDevice();
  private breakTarget: { x: number; y: number; z: number; id: number } | null = null;
  /** 脚步声：累计走过的水平距离与上一次采样点。 */
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
    this.rules = getRules(options.meta.mode);
    this.difficulty = this.rules.forcedDifficulty ?? options.meta.difficulty;
    this.rng = createRng(hashString(`${options.meta.seed}:${Date.now()}`));
    this.weather = new WeatherSystem(this.rng);
    this.current = this.dimensionOf(DimensionId.OVERWORLD);
    this.atlas = new TextureAtlas();
    this.renderer = new Renderer(options.canvas, this.world, this.atlas);
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
      screen: Screen.NONE,
      isPointerLocked: false,
      isFlying: false,
      isUnderwater: false,
      breakProgress: 0,
      targetLabel: '',
      toast: '',
      achievementVersion: 0,
      toastVersion: 0,
      debug: null,
      isLoading: true,
      loadingText: '生成世界中…',
      timeOfDay: 0,
      openBlock: null,
      cursorStack: null,
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
    if (this.running) {
      return;
    }
    this.running = true;
    this.controls.attach();
    this.lastFrame = performance.now();
    this.fpsLastSample = this.lastFrame;
    this.store.patch({ isLoading: false, loadingText: '' });
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
    cancelAnimationFrame(this.rafId);
    this.controls.exitLock();
    this.controls.detach();
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
    const playerDimension = save.playerDimension;
    if (playerDimension && isDimensionId(playerDimension) && playerDimension !== this.current.id) {
      const target = this.dimensionOf(playerDimension);
      this.current = target;
      this.renderer.setWorld(target.world);
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
    };
  }

  /** 序列化一个维度：被修改过的 chunk、可存档的实体与方块实体。 */
  private serializeDimension(dimension: Dimension): DimensionSaveData {
    const entities: EntitySaveData[] = [];
    for (const e of dimension.entities.values()) {
      if (e.isDead) {
        continue;
      }
      const data = e instanceof Mob || e instanceof ItemDropEntity || e instanceof XpOrbEntity ? e.serialize() : null;
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
      this.updatePlayerMovement(dt);
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
      hit
        ? this.outlineBoxAt(hit.x, hit.y, hit.z)
        : FULL_BOX,
      this.breakNeededTicks > 0 ? this.breakProgressTicks / this.breakNeededTicks : 0,
    );
    const brightness = this.brightnessAtPlayer();
    this.renderer.particles.update(dt);
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
    this.mergeItemDrops();
    this.spawner.tick(this, this.entities.values());
    this.tickTnt();
    this.tickFurnaces();
    this.achievements.tickPlayTime();
    this.tickSpawners();
    this.tickGravityBlocks();
    this.randomTicks.tick(this.player.x, this.player.z);
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
    return p.y < this.world.getHeight(x, z) - UNDERGROUND_DEPTH && this.lightLevelAt(x, Math.floor(p.eyeY), z) < UNDERGROUND_MAX_LIGHT;
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
    const inPortal = this.world.getBlock(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) === BlockId.NETHER_PORTAL;
    if (!inPortal) {
      this.portalTicks = 0;
      return;
    }
    this.portalTicks++;
    if (this.portalTicks < PORTAL_TRIGGER_TICKS) {
      return;
    }
    this.portalTicks = 0;
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

  /**
   * 切换到某个维度并把玩家放到 (x, y, z) 附近。
   * @param usePortal 是否找 / 造一座传送门作为落点（末地那种直接落地的传送传 false）
   */
  private enterDimension(target: Dimension, x: number, y: number, z: number, usePortal: boolean): void {
    if (target === this.current) {
      return;
    }
    this.current = target;
    this.renderer.setWorld(target.world);
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
    this.achievements.onEnterDimension(target.id);
    this.showToast(`进入${target.def.label}`);
  }

  /** 当前维度 id（存档与调试面板用）。 */
  get dimensionId(): DimensionId {
    return this.current.id;
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
      air: p.air,
      armor: p.armorPoints,
      effects: this.effectsForHud(),
      xpLevel: p.xpLevel,
      xpProgress: p.xpProgress,
      selectedSlot: p.selectedSlot,
      isFlying: p.isFlying,
      isUnderwater: this.isPlayerUnderwater(),
      breakProgress: this.breakNeededTicks > 0 ? this.breakProgressTicks / this.breakNeededTicks : 0,
      targetLabel: this.currentHit ? this.blockLabelAt(this.currentHit.x, this.currentHit.y, this.currentHit.z) : '',
      timeOfDay: (this.timeTick % DAY_LENGTH_TICKS) / DAY_LENGTH_TICKS,
      debug: this.debugEnabled ? this.buildDebugInfo() : null,
      cursorStack: this.containers.cursor,
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
    this.controls.onWheel = (deltaY) => {
      const dir = deltaY > 0 ? 1 : -1;
      this.selectSlot((this.player.selectedSlot + dir + 9) % 9);
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
    this.store.patch({ screen, openBlock });
    this.isPaused = screen === Screen.PAUSE || screen === Screen.STATS;
    if (screen !== Screen.NONE) {
      this.controls.exitLock();
    }
  }

  /**
   * 关闭界面并回到游戏。
   * 合成格与光标上的物品必须先收回背包；背包放不下时保持界面打开并提示，
   * 避免玩家正在挪动的物品被丢进世界。
   */
  closeScreen(): void {
    const leftover = this.containers.returnCraftingItems() + this.containers.returnCursor();
    if (leftover > 0) {
      this.showToast('背包已满，请先腾出空间');
      return;
    }
    this.isPaused = false;
    this.store.patch({ screen: Screen.NONE, openBlock: null, cursorStack: null });
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
        if (!this.rules.infiniteItems) {
          p.inventory.consume(p.selectedSlot, 1);
        }
        this.renderer.hand.swing();
      }
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
      this.renderer.particles.spawnBlockBreak(x - 0.5, y - 0.5, z - 0.5, SPLASH_PARTICLE_TEXTURE, SPLASH_PARTICLE_COUNT, 1);
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
      case BlockId.BED:
        this.useBed(hit.x, hit.y, hit.z);
        return true;
      case BlockId.WOODEN_DOOR:
      case BlockId.FENCE_GATE:
        this.toggleDoor(hit.x, hit.y, hit.z);
        return true;
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
    this.world.setBlock(px, py, pz, blockId, meta);
    this.playBlockSound(placeSound(soundGroupOf(def)), px, py, pz, 'place');
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
    if (this.tryReflectFireball()) {
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
        if (this.world.getBlock(x + dx, y, z + dz) !== BlockId.AIR || this.world.getBlock(x + dx, y + 1, z + dz) !== BlockId.AIR) {
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
    const options = item ? rollOptions(item, this.enchantShelves, createRng(this.enchantSeed ^ hashString(item.id))) : null;
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
    return entity?.type === BlockEntityType.CHEST ? entity.items : null;
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
    if (entity.type === BlockEntityType.SPAWNER) {
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
    this.store.patch({ inventoryVersion: this.store.get().inventoryVersion + 1, cursorStack: this.containers.cursor });
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
   * 右键床：把重生点设在床边，若是夜里且附近没有敌对生物就一觉睡到天亮。
   * （原版只在真正躺下时设置重生点，这里放宽为点一下就设，避免夜里被怪堵着白跑一趟。）
   */
  private useBed(x: number, y: number, z: number): void {
    const foot =
      (this.world.getMeta(x, y, z) & BED_HEAD_BIT) === 0 ? { x, y, z } : (this.multiBlockPartner(x, y, z) ?? { x, y, z });
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

  dropItem(x: number, y: number, z: number, stack: ItemStack, spread = 0.2): void {
    const drop = new ItemDropEntity({ ...stack });
    drop.setPosition(x, y, z);
    drop.vx = (this.rng() - 0.5) * ITEM_DROP_SPAWN_SPEED * spread * 4;
    drop.vy = ITEM_DROP_SPAWN_SPEED * (0.5 + this.rng() * 0.5);
    drop.vz = (this.rng() - 0.5) * ITEM_DROP_SPAWN_SPEED * spread * 4;
    this.spawnEntity(drop);
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
    if (byPlayer && entity instanceof Mob) {
      this.achievements.onMobKilled(entity.def.hostile);
      this.dropXp(entity.x, entity.y + entity.height * 0.5, entity.z, entity.def.xp * XP_PER_MOB_KILL_MULTIPLIER);
    }
  }

  /** 在某处掉出若干经验球（总量超过一颗上限就拆成多颗）。 */
  dropXp(x: number, y: number, z: number, amount: number): void {
    let remaining = Math.floor(amount);
    while (remaining > 0) {
      const chunkAmount = Math.min(XP_ORB_MAX_AMOUNT, remaining);
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
