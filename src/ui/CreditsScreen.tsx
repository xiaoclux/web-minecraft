import { useEffect } from 'react';
import type { Game } from '../engine/Game';
import { END_POEM_LINES } from '../engine/constants/credits';

interface CreditsScreenProps {
  game: Game;
}

/** 滚完全部字幕需要多久（秒）；也可以随时按任意键跳过。 */
const SCROLL_DURATION_S = 60;

/**
 * 终末之诗：打完末影龙、从返回传送门离开末地时滚动播放。
 * 文本是本项目自己写的，不是原版那首诗。
 */
export function CreditsScreen({ game }: CreditsScreenProps) {
  useEffect(() => {
    // 播放期间吞掉所有按键，任意键结束字幕（与原版一致）
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault();
      game.closeCredits();
    };
    window.addEventListener('keydown', onKey);
    const timer = window.setTimeout(() => game.closeCredits(), SCROLL_DURATION_S * 1000);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(timer);
    };
  }, [game]);

  return (
    <div className="overlay credits" onClick={() => game.closeCredits()}>
      <div className="credits-scroll" style={{ animationDuration: `${SCROLL_DURATION_S}s` }}>
        {END_POEM_LINES.map((line, i) =>
          line === '' ? <div key={i} className="credits-gap" /> : <p key={i}>{line}</p>,
        )}
      </div>
      <div className="credits-hint">按任意键结束</div>
    </div>
  );
}
