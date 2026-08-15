import { useCallback, useSyncExternalStore } from 'react';
import { getMediaQuery } from '../engine/settings/Settings';

/** 订阅 CSS 媒体查询的匹配状态（无 matchMedia 时返回 false）。 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (listener: () => void) => {
      const mql = getMediaQuery(query);
      mql?.addEventListener('change', listener);
      return () => mql?.removeEventListener('change', listener);
    },
    [query],
  );
  const getSnapshot = useCallback(() => getMediaQuery(query)?.matches ?? false, [query]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
