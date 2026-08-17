import { Difficulty } from '../engine/constants/game';
import { DimensionId } from '../engine/world/Dimension';
import type { Entity } from '../engine/entities/Entity';
import type { EnderCrystalEntity } from '../engine/entities/EnderCrystalEntity';
import type { EntityContext } from '../engine/entities/EntityContext';
import { ItemDropEntity } from '../engine/entities/ItemDropEntity';
import { LivingEntity } from '../engine/entities/LivingEntity';
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

/** 没有玩家在线时也要有个"参照玩家"，否则刷怪器无处可刷。 */
const IDLE_TICK_INTERVAL = 20;
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
  private nextEntityId = 1;
  private tickCount = 0;
  private populated = false;

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
    return this.host.playerPositions().length > 0;
  }

  isDaytime(): boolean {
    return Sky.isDaytime(this.host.currentTime());
  }

  lightLevelAt(x: number, y: number, z: number): number {
    const sky = this.world.getSkyLight(x, y, z) * (this.isDaytime() ? 1 : 0);
    return Math.max(sky, this.world.getBlockLight(x, y, z));
  }

  spawnEntity(entity: Entity): void {
    this.entities.set(this.nextEntityId++, entity);
  }

  dropItem(x: number, y: number, z: number, stack: ItemStack): void {
    const drop = new ItemDropEntity({ ...stack });
    drop.setPosition(x, y, z);
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
    return { x: 0, z: 0 };
  }

  // ------------------------------------------------------------ 主循环

  /** 每游戏 tick 调用一次。 */
  tickWorld(): void {
    this.tickCount++;
    const players = this.host.playerPositions();
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
    }
    this.aimAt(players[0]);
    this.spawner.tick(this, this.entities.values());
    for (const [id, e] of this.entities) {
      if (e.isDead) {
        this.entities.delete(id);
        continue;
      }
      this.aimAt(this.nearestPlayerTo(e, players));
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
      const distSq = (p.x - entity.x) ** 2 + (p.y - entity.y) ** 2 + (p.z - entity.z) ** 2;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        best = p;
      }
    }
    return best;
  }
}
