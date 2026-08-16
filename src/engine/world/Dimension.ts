/**
 * 维度：主世界 / 下界 / 末地各自一套世界数据（方块、光照、流体、方块实体、实体、随机 tick）。
 * Game 同时持有若干维度，但只有玩家所在的那个会被 tick 与渲染；其余维度只保留数据，等玩家回来。
 */

import type { Entity } from '../entities/Entity';
import { RandomTickSystem } from '../systems/RandomTickSystem';
import { BlockEntityStore } from './BlockEntityStore';
import type { ChunkGenerator } from './ChunkGenerator';
import { ChunkManager } from './ChunkManager';
import { FluidSimulator } from './FluidSimulator';
import { LightEngine } from './LightEngine';
import { World } from './World';

/** 维度 id。 */
export const DimensionId = {
  OVERWORLD: 'overworld',
  NETHER: 'nether',
  END: 'end',
} as const;
export type DimensionId = (typeof DimensionId)[keyof typeof DimensionId];

/** 维度的固有规则。 */
export interface DimensionDef {
  id: DimensionId;
  label: string;
  /** 有天空光：下界与末地没有天空，天空光恒为 0。 */
  hasSkyLight: boolean;
  /** 有昼夜与天气（只有主世界有）。 */
  hasWeather: boolean;
  /** 与主世界的坐标比例（下界 1:8）。 */
  coordinateScale: number;
  /** 水会立刻蒸发（下界）。 */
  waterEvaporates: boolean;
  /** 睡床会爆炸（主世界以外）。 */
  bedExplodes: boolean;
  /**
   * 环境亮度下限（当作最低"光照等级比例"喂给光照曲线）：
   * 下界即使没有光源也能看清轮廓，末地更暗一些，主世界完全按光照走。
   */
  ambientLight: number;
}

export const DIMENSION_DEFS: Readonly<Record<DimensionId, DimensionDef>> = {
  overworld: {
    id: DimensionId.OVERWORLD,
    label: '主世界',
    hasSkyLight: true,
    hasWeather: true,
    coordinateScale: 1,
    waterEvaporates: false,
    bedExplodes: false,
    ambientLight: 0,
  },
  nether: {
    id: DimensionId.NETHER,
    label: '下界',
    hasSkyLight: false,
    hasWeather: false,
    coordinateScale: 8,
    waterEvaporates: true,
    bedExplodes: true,
    ambientLight: 0.75,
  },
  end: {
    id: DimensionId.END,
    label: '末地',
    hasSkyLight: false,
    hasWeather: false,
    coordinateScale: 1,
    waterEvaporates: false,
    bedExplodes: true,
    ambientLight: 0.55,
  },
};

/** 判断是不是已知维度 id。 */
export function isDimensionId(id: string): id is DimensionId {
  return id in DIMENSION_DEFS;
}

/** 维度需要从 Game 拿到的东西。 */
export interface DimensionHost {
  /** 运行时随机源。 */
  random(): number;
  /** 当前天空亮度系数 0~1（昼夜）；无天空的维度用不到。 */
  readonly skyLevel: number;
  /** 是否在下雨（只影响有天气的维度）。 */
  readonly isRaining: boolean;
}

/** 一个维度的全部世界状态。 */
export class Dimension {
  readonly world: World;
  readonly light: LightEngine;
  readonly chunkManager: ChunkManager;
  readonly fluids: FluidSimulator;
  readonly randomTicks: RandomTickSystem;
  readonly blockEntities = new BlockEntityStore();
  readonly entities = new Map<number, Entity>();

  constructor(
    readonly def: DimensionDef,
    readonly generator: ChunkGenerator,
    private readonly host: DimensionHost,
  ) {
    this.world = new World(def.hasSkyLight);
    this.light = new LightEngine(this.world);
    this.chunkManager = new ChunkManager(this.world, this.generator, this.light);
    this.fluids = new FluidSimulator(this.world);
    this.randomTicks = new RandomTickSystem({
      world: this.world,
      random: () => this.host.random(),
      lightLevelAt: (x, y, z) => this.lightLevelAt(x, y, z),
      get isRaining(): boolean {
        return def.hasWeather && host.isRaining;
      },
    });
  }

  get id(): DimensionId {
    return this.def.id;
  }

  /** 该点的有效光照 0~15：天空光按昼夜衰减后与方块光取大者。 */
  lightLevelAt(x: number, y: number, z: number): number {
    const sky = this.def.hasSkyLight ? this.world.getSkyLight(x, y, z) * this.host.skyLevel : 0;
    const block = this.world.getBlockLight(x, y, z);
    return Math.max(sky, block);
  }
}
