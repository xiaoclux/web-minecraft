import { useState } from 'react';
import { RtcJoiner } from '../net/webrtc';
import type { ClientTransport } from '../net/NetClient';

interface JoinByCodePanelProps {
  /** 通道建立后把它交给上层去开游戏。 */
  onConnected: (transport: ClientTransport, playerName: string) => void;
  onBack: () => void;
}

/**
 * 用房间码加入朋友的世界：粘主机的房间码 → 得到回应码 → 发回去 → 等对方点「让对方加入」。
 */
export function JoinByCodePanel({ onConnected, onBack }: JoinByCodePanelProps) {
  const [hostCode, setHostCode] = useState('');
  const [answerCode, setAnswerCode] = useState('');
  const [playerName, setPlayerName] = useState('玩家');
  const [status, setStatus] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const handleGenerate = async (): Promise<void> => {
    setIsBusy(true);
    setStatus('正在生成回应码…');
    try {
      const joiner = new RtcJoiner();
      const code = await joiner.createAnswer(hostCode);
      setAnswerCode(code);
      setStatus('把回应码发给主机，等对方点「让对方加入」，这里会自动进入游戏');
      const transport = await joiner.waitForConnection();
      onConnected(transport, playerName.trim() || '玩家');
    } catch (err) {
      setStatus(`失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="overlay center">
      <div className="panel menu-panel lan-panel">
        <h2>用房间码加入</h2>
        <label>
          玩家名
          <input type="text" value={playerName} onChange={(e) => setPlayerName(e.target.value)} maxLength={16} />
        </label>
        <label>
          房间码（主机给你的）
          <textarea className="lan-code" value={hostCode} onChange={(e) => setHostCode(e.target.value)} />
        </label>
        <button
          className="menu-button primary"
          onClick={() => void handleGenerate()}
          disabled={isBusy || !hostCode.trim()}
        >
          生成回应码
        </button>
        {answerCode && (
          <label>
            回应码（发回给主机）
            <textarea className="lan-code" readOnly value={answerCode} onFocus={(e) => e.target.select()} />
          </label>
        )}
        {status && <p className="muted">{status}</p>}
        <button className="menu-button" onClick={onBack}>
          返回
        </button>
      </div>
    </div>
  );
}
