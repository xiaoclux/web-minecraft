/**
 * 末影水晶：立在黑曜石柱顶，会给附近的末影龙持续回血；被打就爆炸消失。
 * 本身不动、不受重力，是"能被打掉的装饰物 + 治疗源"。
 */

import { ENDER_CRYSTAL_EXPLOSION_RADIUS, ENDER_CRYSTAL_HEAL_RANGE } from '../constants/mobs';
import { Entity, type EntitySaveData } from './Entity';
import type { EntityContext } from './EntityContext';

const CRYSTAL_SIZE = 2;

/** 末影水晶。 */
export class EnderCrystalEntity extends Entity {
  readonly type = 'ender_crystal';

  constructor(id?: number) {
    super(id);
    this.width = CRYSTAL_SIZE;
    this.height = CRYSTAL_SIZE;
    this.hasGravity = false;
  }

  /** 治疗范围（末影龙在这个距离内才会被它回血）。 */
  get healRange(): number {
    return ENDER_CRYSTAL_HEAL_RANGE;
  }

  override tick(_ctx: EntityContext): void {
    this.age++;
  }

  override move(_ctx: EntityContext, _dt: number): void {
    // 水晶不动
  }

  /** 被打碎：原地小爆炸。 */
  destroyByAttack(ctx: EntityContext, sourceId: number): void {
    if (this.isDead) {
      return;
    }
    this.isDead = true;
    ctx.explode(this.x, this.y, this.z, ENDER_CRYSTAL_EXPLOSION_RADIUS, sourceId);
  }

  serialize(): EntitySaveData {
    return { ...this.serializeBase(), type: this.type };
  }

  static deserialize(data: EntitySaveData): EnderCrystalEntity {
    const crystal = new EnderCrystalEntity(data.id);
    crystal.setPosition(data.x, data.y, data.z);
    return crystal;
  }
}
