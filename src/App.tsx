import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { SaveManager, type WorldMeta, type WorldSave } from './engine/save/SaveManager';
import { MainMenu } from './ui/MainMenu';
import { OrientationGate } from './ui/OrientationGate';
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
}

/** 应用根：主菜单 ↔ 游戏。 */
export function App() {
  const saveManager = useMemo(() => new SaveManager(), []);
  const [session, setSession] = useState<Session | null>(null);
  const handleExit = useCallback(() => setSession(null), []);
  const handleStart = useCallback((meta: WorldMeta, save: WorldSave | null) => setSession({ meta, save }), []);
  useEffect(() => {
    // 主菜单渲染完成后立刻在后台预取引擎 chunk；失败不处理，真正进入时 lazy 会再拉一次并交给 ErrorBoundary
    void loadGameView().catch(() => undefined);
  }, []);
  return (
    <OrientationGate>
      {session ? (
        <Suspense fallback={<GameLoading />}>
          <GameView
            key={session.meta.id}
            meta={session.meta}
            save={session.save}
            saveManager={saveManager}
            onExit={handleExit}
          />
        </Suspense>
      ) : (
        <MainMenu saveManager={saveManager} onStart={handleStart} />
      )}
    </OrientationGate>
  );
}
