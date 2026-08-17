/**
 * 专用服务端里的世界演化：流体、随机 tick（作物 / 草蔓延 / 火 / 冰雪）与重力方块。
 *
 * 浏览器主机自己就是一整个 Game，这些都由 Game 跑；专用服务端没有 Game，
 * 所以把 Dimension 里那几个不依赖玩家 / 渲染的系统在这里再攒一份，客户端只收广播不再自己算。
 * 红石 / TNT / 漏斗 / 熔炉这些还缠在 Game 里的暂时没有搬过来（见路线图 6.1）。
 */

import { WATER_TICK_INTERVAL } from '../engine/constants/fluids';
import { GravitySystem } from '../engine/systems/GravitySystem';
import { RandomTickSystem } from '../engine/systems/RandomTickSystem';
import { skyLevelAt } from '../engine/world/daylight';
import { FluidSimulator } from '../engine/world/FluidSimulator';
import type { World } from '../engine/world/World';
import type { ServerPlayerPosition } from './ServerEntityWorld';

/** 世界演化需要的外部信息。 */
export interface ServerSimulationHost {
  readonly world: World;
  /** 当前世界时间（决定天空亮度，影响作物生长与刷草）。 */
  currentTime(): number;
  /** 在线玩家的位置（随机 tick 只跑在有人的地方）。 */
  playerPositions(): readonly ServerPlayerPosition[];
  /** 是否下雨（服务端暂无天气，可恒为 false）。 */
  isRaining(): boolean;
}

/** 专用服务端的世界演化。 */
export class ServerWorldSimulation {
  private readonly fluids: FluidSimulator;
  private readonly gravity: GravitySystem;
  private readonly randomTicks: RandomTickSystem;
  private tickCount = 0;

  constructor(private readonly host: ServerSimulationHost) {
    this.fluids = new FluidSimulator(host.world);
    this.gravity = new GravitySystem(host.world);
    this.randomTicks = new RandomTickSystem({
      world: host.world,
      random: Math.random,
      lightLevelAt: (x, y, z) => this.lightLevelAt(x, y, z),
      get isRaining(): boolean {
        return host.isRaining();
      },
    });
  }

  /** 该点的有效光照 0~15（与 Dimension.lightLevelAt 同一算法）。 */
  private lightLevelAt(x: number, y: number, z: number): number {
    const world = this.host.world;
    const sky = world.getSkyLight(x, y, z) * skyLevelAt(this.host.currentTime());
    return Math.max(sky, world.getBlockLight(x, y, z));
  }

  /** 每游戏 tick 调用一次。 */
  tick(): void {
    this.tickCount++;
    this.gravity.tick();
    // 随机 tick 围着每个在线玩家跑；两个人挨得近时中间那片会被多 tick 一遍，长得快一点点无伤大雅
    for (const player of this.host.playerPositions()) {
      this.randomTicks.tick(player.x, player.z);
    }
    if (this.tickCount % WATER_TICK_INTERVAL === 0) {
      this.fluids.tick();
    }
  }
}
