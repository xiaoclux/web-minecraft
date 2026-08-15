import { useEffect, useState } from 'react';
import { BOOT_ENGINE_TIMEOUT_MS, BOOT_MIN_DURATION_MS } from '../engine/constants/ui';
import { loadGameView } from './loadGameView';

interface BootScreenProps {
  onReady: () => void;
}

/** 启动步骤：标签 + 实际等待的 Promise 工厂。 */
interface BootStep {
  label: string;
  run: () => Promise<unknown>;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
    );
  });
}

const BOOT_STEPS: BootStep[] = [
  {
    // React 能渲染本组件即代表界面脚本已就绪：立即完成，让进度条在引擎下载期间不停在 0%
    label: '加载界面',
    run: () => Promise.resolve(),
  },
  {
    label: '加载游戏引擎',
    // 失败或超时不阻塞进入主菜单：进入世界时 lazy 会重新拉取，出错交给 ErrorBoundary
    run: () => withTimeout(loadGameView(), BOOT_ENGINE_TIMEOUT_MS),
  },
  {
    label: '准备界面字体',
    run: () => (typeof document !== 'undefined' && document.fonts ? document.fonts.ready : Promise.resolve()),
  },
];

/**
 * 启动 loading 页：真实等待引擎 chunk 与字体就绪，进度按步骤推进。
 * 完成后进入主菜单，之后进入世界不再需要任何网络加载。
 */
export function BootScreen({ onReady }: BootScreenProps) {
  const [done, setDone] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const startedAt = performance.now();
    const run = async (): Promise<void> => {
      for (let i = 0; i < BOOT_STEPS.length; i++) {
        await BOOT_STEPS[i].run();
        if (cancelled) {
          return;
        }
        setDone(i + 1);
      }
      const remaining = BOOT_MIN_DURATION_MS - (performance.now() - startedAt);
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }
      if (!cancelled) {
        onReady();
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [onReady]);

  const percent = Math.round((done / BOOT_STEPS.length) * 100);
  const label = done < BOOT_STEPS.length ? `${BOOT_STEPS[done].label}…` : '即将进入';
  return (
    <div className="boot-screen" role="status" aria-live="polite">
      <h1 className="boot-title">Web Minecraft</h1>
      <div className="boot-bar" aria-hidden="true">
        <div className="boot-bar-fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="boot-label">{label}</div>
    </div>
  );
}
