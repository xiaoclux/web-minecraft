import { useCallback, useSyncExternalStore } from 'react';

/** 订阅 CSS 媒体查询的匹配状态（SSR / 无 matchMedia 时返回 false）。 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (typeof window === 'undefined') {
        return () => {};
      }
      const mql = window.matchMedia(query);
      mql.addEventListener('change', listener);
      return () => mql.removeEventListener('change', listener);
    },
    [query],
  );
  const getSnapshot = useCallback(
    () => (typeof window === 'undefined' ? false : window.matchMedia(query).matches),
    [query],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
