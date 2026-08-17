import { memo, type PointerEvent as ReactPointerEvent } from 'react';
import type { Game } from '../engine/Game';
import { GameMode, HOTBAR_SIZE, PLAYER_MAX_FOOD, PLAYER_MAX_HEALTH, TICKS_PER_SECOND } from '../engine/constants/game';
import { EFFECT_DEFS } from '../engine/entities/effects';
import type { GameUiState } from '../engine/events/GameState';
import { ItemIcon } from './ItemIcon';

interface HudProps {
  game: Game;
  state: GameUiState;
}

const HEART_COUNT = PLAYER_MAX_HEALTH / 2;
const FOOD_COUNT = PLAYER_MAX_FOOD / 2;
const BUBBLE_COUNT = 10;
const ARMOR_COUNT = 10;
const ARMOR_MAX = 20;
const HOTBAR_INDICES = Array.from({ length: HOTBAR_SIZE }, (_, i) => i);
/** 效果等级的罗马数字（下标即 amplifier）。 */
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

/** 剩余时间显示成 m:ss。 */
function formatEffectTime(ticks: number): string {
  const seconds = Math.ceil(ticks / TICKS_PER_SECOND);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
const BUBBLE_INDICES = Array.from({ length: BUBBLE_COUNT }, (_, i) => i);

/** 状态条一行；memo 住，血量 / 饥饿没变时不跟着别的字段重渲染。 */
const StatRow = memo(function StatRow({
  value,
  max,
  count,
  filled,
  half,
  empty,
  reverse,
}: {
  value: number;
  max: number;
  count: number;
  filled: string;
  half: string;
  empty: string;
  reverse?: boolean;
}) {
  const perIcon = max / count;
  const icons = [];
  for (let i = 0; i < count; i++) {
    const threshold = (i + 1) * perIcon;
    let cls = empty;
    if (value >= threshold) {
      cls = filled;
    } else if (value >= threshold - perIcon / 2) {
      cls = half;
    }
    icons.push(<span key={i} className={`stat-icon ${cls}`} />);
  }
  return <div className={`stat-row${reverse ? ' reverse' : ''}`}>{icons}</div>;
});

/** 游戏内 HUD：准星、状态条、快捷栏。 */
export function Hud({ game, state }: HudProps) {
  const inventory = game.player.inventory;
  // 一个委托 handler 代替 9 个闭包
  const handleHotbarPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const slot = (e.target as HTMLElement).closest<HTMLElement>('[data-slot]')?.dataset.slot;
    if (slot !== undefined) {
      game.selectSlot(Number(slot));
    }
  };
  const isCreative = state.mode === GameMode.CREATIVE;
  const showAir = state.isUnderwater || state.air < state.maxAir;
  return (
    <div className="hud">
      <div className="crosshair" />
      {state.targetLabel && <div className="target-label">{state.targetLabel}</div>}
      {state.boss && (
        <div className="boss-bar">
          <div className="boss-name">{state.boss.label}</div>
          <div className="boss-bar-track">
            <div className="boss-bar-fill" style={{ width: `${Math.round(state.boss.ratio * 100)}%` }} />
          </div>
        </div>
      )}
      {state.effects.length > 0 && (
        <div className="effect-list">
          {state.effects.map((effect) => {
            const def = EFFECT_DEFS[effect.id];
            return (
              <div key={effect.id} className={`effect${def.isBad ? ' bad' : ''}`} title={def.label}>
                <span className="effect-dot" style={{ background: def.color }} />
                <span className="effect-name">
                  {def.label}
                  {effect.amplifier > 0 ? ` ${ROMAN[Math.min(ROMAN.length - 1, effect.amplifier)]}` : ''}
                </span>
                <span className="effect-time">{formatEffectTime(effect.ticks)}</span>
              </div>
            );
          })}
        </div>
      )}
      {state.toast && (
        <div className="toast" key={state.toastVersion}>
          {state.toast}
        </div>
      )}
      <div className="hud-bottom">
        {!isCreative && (
          <div className="stats">
            <div className="stats-left">
              {state.armor > 0 && (
                <StatRow
                  value={state.armor}
                  max={ARMOR_MAX}
                  count={ARMOR_COUNT}
                  filled="armor-full"
                  half="armor-half"
                  empty="armor-empty"
                />
              )}
              <StatRow
                value={state.health}
                max={state.maxHealth}
                count={HEART_COUNT}
                filled="heart-full"
                half="heart-half"
                empty="heart-empty"
              />
            </div>
            <div className="stats-right">
              <StatRow
                value={state.food}
                max={PLAYER_MAX_FOOD}
                count={FOOD_COUNT}
                filled="food-full"
                half="food-half"
                empty="food-empty"
                reverse
              />
              {showAir && (
                <div className="stat-row reverse">
                  {BUBBLE_INDICES.map((i) => (
                    <span
                      key={i}
                      className={`stat-icon ${state.air / state.maxAir > i / BUBBLE_COUNT ? 'bubble-full' : 'bubble-empty'}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        {!isCreative && (
          <div className="xp-bar">
            <div className="xp-fill" style={{ width: `${Math.round(state.xpProgress * 100)}%` }} />
            {state.xpLevel > 0 && <span className="xp-level">{state.xpLevel}</span>}
          </div>
        )}
        {/* 快捷栏可点选：粗指针设备下 CSS 才放开 pointer-events，桌面端指针锁定时点不到 */}
        <div className="hotbar" onPointerDown={handleHotbarPointerDown}>
          {HOTBAR_INDICES.map((i) => (
            <div
              key={i}
              data-slot={i}
              className={`hotbar-slot${i === state.selectedSlot ? ' selected' : ''}`}
            >
              <ItemIcon stack={inventory.get(i)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
