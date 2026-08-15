import { useSyncExternalStore } from 'react';
import type { Store } from '../engine/events/Store';

/** 订阅引擎 Store 的快照。 */
export function useStore<T extends object>(store: Store<T>): T {
  return useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.get(),
    () => store.get(),
  );
}
