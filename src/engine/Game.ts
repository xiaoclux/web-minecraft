import * as THREE from 'three';
import { BlockId, ToolType, getBlock, type BlockDef } from './blocks/BlockRegistry';
import { breakTicks, rollDrops, rollXp } from './blocks/blockBreaking';
import {
  BlockShape,
  FULL_BOX,
  collisionBoxes,
  SLAB_TOP_BIT,
  STAIRS_FACINGS,
  STAIRS_FLIP_BIT,
  outlineBox,
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
  SPRINT_FOOD_THRESHOLD,
  TICK_MS,
} from './constants/game';
import { KEY_ESCAPE, KEY_HOTBAR_PREFIX, MOUSE_LEFT, MOUSE_MIDDLE, MOUSE_RIGHT } from './constants/keys';
import { actionForCode, isTouchDevice, settingsStore, type BindingAction } from './settings/Settings';
import { AUTOSAVE_INTERVAL_TICKS, SAVE_FORMAT_VERSION } from './constants/save';
import { CREEPER_EXPLOSION_MAX_DAMAGE } from './constants/mobs';
import { WATER_TICK_INTERVAL } from './constants/fluids';
import { DAY_LENGTH_TICKS, DEFAULT_RENDER_DISTANCE, MAX_LIGHT, SPAWN_PRELOAD_RADIUS } from './constants/world';
import { BlockEntityStore, BlockEntityType } from './world/BlockEntityStore';
import { ArrowEntity } from './entities/ArrowEntity';
import { Entity, allocateEntityId, resetEntityIds, type EntitySaveData } from './entities/Entity';
import type { EntityContext } from './entities/EntityContext';
import { ItemDropEntity } from './entities/ItemDropEntity';
import { LivingEntity } from './entities/LivingEntity';
import { Mob } from './entities/Mob';
import { isMobType } from './entities/MobDefs';
import { MobSpawner } from './entities/MobSpawner';
import { Screen, type DebugInfo, type GameUiState } from './events/GameState';
import { Store } from './events/Store';
import { ContainerController, type ContainerHost, type SlotRef } from './items/ContainerController';
import { createFurnace, tickFurnace, type FurnaceState } from './items/Furnace';
export type { SlotRef } from './items/ContainerController';
import { getAttackDamage, getItem, ItemKind } from './items/ItemRegistry';
import type { ItemStack } from './items/ItemStack';
import { getRules, type GameModeRules } from './modes/GameModes';
import { AABB } from './physics/AABB';
import { raycastBlocks, type RayHit } from './physics/raycast';
import { Controls } from './player/Controls';
import { Player } from './player/Player';
import type { Inventory } from './items/Inventory';
import { Renderer } from './render/Renderer';
import { Sky } from './render/Sky';
import { SoundManager } from './render/SoundManager';
import { deserializeChunk, serializeChunk } from './save/chunkSerializer';
import { SaveManager, type WorldMeta, type WorldSave } from './save/SaveManager';
import { TextureAtlas } from './textures/TextureAtlas';
import { createRng, hashString } from './textures/PixelCanvas';
import type { Chunk } from './world/Chunk';
import { toChunkCoord } from './world/Chunk';
import { createChunkGenerator, type ChunkGenerator } from './world/ChunkGenerator';
import { ChunkManager } from './world/ChunkManager';
import { FluidSimulator } from './world/FluidSimulator';
import { LightEngine } from './world/LightEngine';
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

/** 游戏主循环与全部玩法逻辑的编排者。 */
export class Game implements EntityContext, ContainerHost {
  readonly world = new World();
  readonly player = new Player();
  readonly store: Store<GameUiState>;
  readonly meta: WorldMeta;
  readonly rules: GameModeRules;
  readonly difficulty: Difficulty;
  readonly entities = new Map<number, Entity>();
  /** 方块实体（熔炉 / 箱子等附着在坐标上的状态）。 */
  readonly blockEntities = new BlockEntityStore();
  readonly craftingGrid: (ItemStack | null)[] = new Array<ItemStack | null>(CRAFT_GRID_SIZE).fill(null);
  craftGridSize = 2;
  tick = 0;
  timeTick = INITIAL_TIME_TICK;

  private readonly generator: ChunkGenerator;
  private readonly chunkManager: ChunkManager;
  private readonly fluids: FluidSimulator;
  private readonly light: LightEngine;
  private readonly atlas: TextureAtlas;
  private readonly renderer: Renderer;
  private readonly controls: Controls;
  private readonly spawner = new MobSpawner();
  private readonly sound = new SoundManager();
  private readonly saveManager: SaveManager;
  private readonly onExit: () => void;
  private readonly rng: () => number;
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
    this.generator = createChunkGenerator(options.meta);
    this.light = new LightEngine(this.world);
    this.chunkManager = new ChunkManager(this.world, this.generator, this.light);
    this.fluids = new FluidSimulator(this.world);
    this.atlas = new TextureAtlas();
    this.renderer = new Renderer(options.canvas, this.world, this.atlas);
    this.controls = new Controls(options.canvas, settingsStore.get());
    this.unsubscribeSettings = settingsStore.subscribe(() => this.controls.setSettings(settingsStore.get()));
    this.store = new Store<GameUiState>({
      mode: options.meta.mode,
      health: this.player.health,
      maxHealth: this.player.maxHealth,
      food: this.player.food,
      air: this.player.air,
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
    this.fluids.onWashed((x, y, z, id) => this.onBlockWashed(x, y, z, id));
    this.world.onChunkUnload((chunk) => this.onChunkUnloaded(chunk));
    this.player.inventory.subscribe(() =>
      this.store.patch({ inventoryVersion: this.store.get().inventoryVersion + 1 }),
    );
    this.player.onPickupItem((id) => this.showToast(`拾取：${getItem(id)?.label ?? id}`));
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
    if (typeof save.timeTick === 'number') {
      this.timeTick = save.timeTick;
    }
    if (this.player.health <= 0) {
      this.player.respawn();
    }
  }

  private deserializeEntity(data: EntitySaveData): Entity | null {
    if (data.type === 'item') {
      return ItemDropEntity.deserialize(data);
    }
    if (isMobType(data.type)) {
      return Mob.deserialize(data);
    }
    return null;
  }

  /** 生成存档对象。 */
  serialize(): WorldSave {
    const entities: EntitySaveData[] = [];
    for (const e of this.entities.values()) {
      if (e.isDead) {
        continue;
      }
      if (e instanceof Mob) {
        entities.push(e.serialize());
      } else if (e instanceof ItemDropEntity) {
        entities.push(e.serialize());
      }
    }
    return {
      version: SAVE_FORMAT_VERSION,
      meta: { ...this.meta, lastPlayed: Date.now() },
      tick: this.tick,
      timeTick: this.timeTick,
      chunks: this.world.listModifiedChunks().map(serializeChunk),
      player: this.player.serialize(),
      entities,
      nextEntityId: allocateEntityId(),
      blockEntities: this.blockEntities.serialize(),
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
    this.renderer.entities.update(this.entities.values(), this.renderer.sky.skyLevel, now / 1000, this.player.yaw);
    const hit = this.currentHit;
    this.renderer.outline.set(
      hit,
      hit
        ? outlineBox(getBlock(this.world.getBlock(hit.x, hit.y, hit.z)), this.world.getMeta(hit.x, hit.y, hit.z))
        : FULL_BOX,
      this.breakNeededTicks > 0 ? this.breakProgressTicks / this.breakNeededTicks : 0,
    );
    const brightness = this.brightnessAtPlayer();
    this.renderer.hand.update(this.player.heldItem?.id ?? null, brightness);
    this.renderer.render(this.timeTick, this.isPlayerUnderwater());
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
    this.mergeItemDrops();
    this.spawner.tick(this, this.entities.values());
    this.tickTnt();
    this.tickFurnaces();
    this.tickGravityBlocks();
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
    this.syncStore();
  }

  private syncStore(): void {
    const p = this.player;
    this.store.patch({
      health: p.health,
      food: p.food,
      air: p.air,
      xpLevel: p.xpLevel,
      xpProgress: p.xpProgress,
      selectedSlot: p.selectedSlot,
      isFlying: p.isFlying,
      isUnderwater: this.isPlayerUnderwater(),
      breakProgress: this.breakNeededTicks > 0 ? this.breakProgressTicks / this.breakNeededTicks : 0,
      targetLabel: this.currentHit
        ? getBlock(this.world.getBlock(this.currentHit.x, this.currentHit.y, this.currentHit.z)).label
        : '',
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
      biome: this.generator.biomeAt(bx, bz),
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
      } else if (screen === Screen.INVENTORY || screen === Screen.CRAFTING || screen === Screen.FURNACE) {
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
    this.isPaused = screen === Screen.PAUSE;
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
    let speed = PLAYER_WALK_SPEED;
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
    if (input.jump) {
      if (p.onGround) {
        // 站在地上（含浅水底）就正常起跳；疾跑起跳只在刚按下时加一次前冲
        p.vy = PLAYER_JUMP_VELOCITY;
        p.onJump();
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

  private lookDirection(): THREE.Vector3 {
    const p = this.player;
    const cp = Math.cos(p.pitch);
    return new THREE.Vector3(-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp);
  }

  private isPlayerUnderwater(): boolean {
    const p = this.player;
    return this.world.isLiquidAt(Math.floor(p.x), Math.floor(p.eyeY), Math.floor(p.z));
  }

  private brightnessAtPlayer(): number {
    const p = this.player;
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
    this.world.setBlock(x, y, z, BlockId.AIR);
    this.sound.play('break');
    this.renderer.hand.swing();
    if (withDrops && !this.rules.infiniteItems) {
      const held = this.player.heldItem;
      for (const drop of rollDrops(def, held, this.rng)) {
        this.dropItem(x + 0.5, y + 0.5, z + 0.5, drop, 0.2);
      }
      const xp = rollXp(def, held, this.rng);
      if (xp > 0) {
        this.player.addXp(xp);
      }
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
      this.world.setBlock(x, y + 1, z, BlockId.AIR);
      this.dropBlockLoot(x, y + 1, z, above);
    }
    if (above.hasGravity) {
      this.pendingGravity.push({ x, y: y + 1, z });
    }
  }

  /** 植物等被水冲走时掉落物品。 */
  private onBlockWashed(x: number, y: number, z: number, id: number): void {
    this.dropBlockLoot(x, y, z, getBlock(id));
  }

  /** 在方块中心掉落其战利品（创造模式不掉落）。 */
  private dropBlockLoot(x: number, y: number, z: number, def: BlockDef): void {
    if (this.rules.infiniteItems) {
      return;
    }
    for (const drop of rollDrops(def, null, this.rng)) {
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
    if (!def?.tool) {
      return;
    }
    const damage = (held.damage ?? 0) + amount;
    if (damage >= def.tool.durability) {
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
    if (def.kind === ItemKind.BLOCK && def.blockId !== undefined && hit) {
      this.tryPlaceBlock(def.blockId, hit);
    }
  }

  private interactWithBlock(def: BlockDef, hit: RayHit): boolean {
    switch (def.id) {
      case BlockId.CRAFTING_TABLE:
        this.openScreen(Screen.CRAFTING, { x: hit.x, y: hit.y, z: hit.z });
        return true;
      case BlockId.FURNACE:
        this.blockEntities.getOrCreate(hit.x, hit.y, hit.z, () => ({
          type: BlockEntityType.FURNACE,
          state: createFurnace(),
        }));
        this.openScreen(Screen.FURNACE, { x: hit.x, y: hit.y, z: hit.z });
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
    if (def.shape !== BlockShape.SLAB && def.shape !== BlockShape.STAIRS) {
      return 0;
    }
    const upperHalf = hit.ny < 0 || (hit.ny === 0 && hit.hy - Math.floor(hit.hy) >= 0.5);
    if (def.shape === BlockShape.SLAB) {
      return upperHalf ? SLAB_TOP_BIT : 0;
    }
    const dir = this.lookDirection();
    const facing =
      Math.abs(dir.x) >= Math.abs(dir.z)
        ? STAIRS_FACINGS.findIndex(([fx]) => fx === Math.sign(dir.x))
        : STAIRS_FACINGS.findIndex(([, fz]) => fz === Math.sign(dir.z));
    return Math.max(0, facing) | (upperHalf ? STAIRS_FLIP_BIT : 0);
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

  private tryPlaceBlock(blockId: number, hit: RayHit): void {
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
    const meta = this.placementMeta(def, hit);
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
    const id = this.world.getBlock(this.currentHit.x, this.currentHit.y, this.currentHit.z);
    const def = getBlock(id);
    const item = getItem(def.name);
    if (!item) {
      return;
    }
    this.player.inventory.set(this.player.selectedSlot, { id: item.id, count: 1 });
  }

  private tryAttack(): void {
    if (this.attackCooldown > 0) {
      return;
    }
    const target = this.findEntityInCrosshair();
    if (!target) {
      return;
    }
    this.attackCooldown = ATTACK_COOLDOWN_TICKS;
    const damage = getAttackDamage(this.player.heldItem?.id ?? null);
    if (target.hurt(this, damage, this.player, true)) {
      this.sound.play('hit');
      this.player.onAttack();
      const held = this.player.heldItem;
      if (held && getItem(held.id)?.tool) {
        this.damageHeldTool(getItem(held.id)?.tool?.type === ToolType.SWORD ? 1 : 2);
      }
    }
    this.renderer.hand.swing();
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

  private tickFurnaces(): void {
    let changed = false;
    for (const entity of this.blockEntities.values()) {
      if (entity.type === BlockEntityType.FURNACE && tickFurnace(entity.state)) {
        changed = true;
      }
    }
    if (changed && this.store.get().screen === Screen.FURNACE) {
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

  /** 方块被破坏时清掉它的方块实体，并把里面的物品掉出来。 */
  private removeBlockEntity(x: number, y: number, z: number): void {
    const entity = this.blockEntities.remove(x, y, z);
    if (!entity) {
      return;
    }
    const stacks =
      entity.type === BlockEntityType.FURNACE
        ? [entity.state.input, entity.state.fuel, entity.state.output]
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

  notifyChanged(): void {
    this.bumpInventory();
  }

  // ---------------------------------------------------------------- 死亡 / 复活

  private onPlayerDeath(): void {
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

  lightLevelAt(x: number, y: number, z: number): number {
    const sky = this.world.getSkyLight(x, y, z) * this.renderer.sky.skyLevel;
    const block = this.world.getBlockLight(x, y, z);
    return Math.max(sky, block);
  }

  spawnEntity(entity: Entity): void {
    this.entities.set(entity.id, entity);
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
          this.world.setBlock(bx, by, bz, BlockId.AIR);
          if (this.rng() < EXPLOSION_DROP_CHANCE) {
            for (const drop of rollDrops(def, null, this.rng)) {
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
      this.sound.play('hurt');
      this.store.patch({ health: this.player.health });
    }
  }

  onEntityKilled(entity: Entity, byPlayer: boolean): void {
    if (byPlayer && entity instanceof Mob) {
      this.player.addXp(entity.def.xp * XP_PER_MOB_KILL_MULTIPLIER);
    }
  }

  random(): number {
    return this.rng();
  }

  playSound(name: string, x: number, y: number, z: number): void {
    this.sound.play(name, Math.hypot(x - this.player.x, y - this.player.y, z - this.player.z));
  }
}
