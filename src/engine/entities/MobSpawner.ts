import { BlockId } from '../blocks/BlockRegistry';
import {
  DESPAWN_DISTANCE,
  HOSTILE_SPAWN_ATTEMPTS_PER_TICK,
  HOSTILE_SPAWN_INTERVAL_TICKS,
  HOSTILE_SPAWN_LIGHT_MAX,
  MAX_HOSTILE_MOBS,
  MAX_PASSIVE_MOBS,
  PASSIVE_SPAWN_INTERVAL_TICKS,
  SPAWN_MAX_DISTANCE,
  SPAWN_MIN_DISTANCE,
} from '../constants/mobs';
import { AABB } from '../physics/AABB';
import { isBoxBlocked } from '../physics/collision';
import type { Entity } from './Entity';
import type { EntityContext } from './EntityContext';
import { Mob } from './Mob';
import { MOB_DEFS, MobType } from './MobDefs';

const HOSTILE_TYPES: MobType[] = [
  MobType.ZOMBIE,
  MobType.SKELETON,
  MobType.CREEPER,
  MobType.SPIDER,
  MobType.ENDERMAN,
  MobType.SLIME,
];
const HOSTILE_WEIGHTS = [4, 3, 2, 2, 1, 1];
const PASSIVE_TYPES: MobType[] = [MobType.PIG, MobType.COW, MobType.SHEEP, MobType.CHICKEN];
const PASSIVE_GROUP_MIN = 2;
const PASSIVE_GROUP_MAX = 4;
const PASSIVE_SPAWN_LIGHT_MIN = 9;
/** 初始世界生成时的友善生物数量。 */
const INITIAL_PASSIVE_GROUPS = 12;
const INITIAL_SPAWN_RADIUS = 80;
const SURFACE_SPAWN_RATIO = 0.6;
/** 鱿鱼往下找水的深度，蝙蝠的 y 范围与光照上限。 */
const SQUID_SEARCH_DEPTH = 12;
const BAT_MIN_Y = 8;
const BAT_MAX_Y = 50;
const BAT_MAX_LIGHT = 4;

/** 生物生成与消失。 */
export class MobSpawner {
  /** 是否允许敌对生成（和平难度关闭）。 */
  hostileEnabled = true;

  /** 每 tick 调用。 */
  tick(ctx: EntityContext, entities: Iterable<Entity>): void {
    let hostile = 0;
    let passive = 0;
    const list: Mob[] = [];
    for (const e of entities) {
      if (e instanceof Mob && !e.isDead) {
        list.push(e);
        if (e.def.hostile) {
          hostile++;
        } else {
          passive++;
        }
      }
    }
    this.despawnFar(ctx, list);
    if (this.hostileEnabled && ctx.tick % HOSTILE_SPAWN_INTERVAL_TICKS === 0 && hostile < MAX_HOSTILE_MOBS) {
      for (let i = 0; i < HOSTILE_SPAWN_ATTEMPTS_PER_TICK; i++) {
        this.trySpawnHostile(ctx);
      }
    }
    if (ctx.tick % PASSIVE_SPAWN_INTERVAL_TICKS === 0 && passive < MAX_PASSIVE_MOBS && ctx.isDaytime()) {
      this.trySpawnPassiveGroup(ctx, SPAWN_MIN_DISTANCE, SPAWN_MAX_DISTANCE);
    }
    if (ctx.tick % PASSIVE_SPAWN_INTERVAL_TICKS === 0 && passive < MAX_PASSIVE_MOBS) {
      this.trySpawnSquid(ctx);
      this.trySpawnBat(ctx);
    }
  }

  /** 鱿鱼：在够深的水里生成。 */
  private trySpawnSquid(ctx: EntityContext): void {
    const pos = this.randomSpawnPosition(ctx, SPAWN_MIN_DISTANCE, SPAWN_MAX_DISTANCE);
    if (!pos) {
      return;
    }
    const world = ctx.world;
    const surface = world.getSurfaceY(pos.x, pos.z);
    for (let y = surface; y > surface - SQUID_SEARCH_DEPTH; y--) {
      if (world.getBlock(pos.x, y, pos.z) === BlockId.WATER && world.getBlock(pos.x, y - 1, pos.z) === BlockId.WATER) {
        this.spawnMob(ctx, MobType.SQUID, pos.x + 0.5, y, pos.z + 0.5);
        return;
      }
    }
  }

  /** 蝙蝠：在地下黑暗的空腔里生成。 */
  private trySpawnBat(ctx: EntityContext): void {
    const pos = this.randomSpawnPosition(ctx, SPAWN_MIN_DISTANCE, SPAWN_MAX_DISTANCE);
    if (!pos) {
      return;
    }
    const world = ctx.world;
    const y = BAT_MIN_Y + Math.floor(ctx.random() * (BAT_MAX_Y - BAT_MIN_Y));
    if (
      world.getBlock(pos.x, y, pos.z) !== BlockId.AIR ||
      world.getBlock(pos.x, y + 1, pos.z) !== BlockId.AIR ||
      ctx.lightLevelAt(pos.x, y, pos.z) > BAT_MAX_LIGHT
    ) {
      return;
    }
    this.spawnMob(ctx, MobType.BAT, pos.x + 0.5, y, pos.z + 0.5);
  }

  /** 新世界初始撒布友善生物。 */
  populateInitial(ctx: EntityContext): void {
    for (let i = 0; i < INITIAL_PASSIVE_GROUPS; i++) {
      this.trySpawnPassiveGroup(ctx, 8, INITIAL_SPAWN_RADIUS);
    }
  }

  private despawnFar(ctx: EntityContext, mobs: Mob[]): void {
    const player = ctx.player;
    for (const mob of mobs) {
      if (!mob.def.hostile) {
        continue;
      }
      const dx = mob.x - player.x;
      const dz = mob.z - player.z;
      if (dx * dx + dz * dz > DESPAWN_DISTANCE * DESPAWN_DISTANCE && ctx.random() < 0.05) {
        mob.isDead = true;
      }
    }
  }

  private pickWeighted(ctx: EntityContext): MobType {
    const total = HOSTILE_WEIGHTS.reduce((a, b) => a + b, 0);
    let r = ctx.random() * total;
    for (let i = 0; i < HOSTILE_TYPES.length; i++) {
      r -= HOSTILE_WEIGHTS[i];
      if (r <= 0) {
        return HOSTILE_TYPES[i];
      }
    }
    return HOSTILE_TYPES[0];
  }

  private randomSpawnPosition(ctx: EntityContext, minDist: number, maxDist: number): { x: number; z: number } | null {
    const player = ctx.player;
    const angle = ctx.random() * Math.PI * 2;
    const dist = minDist + ctx.random() * (maxDist - minDist);
    const x = Math.floor(player.x + Math.cos(angle) * dist);
    const z = Math.floor(player.z + Math.sin(angle) * dist);
    if (!ctx.world.hasChunkAt(x, z)) {
      return null;
    }
    return { x, z };
  }

  private trySpawnHostile(ctx: EntityContext): void {
    const pos = this.randomSpawnPosition(ctx, SPAWN_MIN_DISTANCE, SPAWN_MAX_DISTANCE);
    if (!pos) {
      return;
    }
    const world = ctx.world;
    // 大部分尝试落在地表，其余在地表以下随机取 y（覆盖洞穴，不在高空空气里空转）
    const surfaceY = world.getSurfaceY(pos.x, pos.z);
    const y =
      ctx.random() < SURFACE_SPAWN_RATIO
        ? surfaceY
        : 1 + Math.floor(ctx.random() * Math.max(1, surfaceY - 1));
    if (ctx.lightLevelAt(pos.x, y, pos.z) > HOSTILE_SPAWN_LIGHT_MAX) {
      return;
    }
    this.spawnMobAt(ctx, this.pickWeighted(ctx), pos.x, y, pos.z);
  }

  private trySpawnPassiveGroup(ctx: EntityContext, minDist: number, maxDist: number): void {
    const pos = this.randomSpawnPosition(ctx, minDist, maxDist);
    if (!pos) {
      return;
    }
    const world = ctx.world;
    const y = world.getSurfaceY(pos.x, pos.z);
    if (
      world.getBlock(pos.x, y - 1, pos.z) !== BlockId.GRASS ||
      ctx.lightLevelAt(pos.x, y, pos.z) < PASSIVE_SPAWN_LIGHT_MIN
    ) {
      return;
    }
    const type = PASSIVE_TYPES[Math.floor(ctx.random() * PASSIVE_TYPES.length)];
    const count = PASSIVE_GROUP_MIN + Math.floor(ctx.random() * (PASSIVE_GROUP_MAX - PASSIVE_GROUP_MIN + 1));
    for (let i = 0; i < count; i++) {
      const ox = pos.x + Math.floor((ctx.random() - 0.5) * 6);
      const oz = pos.z + Math.floor((ctx.random() - 0.5) * 6);
      const oy = world.getSurfaceY(ox, oz);
      if (world.getBlock(ox, oy - 1, oz) === BlockId.GRASS) {
        this.spawnMob(ctx, type, ox + 0.5, oy, oz + 0.5);
      }
    }
  }

  /**
   * 在方块 (x, y, z) 上生成一只生物（刷怪笼等外部触发用）：
   * 要求脚下实心、身位两格空气且包围盒不卡方块。返回是否生成成功。
   */
  spawnMobAt(ctx: EntityContext, type: MobType, x: number, y: number, z: number): boolean {
    if (!ctx.world.canStandAt(x, y, z)) {
      return false;
    }
    return this.spawnMob(ctx, type, x + 0.5, y, z + 0.5);
  }

  private spawnMob(ctx: EntityContext, type: MobType, x: number, y: number, z: number): boolean {
    const def = MOB_DEFS[type];
    const box = AABB.fromFeet(x, y, z, def.width, def.height);
    if (isBoxBlocked(ctx.world, box)) {
      return false;
    }
    const mob = new Mob(type);
    mob.setPosition(x, y, z);
    mob.yaw = ctx.random() * Math.PI * 2;
    ctx.spawnEntity(mob);
    return true;
  }
}
