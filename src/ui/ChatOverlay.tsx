import { useEffect, useRef, useState } from 'react';
import type { Game } from '../engine/Game';
import type { GameUiState } from '../engine/events/GameState';
import { completeCommand } from '../engine/systems/Commands';

interface ChatOverlayProps {
  game: Game;
  state: GameUiState;
}

/** 聊天记录在关闭聊天栏后还显示多少 tick。 */
const MESSAGE_VISIBLE_TICKS = 200;
/** 最多同时显示几行。 */
const VISIBLE_LINES = 10;

/**
 * 聊天栏：平时只在左下角显示最近几条消息，打开后可以输入聊天或指令。
 * 支持上下键翻历史、Tab 补全指令名。
 */
export function ChatOverlay({ game, state }: ChatOverlayProps) {
  const [text, setText] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const isOpen = state.isChatOpen;

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setText(game.chatInitialText);
    setHistoryIndex(-1);
    // 等一帧再聚焦，避免打开聊天栏的那个按键被输入框吃掉
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [isOpen, game]);

  const visible = isOpen
    ? state.chat.slice(-VISIBLE_LINES)
    : state.chat.filter((m) => game.tick - m.tick < MESSAGE_VISIBLE_TICKS).slice(-VISIBLE_LINES);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      game.submitChat(text);
      setText('');
      return;
    }
    if (e.key === 'Escape') {
      game.closeChat();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const matches = completeCommand(text.split(/\s+/)[0] ?? '');
      if (matches.length === 1) {
        setText(`${matches[0]} `);
      }
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const history = game.chatHistoryList;
      if (history.length === 0) {
        return;
      }
      const next =
        e.key === 'ArrowUp' ? Math.min(history.length - 1, historyIndex + 1) : Math.max(-1, historyIndex - 1);
      setHistoryIndex(next);
      setText(next < 0 ? '' : history[history.length - 1 - next]);
    }
  };

  if (!isOpen && visible.length === 0) {
    return null;
  }
  return (
    <div className={`chat-overlay${isOpen ? ' open' : ''}`}>
      <div className="chat-log">
        {visible.map((message) => (
          <div key={message.id} className="chat-line">
            {message.text}
          </div>
        ))}
      </div>
      {isOpen && (
        <input
          ref={inputRef}
          className="chat-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => inputRef.current?.focus()}
          placeholder="输入聊天内容，或以 / 开头输入指令"
        />
      )}
    </div>
  );
}
