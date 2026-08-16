import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { SaveManager, type WorldMeta, type WorldSave } from './engine/save/SaveManager';
import { MainMenu } from './ui/MainMenu';
import { OrientationGate } from './ui/OrientationGate';
import { BootScreen } from './ui/BootScreen';
import { loadGameView } from './ui/loadGameView';

const GameView = lazy(loadGameView);

/** 引擎 chunk 加载中的占位（首次进入世界、且预取尚未完成时才会看到）。 */
function GameLoading() {
  return (
    <div className="overlay center">
      <div className="panel">正在加载游戏…</div>
    </div>
  );
}

interface Session {
  meta: WorldMeta;
  save: WorldSave | null;
  /** 联机：要连的服务端地址与玩家名；单机时不填。 */
  server?: { url: string; playerName: string };
}

/** 应用根：启动页 → 主菜单 ↔ 游戏。 */
export function App() {
  const saveManager = useMemo(() => new SaveManager(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [booted, setBooted] = useState(false);
  const handleBooted = useCallback(() => setBooted(true), []);
  const handleExit = useCallback(() => setSession(null), []);
  const handleStart = useCallback(
    (meta: WorldMeta, save: WorldSave | null, server?: { url: string; playerName: string }) =>
      setSession({ meta, save, server }),
    [],
  );
  let content = <BootScreen onReady={handleBooted} />;
  if (booted && session) {
    content = (
      <Suspense fallback={<GameLoading />}>
        <GameView
          key={session.meta.id}
          meta={session.meta}
          save={session.save}
          saveManager={saveManager}
          onExit={handleExit}
          server={session.server}
        />
      </Suspense>
    );
  } else if (booted) {
    content = <MainMenu saveManager={saveManager} onStart={handleStart} />;
  }
  return <OrientationGate>{content}</OrientationGate>;
}
