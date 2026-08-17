import { useEffect, useRef } from 'react';
import type { Game } from '../engine/Game';
import { SIGN_LINE_COUNT, SIGN_LINE_MAX_CHARS } from '../engine/constants/game';
import type { GameUiState } from '../engine/events/GameState';

interface SignScreenProps {
  game: Game;
  state: GameUiState;
}

const LINE_INDICES = Array.from({ length: SIGN_LINE_COUNT }, (_, i) => i);

/**
 * 告示牌编辑界面：刚放下牌子时弹出，写完点"完成"。
 * 与 1.8.9 一致——放下之后就不能再改了，所以这里只在放置时出现一次。
 */
export function SignScreen({ game, state }: SignScreenProps) {
  const firstRef = useRef<HTMLInputElement>(null);
  const lines = game.signLines;
  // signVersion 变化时说明文字更新了，让 React 跟着重渲染
  void state.signVersion;

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  return (
    <div className="overlay center">
      <div className="panel menu-panel sign-editor">
        <h2>写点什么</h2>
        {LINE_INDICES.map((i) => (
          <input
            key={i}
            ref={i === 0 ? firstRef : undefined}
            type="text"
            className="sign-line"
            maxLength={SIGN_LINE_MAX_CHARS}
            value={lines[i] ?? ''}
            onChange={(e) => game.setSignLine(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                game.finishEditingSign();
              }
            }}
          />
        ))}
        <button className="menu-button primary" onClick={() => game.finishEditingSign()}>
          完成
        </button>
      </div>
    </div>
  );
}
