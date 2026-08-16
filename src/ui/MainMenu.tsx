import type { ClientTransport } from '../net/NetClient';
import { JoinByCodePanel } from './JoinByCodePanel';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Difficulty, GAME_MODE_LABELS, GameMode } from '../engine/constants/game';
import { MAX_SEED_LENGTH, MAX_WORLD_NAME_LENGTH } from '../engine/constants/save';
import { WORLD_TYPE_LABELS, WorldType } from '../engine/constants/world';
import { createWorldId, type SaveManager, type WorldMeta, type WorldSave } from '../engine/save/SaveManager';
import { SettingsPanel } from './SettingsPanel';

interface MainMenuProps {
  saveManager: SaveManager;
  onStart: (meta: WorldMeta, save: WorldSave | null, server?: { url: string; playerName: string }) => void;
  /** 用房间码连上后回调（世界数据全来自主机）。 */
  onJoinByCode: (transport: ClientTransport, playerName: string) => void;
}

const MODE_DESCRIPTIONS: Record<GameMode, string> = {
  survival: '采集、合成、生存，抵御夜晚的怪物。',
  creative: '无限资源、飞行、秒破方块，自由建造。',
  adventure: '不能破坏/放置方块，只能探索与战斗。',
  hardcore: '困难难度，死亡即删档。',
};

const DIFFICULTY_OPTIONS: { value: Difficulty; label: string }[] = [
  { value: Difficulty.PEACEFUL, label: '和平' },
  { value: Difficulty.EASY, label: '简单' },
  { value: Difficulty.NORMAL, label: '普通' },
  { value: Difficulty.HARD, label: '困难' },
];

const WORLD_TYPE_ORDER: WorldType[] = [WorldType.DEFAULT, WorldType.FLAT];
/** 多人游戏默认填的地址（本机开服时最常用）。 */
const DEFAULT_SERVER_URL = 'ws://localhost:8080';

const MODE_ORDER: GameMode[] = [GameMode.SURVIVAL, GameMode.CREATIVE, GameMode.ADVENTURE, GameMode.HARDCORE];

function randomSeed(): string {
  return Math.floor(Math.random() * 1e9).toString();
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString();
}

/** 主菜单：新建世界 / 读取存档。 */
export function MainMenu({ saveManager, onStart, onJoinByCode }: MainMenuProps) {
  const [worlds, setWorlds] = useState<WorldMeta[]>([]);
  const [name, setName] = useState('新的世界');
  const [seed, setSeed] = useState(randomSeed);
  const [mode, setMode] = useState<GameMode>(GameMode.SURVIVAL);
  const [difficulty, setDifficulty] = useState<Difficulty>(Difficulty.NORMAL);
  const [worldType, setWorldType] = useState<WorldType>(WorldType.DEFAULT);
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [playerName, setPlayerName] = useState('玩家');
  const [showJoinByCode, setShowJoinByCode] = useState(false);
  const [generateStructures, setGenerateStructures] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setWorlds(await saveManager.list());
    } catch (err) {
      setError(`读取存档列表失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }, [saveManager]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreate = (e: FormEvent): void => {
    e.preventDefault();
    const trimmedName = name.trim().slice(0, MAX_WORLD_NAME_LENGTH) || '新的世界';
    const trimmedSeed = (seed.trim() || randomSeed()).slice(0, MAX_SEED_LENGTH);
    const now = Date.now();
    const meta: WorldMeta = {
      id: createWorldId(),
      name: trimmedName,
      seed: trimmedSeed,
      mode,
      difficulty: mode === GameMode.HARDCORE ? Difficulty.HARD : difficulty,
      createdAt: now,
      lastPlayed: now,
      worldType,
      generateStructures,
    };
    onStart(meta, null);
  };

  /** 加入局域网服务端：世界数据全部来自服务端，这里只造一份占位的元数据。 */
  const handleJoin = (e: FormEvent): void => {
    e.preventDefault();
    const url = serverUrl.trim();
    if (!url) {
      setError('请填写服务器地址');
      return;
    }
    const now = Date.now();
    const meta: WorldMeta = {
      id: createWorldId(),
      name: `联机：${url}`,
      seed: 'multiplayer',
      mode: GameMode.SURVIVAL,
      difficulty: Difficulty.NORMAL,
      createdAt: now,
      lastPlayed: now,
      worldType: WorldType.DEFAULT,
      generateStructures: true,
    };
    onStart(meta, null, { url, playerName: playerName.trim() || '玩家' });
  };

  const handleLoad = async (meta: WorldMeta): Promise<void> => {
    setIsBusy(true);
    setError(null);
    try {
      const save = await saveManager.load(meta.id);
      if (!save) {
        setError('存档不存在或已损坏');
        await refresh();
        return;
      }
      onStart(save.meta, save);
    } catch (err) {
      setError(`读取存档失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async (meta: WorldMeta): Promise<void> => {
    if (!window.confirm(`确定删除世界「${meta.name}」？此操作不可恢复。`)) {
      return;
    }
    try {
      await saveManager.remove(meta.id);
      await refresh();
    } catch (err) {
      setError(`删除失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  if (showSettings) {
    return <SettingsPanel onClose={() => setShowSettings(false)} />;
  }
  if (showJoinByCode) {
    return <JoinByCodePanel onConnected={onJoinByCode} onBack={() => setShowJoinByCode(false)} />;
  }

  return (
    <div className="main-menu">
      <div className="menu-title">
        <h1>Web Minecraft</h1>
        <p className="muted">React + Three.js · 参考 1.8.9</p>
        <button className="menu-button" onClick={() => setShowSettings(true)}>
          设置
        </button>
      </div>
      <div className="menu-columns">
        <form className="panel menu-panel" onSubmit={handleCreate}>
          <h2>新建世界</h2>
          <label>
            世界名称
            <input value={name} maxLength={MAX_WORLD_NAME_LENGTH} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            种子
            <div className="seed-row">
              <input value={seed} maxLength={MAX_SEED_LENGTH} onChange={(e) => setSeed(e.target.value)} />
              <button type="button" onClick={() => setSeed(randomSeed())}>
                随机
              </button>
            </div>
          </label>
          <div className="mode-grid">
            {MODE_ORDER.map((m) => (
              <button
                type="button"
                key={m}
                className={`mode-card${mode === m ? ' active' : ''}`}
                onClick={() => setMode(m)}
              >
                <strong>{GAME_MODE_LABELS[m]}</strong>
                <span>{MODE_DESCRIPTIONS[m]}</span>
              </button>
            ))}
          </div>
          <label>
            世界类型
            <select value={worldType} onChange={(e) => setWorldType(e.target.value as WorldType)}>
              {WORLD_TYPE_ORDER.map((t) => (
                <option key={t} value={t}>
                  {WORLD_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={generateStructures}
              onChange={(e) => setGenerateStructures(e.target.checked)}
            />
            生成结构（村庄）
          </label>
          <label>
            难度
            <select
              value={mode === GameMode.HARDCORE ? Difficulty.HARD : difficulty}
              disabled={mode === GameMode.HARDCORE || mode === GameMode.CREATIVE}
              onChange={(e) => setDifficulty(Number(e.target.value) as Difficulty)}
            >
              {DIFFICULTY_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="menu-button primary" disabled={isBusy}>
            创建并进入世界
          </button>
        </form>
        <form className="panel menu-panel" onSubmit={handleJoin}>
          <h2>多人游戏</h2>
          <p className="muted">在另一台机器上跑 npm run server，把它打印的地址填在这里。</p>
          <label>
            服务器地址
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="ws://192.168.1.10:8080"
            />
          </label>
          <label>
            玩家名
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              maxLength={16}
            />
          </label>
          <button type="submit" className="menu-button primary" disabled={isBusy}>
            加入服务器
          </button>
          <p className="muted">朋友用浏览器开的房间，则用房间码加入：</p>
          <button type="button" className="menu-button" onClick={() => setShowJoinByCode(true)}>
            用房间码加入
          </button>
        </form>
        <div className="panel menu-panel">
          <h2>读取存档</h2>
          {error && <p className="error">{error}</p>}
          {worlds.length === 0 && <p className="muted">还没有存档。</p>}
          <ul className="world-list">
            {worlds.map((w) => (
              <li key={w.id} className="world-item">
                <div className="world-info">
                  <strong>{w.name}</strong>
                  <span className="muted">
                    {GAME_MODE_LABELS[w.mode]} · {WORLD_TYPE_LABELS[w.worldType ?? WorldType.DEFAULT]} · 种子 {w.seed}
                  </span>
                  <span className="muted">最近游玩 {formatDate(w.lastPlayed)}</span>
                </div>
                <div className="world-actions">
                  <button onClick={() => void handleLoad(w)} disabled={isBusy}>
                    进入
                  </button>
                  <button className="danger" onClick={() => void handleDelete(w)} disabled={isBusy}>
                    删除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
