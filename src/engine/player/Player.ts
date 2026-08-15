import {
  AIR_TICKS_MAX,
  DROWN_DAMAGE,
  DROWN_DAMAGE_INTERVAL_TICKS,
  HUNGER_TICK_INTERVAL,
  PLAYER_EYE_HEIGHT,
  PLAYER_HEIGHT,
  PLAYER_MAX_FOOD,
  PLAYER_MAX_HEALTH,
  PLAYER_SNEAK_EYE_HEIGHT,
  PLAYER_WIDTH,
  REGEN_FOOD_THRESHOLD,
  REGEN_TICK_INTERVAL,
  STARVE_TICK_INTERVAL,
  XP_PER_LEVEL_BASE,
} from '../constants/game';
import type { EntityContext } from '../entities/EntityContext';
import { LivingEntity } from '../entities/LivingEntity';
import { Inventory } from '../items/Inventory';
import type { ItemStack } from '../items/ItemStack';
import type { Entity } from '../entities/Entity';

/** 玩家规则开关（由游戏模式决定）。 */
export interface PlayerRules {
  takesDamage: boolean;
  usesHunger: boolean;
  canFly: boolean;
  instantBreak: boolean;
  infiniteItems: boolean;
  canModifyBlocks: boolean;
}

/** 饥饿消耗常量。 */
const EXHAUSTION_PER_FOOD_POINT = 4;
const EXHAUSTION_SPRINT_PER_SECOND = 0.1;
const EXHAUSTION_JUMP = 0.05;
const EXHAUSTION_ATTACK = 0.1;
const EXHAUSTION_BLOCK_BREAK = 0.005;
const EXHAUSTION_REGEN = 3;
const STARVE_MIN_HEALTH_NORMAL = 1;
const HARDCORE_STARVE_MIN_HEALTH = 0;

/** 玩家实体。 */
export class Player extends LivingEntity {
  readonly type = 'player';
  readonly inventory = new Inventory();
  selectedSlot = 0;
  food = PLAYER_MAX_FOOD;
  saturation = 5;
  exhaustion = 0;
  air = AIR_TICKS_MAX;
  xp = 0;
  xpLevel = 0;
  isFlying = false;
  isSneaking = false;
  isSprinting = false;
  /** 出生点。 */
  spawnX = 0;
  spawnY = 0;
  spawnZ = 0;
  private foodTimer = 0;
  private drownTimer = 0;
  private lastPickupMessage: string | null = null;
  /** 最近一次伤害原因，用于死亡提示。 */
  lastDamageCause: DamageCause = 'generic';
  private pickupListeners = new Set<(id: string, count: number) => void>();

  constructor() {
    super(PLAYER_MAX_HEALTH);
    this.width = PLAYER_WIDTH;
    this.height = PLAYER_HEIGHT;
  }

  /** 眼睛世界 y。 */
  override get eyeY(): number {
    return this.y + (this.isSneaking ? PLAYER_SNEAK_EYE_HEIGHT : PLAYER_EYE_HEIGHT);
  }

  /** 手持物品。 */
  get heldItem(): ItemStack | null {
    return this.inventory.get(this.selectedSlot);
  }

  /** 拾取回调订阅。 */
  onPickupItem(listener: (id: string, count: number) => void): () => void {
    this.pickupListeners.add(listener);
    return () => this.pickupListeners.delete(listener);
  }

  /** 由掉落物调用。 */
  onPickup(id: string, count: number): void {
    this.lastPickupMessage = id;
    for (const l of this.pickupListeners) {
      l(id, count);
    }
  }

  /** 玩家逻辑 tick：饥饿/回血/溺水。物理由 Game 驱动。 */
  tickSurvival(ctx: EntityContext, rules: PlayerRules, isHardcore: boolean): void {
    if (this.health <= 0) {
      return;
    }
    if (this.hurtTicks > 0) {
      this.hurtTicks--;
    }
    if (this.invulnerableTicks > 0) {
      this.invulnerableTicks--;
    }
    this.tickAir(ctx, rules);
    if (!rules.usesHunger) {
      this.food = PLAYER_MAX_FOOD;
      return;
    }
    this.tickHunger(ctx, isHardcore);
  }

  private tickAir(ctx: EntityContext, rules: PlayerRules): void {
    const headInWater = ctx.world.isLiquidAt(Math.floor(this.x), Math.floor(this.eyeY), Math.floor(this.z));
    if (!headInWater) {
      this.air = Math.min(AIR_TICKS_MAX, this.air + 4);
      this.drownTimer = 0;
      return;
    }
    if (!rules.takesDamage) {
      return;
    }
    if (this.air > 0) {
      this.air--;
      return;
    }
    this.drownTimer++;
    if (this.drownTimer >= DROWN_DAMAGE_INTERVAL_TICKS) {
      this.drownTimer = 0;
      this.lastDamageCause = 'drown';
      this.hurt(ctx, DROWN_DAMAGE, null);
    }
  }

  private tickHunger(ctx: EntityContext, isHardcore: boolean): void {
    if (this.isSprinting && (Math.abs(this.vx) > 0.1 || Math.abs(this.vz) > 0.1)) {
      this.addExhaustion(EXHAUSTION_SPRINT_PER_SECOND / 20);
    }
    while (this.exhaustion >= EXHAUSTION_PER_FOOD_POINT) {
      this.exhaustion -= EXHAUSTION_PER_FOOD_POINT;
      if (this.saturation > 0) {
        this.saturation = Math.max(0, this.saturation - 1);
      } else {
        this.food = Math.max(0, this.food - 1);
      }
    }
    this.foodTimer++;
    if (this.food >= REGEN_FOOD_THRESHOLD && this.health < this.maxHealth) {
      if (this.foodTimer >= REGEN_TICK_INTERVAL) {
        this.foodTimer = 0;
        this.heal(1);
        this.addExhaustion(EXHAUSTION_REGEN);
      }
    } else if (this.food <= 0) {
      if (this.foodTimer >= STARVE_TICK_INTERVAL) {
        this.foodTimer = 0;
        const minHealth = isHardcore ? HARDCORE_STARVE_MIN_HEALTH : STARVE_MIN_HEALTH_NORMAL;
        if (this.health > minHealth) {
          this.lastDamageCause = 'starve';
          this.hurt(ctx, 1, null);
        }
      }
    } else if (this.foodTimer >= HUNGER_TICK_INTERVAL) {
      this.foodTimer = 0;
    }
  }

  /** 增加疲劳度。 */
  addExhaustion(amount: number): void {
    this.exhaustion += amount;
  }

  /** 跳跃疲劳。 */
  onJump(): void {
    this.addExhaustion(EXHAUSTION_JUMP);
  }

  /** 攻击疲劳。 */
  onAttack(): void {
    this.addExhaustion(EXHAUSTION_ATTACK);
  }

  /** 挖掘疲劳。 */
  onBlockBroken(): void {
    this.addExhaustion(EXHAUSTION_BLOCK_BREAK);
  }

  /** 进食。 */
  eat(hunger: number, saturation: number): void {
    this.food = Math.min(PLAYER_MAX_FOOD, this.food + hunger);
    this.saturation = Math.min(this.food, this.saturation + saturation);
  }

  /** 是否可以进食（饥饿未满）。 */
  get canEat(): boolean {
    return this.food < PLAYER_MAX_FOOD;
  }

  /** 增加经验。 */
  addXp(amount: number): void {
    this.xp += amount;
    while (this.xp >= this.xpToNextLevel()) {
      this.xp -= this.xpToNextLevel();
      this.xpLevel++;
    }
  }

  /** 升到下一级所需经验（简化公式）。 */
  xpToNextLevel(): number {
    return XP_PER_LEVEL_BASE + this.xpLevel * 2;
  }

  /** 经验条进度。 */
  get xpProgress(): number {
    return this.xp / this.xpToNextLevel();
  }

  /** 复活。 */
  respawn(): void {
    this.health = this.maxHealth;
    this.food = PLAYER_MAX_FOOD;
    this.saturation = 5;
    this.exhaustion = 0;
    this.air = AIR_TICKS_MAX;
    this.deathTicks = 0;
    this.isDead = false;
    this.fallDistance = 0;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.setPosition(this.spawnX, this.spawnY, this.spawnZ);
    this.hurtTicks = 0;
  }

  /** 覆盖：玩家死亡由 Game 处理，这里不做动画计时。 */
  override tick(_ctx: EntityContext): void {
    this.age++;
  }

  protected override onDeath(_ctx: EntityContext, _byPlayer: boolean): void {
    this.isSprinting = false;
  }

  protected override onLand(ctx: EntityContext, fallDistance: number): void {
    this.lastDamageCause = 'fall';
    super.onLand(ctx, fallDistance);
  }

  /** 玩家受伤时也走 hurt；来源可能为空。 */
  hurtBy(ctx: EntityContext, amount: number, source: Entity | null): boolean {
    return this.hurt(ctx, amount, source);
  }

  /** 最近一次拾取物品 id。 */
  get lastPickup(): string | null {
    return this.lastPickupMessage;
  }

  /** 序列化。 */
  serialize(): PlayerSaveData {
    return {
      x: this.x,
      y: this.y,
      z: this.z,
      yaw: this.yaw,
      pitch: this.pitch,
      health: this.health,
      food: this.food,
      saturation: this.saturation,
      air: this.air,
      xp: this.xp,
      xpLevel: this.xpLevel,
      selectedSlot: this.selectedSlot,
      isFlying: this.isFlying,
      spawn: [this.spawnX, this.spawnY, this.spawnZ],
      inventory: this.inventory.toJSON(),
    };
  }

  /** 反序列化。 */
  load(data: PlayerSaveData): void {
    this.setPosition(data.x, data.y, data.z);
    this.yaw = data.yaw;
    this.pitch = data.pitch;
    this.health = data.health;
    this.food = data.food;
    this.saturation = data.saturation;
    this.air = data.air;
    this.xp = data.xp;
    this.xpLevel = data.xpLevel;
    this.selectedSlot = data.selectedSlot;
    this.isFlying = data.isFlying;
    [this.spawnX, this.spawnY, this.spawnZ] = data.spawn;
    this.inventory.load(data.inventory);
  }
}

/** 伤害来源类型。 */
export type DamageCause = 'generic' | 'drown' | 'starve' | 'fall' | 'mob' | 'arrow' | 'explosion';

/** 玩家存档数据。 */
export interface PlayerSaveData {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  health: number;
  food: number;
  saturation: number;
  air: number;
  xp: number;
  xpLevel: number;
  selectedSlot: number;
  isFlying: boolean;
  spawn: [number, number, number];
  inventory: (ItemStack | null)[];
}
