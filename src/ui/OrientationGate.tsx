import type { ReactNode } from 'react';
import { PORTRAIT_MEDIA_QUERY, TOUCH_MEDIA_QUERY } from '../engine/constants/ui';
import { useMediaQuery } from './useMediaQuery';

/** 触屏设备竖屏时先提示旋转，横屏后再展示页面。 */
export function OrientationGate({ children }: { children: ReactNode }) {
  const isTouch = useMediaQuery(TOUCH_MEDIA_QUERY);
  const isPortrait = useMediaQuery(PORTRAIT_MEDIA_QUERY);
  if (!isTouch || !isPortrait) {
    return <>{children}</>;
  }
  return (
    <div className="orientation-gate">
      <div className="orientation-phone" aria-hidden="true" />
      <h2>请横屏游玩</h2>
      <p className="muted">把手机横过来即可进入 Web Minecraft。</p>
    </div>
  );
}
