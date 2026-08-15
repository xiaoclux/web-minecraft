import { useCallback, useMemo, useState } from 'react';
import { SaveManager, type WorldMeta, type WorldSave } from './engine/save/SaveManager';
import { GameView } from './ui/GameView';
import { MainMenu } from './ui/MainMenu';
import { OrientationGate } from './ui/OrientationGate';

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
  return (
    <OrientationGate>
      {session ? (
        <GameView
          key={session.meta.id}
          meta={session.meta}
          save={session.save}
          saveManager={saveManager}
          onExit={handleExit}
        />
      ) : (
        <MainMenu saveManager={saveManager} onStart={handleStart} />
      )}
    </OrientationGate>
  );
}
