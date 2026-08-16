import { useState } from 'react';
import type { Game } from '../engine/Game';

interface LanPanelProps {
  game: Game;
  onBack: () => void;
}

/**
 * 「对局域网开放」面板：主机在这里生成房间码、粘回客人的回应码。
 * 浏览器不能监听端口，所以走 WebRTC 手动交换一次码，之后就是直连。
 */
export function LanPanel({ game, onBack }: LanPanelProps) {
  const [hostCode, setHostCode] = useState('');
  const [answerCode, setAnswerCode] = useState('');
  const [status, setStatus] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const handleOpen = async (): Promise<void> => {
    setIsBusy(true);
    setStatus('正在生成房间码…');
    try {
      const code = await game.openToLan();
      setHostCode(code);
      setStatus('把上面的房间码发给朋友，然后把对方给你的回应码粘到下面');
    } catch (err) {
      setStatus(`生成失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleAccept = async (): Promise<void> => {
    setIsBusy(true);
    setStatus('正在建立连接…');
    const ok = await game.acceptGuest(answerCode);
    setStatus(ok ? '对方已加入！想再邀请一个人就再点一次「生成房间码」' : '连接失败，检查回应码是否完整');
    setAnswerCode('');
    setIsBusy(false);
  };

  return (
    <div className="overlay center">
      <div className="panel menu-panel lan-panel">
        <h2>对局域网开放</h2>
        <p className="muted">当前在线客人：{game.guestCount}</p>
        <button className="menu-button primary" onClick={() => void handleOpen()} disabled={isBusy}>
          生成房间码
        </button>
        {hostCode && (
          <label>
            房间码（发给朋友）
            <textarea className="lan-code" readOnly value={hostCode} onFocus={(e) => e.target.select()} />
          </label>
        )}
        <label>
          回应码（朋友给你的）
          <textarea className="lan-code" value={answerCode} onChange={(e) => setAnswerCode(e.target.value)} />
        </label>
        <button className="menu-button" onClick={() => void handleAccept()} disabled={isBusy || !answerCode.trim()}>
          让对方加入
        </button>
        {status && <p className="muted">{status}</p>}
        {game.isHosting && (
          <button
            className="menu-button danger"
            onClick={() => {
              game.closeLan();
              setHostCode('');
              setStatus('已关闭');
            }}
          >
            关闭开放
          </button>
        )}
        <button className="menu-button" onClick={onBack}>
          返回
        </button>
      </div>
    </div>
  );
}
