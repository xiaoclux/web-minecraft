import { Difficulty, ITEM_DROP_SPAWN_SPEED } from '../engine/constants/game';
import { DimensionId } from '../engine/world/Dimension';
import type { Entity } from '../engine/entities/Entity';
import type { EnderCrystalEntity } from '../engine/entities/EnderCrystalEntity';
import type { EntityContext } from '../engine/entities/EntityContext';
import { ItemDropEntity } from '../engine/entities/ItemDropEntity';
import { LivingEntity } from '../engine/entities/LivingEntity';
import { Mob } from '../engine/entities/Mob';
import { MobSpawner } from '../engine/entities/MobSpawner';
import type { MobSoundKind } from '../engine/entities/mobSounds';
import type { ItemStack } from '../engine/items/ItemStack';
import { Player } from '../engine/player/Player';
import { Sky } from '../engine/render/Sky';
import type { World } from '../engine/world/World';
import type { SnapshotEntity } from './protocol';

/** 服务端要知道的每个在线玩家的位置。 */
export interface ServerPlayerPosition {
  id: number;
  x: number;
  y: number;
  z: number;
}

/** 服务端跑生物需要的外部信息。 */
export interface ServerEntityHost {
  readonly world: World;
  /** 当前世界时间（决定白天黑夜）。 */
  currentTime(): number;
  /** 在线玩家的位置（生物围着他们刷、也追他们）。 */
  playerPositions(): readonly ServerPlayerPosition[];
}

/** 没人在线时每隔多少 tick 清一次残留实体（不必每 tick 都做）。 */
const IDLE_TICK_INTERVAL = 20;
/** 掉落物没有水平初速度时的默认散开程度（与 Game.dropItem 一致）。 */
const DEFAULT_DROP_SPREAD = 0.2;
/** 散开程度到水平速度的换算系数（与 Game.dropItem 一致）。 */
const DROP_SPREAD_SPEED_FACTOR = 4;
/** 掉落物竖直初速度的最小占比，剩下的随机（与 Game.dropItem 一致）。 */
const DROP_MIN_VERTICAL_RATIO = 0.5;
/** 服务端没有水流，所有位置都返回同一个静止向量，省得每次调用都分配对象。 */
const NO_WATER_FLOW: { readonly x: number; readonly z: number } = Object.freeze({ x: 0, z: 0 });
/** 生物移动用的固定步长（服务端按 tick 推进，不看真实帧时间）。 */
const SERVER_STEP_SECONDS = 1 / 20;

/**
 * 专用服务端里的生物世界：跑刷怪、生物 AI 与掉落物，结果通过实体快照发给客户端。
 *
 * 与浏览器里的 Game 相比省掉了渲染 / 音效 / 玩家背包这些客户端的事，
 * 但生物逻辑本身用的是同一份 Mob / MobSpawner 代码。
 *
 * 多人时的做法：每只生物 tick 前把 `player` 换成离它最近的那个玩家，
 * 这样"追最近的人"就自然成立，Mob 那边不必知道有几个人在线。
 */
export class ServerEntityWorld implements EntityContext {
  readonly entities = new Map<number, Entity>();
  private readonly spawner = new MobSpawner();
  /** 当前正在被 tick 的生物所对应的"最近玩家"。 */
  private readonly proxyPlayer = new Player();
  private tickCount = 0;
  private populated = false;
  /** 本 tick 开头取一次的在线玩家列表，避免每只怪都去 host 重新分配一份。 */
  private players: readonly ServerPlayerPosition[] = [];
  /** 本 tick 是否白天，tickWorld 开头算一次，光照查询直接用。 */
  private daytime = true;

  constructor(private readonly host: ServerEntityHost) {}

  // ------------------------------------------------------------ EntityContext

  get world(): World {
    return this.host.world;
  }

  get player(): Player {
    return this.proxyPlayer;
  }

  get difficulty(): Difficulty {
    return Difficulty.NORMAL;
  }

  get dimensionId(): string {
    return DimensionId.OVERWORLD;
  }

  get tick(): number {
    return this.tickCount;
  }

  get canMobsTargetPlayer(): boolean {
    return this.players.length > 0;
  }

  isDaytime(): boolean {
    return this.daytime;
  }

  lightLevelAt(x: number, y: number, z: number): number {
    const sky = this.daytime ? this.world.getSkyLight(x, y, z) : 0;
    return Math.max(sky, this.world.getBlockLight(x, y, z));
  }

  spawnEntity(entity: Entity): void {
    this.entities.set(entity.id, entity);
  }

  dropItem(x: number, y: number, z: number, stack: ItemStack, spread = DEFAULT_DROP_SPREAD): void {
    const drop = new ItemDropEntity({ ...stack });
    drop.setPosition(x, y, z);
    // 与 Game.dropItem 同样的散开方式：spread 决定水平初速度，竖直方向总有一跳
    drop.vx = (this.random() - 0.5) * ITEM_DROP_SPAWN_SPEED * spread * DROP_SPREAD_SPEED_FACTOR;
    drop.vy = ITEM_DROP_SPAWN_SPEED * (DROP_MIN_VERTICAL_RATIO + this.random() * (1 - DROP_MIN_VERTICAL_RATIO));
    drop.vz = (this.random() - 0.5) * ITEM_DROP_SPAWN_SPEED * spread * DROP_SPREAD_SPEED_FACTOR;
    this.spawnEntity(drop);
  }

  /** 服务端暂不做爆炸（苦力怕在这里只会消失，不炸地形）。 */
  explode(): void {}

  /** 服务端暂不做点火。 */
  igniteAt(): void {}

  /** 伤害由客户端自己结算，服务端只负责怪的位置。 */
  hurtPlayer(): void {}

  onEntityKilled(): void {}

  random(): number {
    return Math.random();
  }

  playSound(): void {}

  playMobSound(_mobType: string, _kind: MobSoundKind): void {}

  livingEntitiesNear(x: number, y: number, z: number, radius: number): LivingEntity[] {
    const radiusSq = radius * radius;
    const out: LivingEntity[] = [];
    for (const e of this.entities.values()) {
      if (e instanceof LivingEntity && !e.isDead && e.distanceSqToPoint(x, y, z) <= radiusSq) {
        out.push(e);
      }
    }
    return out;
  }

  /** 服务端只跑主世界，没有末影水晶。 */
  crystalsNear(): EnderCrystalEntity[] {
    return [];
  }

  waterFlowAt(): { x: number; z: number } {
    return NO_WATER_FLOW;
  }

  // ------------------------------------------------------------ 主循环

  /** 每游戏 tick 调用一次。 */
  tickWorld(): void {
    this.tickCount++;
    const players = this.host.playerPositions();
    this.players = players;
    this.daytime = Sky.isDaytime(this.host.currentTime());
    if (players.length === 0) {
      // 没人在线就别刷怪了，但每隔一会儿清一次远处的实体
      if (this.tickCount % IDLE_TICK_INTERVAL === 0) {
        this.entities.clear();
      }
      return;
    }
    if (!this.populated) {
      this.populated = true;
      this.aimAt(players[0]);
      this.spawner.populateInitial(this);
    } else {
      this.aimAt(players[0]);
    }
    this.spawner.tick(this, this.entities.values());
    // 只有一个玩家时参照玩家已经就位；多人时只有会追人的 Mob 才需要换成最近的那个
    const pickNearest = players.length > 1;
    for (const [id, e] of this.entities) {
      if (e.isDead) {
        this.entities.delete(id);
        continue;
      }
      if (pickNearest && e instanceof Mob) {
        this.aimAt(this.nearestPlayerTo(e, players));
      }
      e.tick(this);
      e.move(this, SERVER_STEP_SECONDS);
    }
  }

  /** 当前实体的快照（给客户端渲染）。 */
  snapshot(): SnapshotEntity[] {
    const out: SnapshotEntity[] = [];
    for (const [id, e] of this.entities) {
      out.push({ id, kind: e.type, x: e.x, y: e.y, z: e.z, yaw: e.yaw });
    }
    return out;
  }

  /** 把"参照玩家"挪到某个位置，让生物以为自己在追这个人。 */
  private aimAt(position: ServerPlayerPosition | undefined): void {
    if (!position) {
      return;
    }
    this.proxyPlayer.setPosition(position.x, position.y, position.z);
  }

  private nearestPlayerTo(entity: Entity, players: readonly ServerPlayerPosition[]): ServerPlayerPosition {
    let best = players[0];
    let bestDistSq = Infinity;
    for (const p of players) {
      const distSq = entity.distanceSqToPoint(p.x, p.y, p.z);
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        best = p;
      }
    }
    return best;
  }
}
