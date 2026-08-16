/**
 * 状态效果（药水效果）：药水、附魔、Boss 攻击都往实体身上挂这些。
 * 效果本身只是数据，具体作用由 LivingEntity / Player / Game 在各自的地方读取。
 */

/** 效果 id（与 1.8.9 的效果对应）。 */
export const EffectId = {
  SPEED: 'speed',
  SLOWNESS: 'slowness',
  STRENGTH: 'strength',
  WEAKNESS: 'weakness',
  INSTANT_HEALTH: 'instant_health',
  INSTANT_DAMAGE: 'instant_damage',
  REGENERATION: 'regeneration',
  POISON: 'poison',
  WITHER: 'wither',
  JUMP_BOOST: 'jump_boost',
  FIRE_RESISTANCE: 'fire_resistance',
  WATER_BREATHING: 'water_breathing',
  NIGHT_VISION: 'night_vision',
  INVISIBILITY: 'invisibility',
} as const;
export type EffectId = (typeof EffectId)[keyof typeof EffectId];

/** 效果定义。 */
export interface EffectDef {
  id: EffectId;
  label: string;
  /** HUD 图标与药水瓶的颜色。 */
  color: string;
  /** 负面效果（HUD 用红框标出）。 */
  isBad: boolean;
  /** 瞬间生效、不驻留（瞬间治疗 / 瞬间伤害）。 */
  instant?: boolean;
  /** 周期性生效的间隔（tick）：等级越高越快，实际间隔 = interval >> amplifier。 */
  periodTicks?: number;
}

export const EFFECT_DEFS: Record<EffectId, EffectDef> = {
  speed: { id: EffectId.SPEED, label: '迅捷', color: '#7cafc6', isBad: false },
  slowness: { id: EffectId.SLOWNESS, label: '缓慢', color: '#5a6c81', isBad: true },
  strength: { id: EffectId.STRENGTH, label: '力量', color: '#932423', isBad: false },
  weakness: { id: EffectId.WEAKNESS, label: '虚弱', color: '#484d48', isBad: true },
  instant_health: { id: EffectId.INSTANT_HEALTH, label: '瞬间治疗', color: '#f82423', isBad: false, instant: true },
  instant_damage: { id: EffectId.INSTANT_DAMAGE, label: '瞬间伤害', color: '#430a09', isBad: true, instant: true },
  regeneration: {
    id: EffectId.REGENERATION,
    label: '生命恢复',
    color: '#cd5cab',
    isBad: false,
    periodTicks: 50,
  },
  poison: { id: EffectId.POISON, label: '中毒', color: '#4e9331', isBad: true, periodTicks: 25 },
  wither: { id: EffectId.WITHER, label: '凋零', color: '#352a27', isBad: true, periodTicks: 40 },
  jump_boost: { id: EffectId.JUMP_BOOST, label: '跳跃提升', color: '#22ff4c', isBad: false },
  fire_resistance: { id: EffectId.FIRE_RESISTANCE, label: '抗火', color: '#e49a3a', isBad: false },
  water_breathing: { id: EffectId.WATER_BREATHING, label: '水下呼吸', color: '#2e5299', isBad: false },
  night_vision: { id: EffectId.NIGHT_VISION, label: '夜视', color: '#1f1fa1', isBad: false },
  invisibility: { id: EffectId.INVISIBILITY, label: '隐身', color: '#7f8392', isBad: false },
};

/** 身上的一个效果。 */
export interface ActiveEffect {
  id: EffectId;
  /** 等级 - 1（0 表示 I 级）。 */
  amplifier: number;
  /** 剩余 tick。 */
  ticks: number;
}

/** 每级迅捷 / 缓慢对移动速度的影响。 */
export const SPEED_PER_LEVEL = 0.2;
export const SLOWNESS_PER_LEVEL = 0.15;
/** 每级力量 / 虚弱对近战伤害的加减（半心为 1）。 */
export const STRENGTH_PER_LEVEL = 3;
export const WEAKNESS_PER_LEVEL = 4;
/** 缓慢叠满时也不会完全走不动。 */
export const MIN_SPEED_MULTIPLIER = 0.2;
/** 每级跳跃提升对起跳速度的加成。 */
export const JUMP_BOOST_PER_LEVEL = 0.1;
/** 瞬间治疗 / 瞬间伤害的基础量（每级翻倍）。 */
export const INSTANT_BASE_AMOUNT = 6;
/** 生命恢复 / 中毒 / 凋零每次生效的量。 */
export const PERIODIC_AMOUNT = 1;
/** 中毒不会把生命打到 0 以下（1.8.9 同）。 */
export const POISON_MIN_HEALTH = 1;

/** 判断是不是已知的效果 id。 */
export function isEffectId(id: string): id is EffectId {
  return id in EFFECT_DEFS;
}
