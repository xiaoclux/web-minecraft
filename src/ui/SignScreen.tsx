import { useEffect, useRef, useState } from 'react';
import type { Game } from '../engine/Game';
import { SIGN_LINE_COUNT, SIGN_LINE_MAX_CHARS } from '../engine/constants/game';

interface SignScreenProps {
  game: Game;
}

const LINE_INDICES = Array.from({ length: SIGN_LINE_COUNT }, (_, i) => i);

/**
 * 告示牌编辑界面：刚放下牌子时弹出，写完点"完成"一次性交给引擎。
 * 与 1.8.9 一致——放下之后就不能再改了，所以这里只在放置时出现一次。
 */
export function SignScreen({ game }: SignScreenProps) {
  const firstRef = useRef<HTMLInputElement>(null);
  // 编辑中的文字只在这里保管，引擎只在"完成"时收一次
  const [lines, setLines] = useState<string[]>(() => new Array<string>(SIGN_LINE_COUNT).fill(''));

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  const finish = () => game.finishEditingSign(lines);
  const setLine = (index: number, text: string) => {
    setLines((prev) => prev.map((line, i) => (i === index ? text : line)));
  };

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
            value={lines[i]}
            onChange={(e) => setLine(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                finish();
              }
            }}
          />
        ))}
        <button className="menu-button primary" onClick={finish}>
          完成
        </button>
      </div>
    </div>
  );
}
