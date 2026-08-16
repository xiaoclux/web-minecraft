import { useState } from 'react';
import type { Game } from '../engine/Game';
import { TICKS_PER_SECOND } from '../engine/constants/game';
import { Screen, type GameUiState } from '../engine/events/GameState';
import { ACHIEVEMENT_DEFS, STAT_LABELS, StatId, achievementDef } from '../engine/systems/Achievements';
import { getItemIcon } from '../engine/textures/IconRegistry';

interface StatsScreenProps {
  game: Game;
  state: GameUiState;
}

const Tab = { ACHIEVEMENTS: 'achievements', STATS: 'stats' } as const;
type Tab = (typeof Tab)[keyof typeof Tab];

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

/** 游戏时长：tick → "x 小时 y 分" / "y 分 z 秒"。 */
function formatPlayTime(ticks: number): string {
  const totalSeconds = Math.floor(ticks / TICKS_PER_SECOND);
  const hours = Math.floor(totalSeconds / (SECONDS_PER_MINUTE * MINUTES_PER_HOUR));
  const minutes = Math.floor((totalSeconds / SECONDS_PER_MINUTE) % MINUTES_PER_HOUR);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  return hours > 0 ? `${hours} 小时 ${minutes} 分` : `${minutes} 分 ${seconds} 秒`;
}

/** 统计值的显示：伤害以半心计，换算成心。 */
function formatStat(id: StatId, value: number): string {
  if (id === StatId.PLAY_TICKS) {
    return formatPlayTime(value);
  }
  if (id === StatId.DAMAGE_DEALT || id === StatId.DAMAGE_TAKEN) {
    return `${(value / 2).toFixed(1)} 颗心`;
  }
  return String(value);
}

/** 成就与统计页（从暂停菜单进入）。state.achievementVersion 变化时重渲染。 */
export function StatsScreen({ game, state }: StatsScreenProps) {
  const [tab, setTab] = useState<Tab>(Tab.ACHIEVEMENTS);
  const achievements = game.achievements;
  // 只是让 React 在成就变化时刷新，值本身不用
  void state.achievementVersion;
  return (
    <div className="overlay center">
      <div className="panel menu-panel stats-panel">
        <h2>成就与统计</h2>
        <div className="tabs">
          <button
            className={`tab${tab === Tab.ACHIEVEMENTS ? ' active' : ''}`}
            onClick={() => setTab(Tab.ACHIEVEMENTS)}
          >
            成就 {achievements.unlockedCount}/{ACHIEVEMENT_DEFS.length}
          </button>
          <button className={`tab${tab === Tab.STATS ? ' active' : ''}`} onClick={() => setTab(Tab.STATS)}>
            统计
          </button>
        </div>
        {tab === Tab.ACHIEVEMENTS ? (
          <ul className="achievement-list">
            {ACHIEVEMENT_DEFS.map((def) => {
              const done = achievements.has(def.id);
              const parentDone = !def.parent || achievements.has(def.parent);
              return (
                <li key={def.id} className={`achievement${done ? ' done' : parentDone ? '' : ' locked'}`}>
                  <img src={getItemIcon(def.icon)} alt="" draggable={false} />
                  <div>
                    <div className="achievement-title">{def.label}</div>
                    <div className="achievement-desc">
                      {parentDone || done || !def.parent
                        ? def.description
                        : `需要先完成「${achievementDef(def.parent).label}」`}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <table className="stats-table">
            <tbody>
              {(Object.keys(STAT_LABELS) as StatId[]).map((id) => (
                <tr key={id}>
                  <td>{STAT_LABELS[id]}</td>
                  <td>{formatStat(id, achievements.stat(id))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <button className="menu-button" onClick={() => game.openScreen(Screen.PAUSE)}>
          返回
        </button>
      </div>
    </div>
  );
}
