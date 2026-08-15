/**
 * 极简外部状态容器，配合 React useSyncExternalStore 使用。
 * 引擎侧调用 set/patch，UI 侧订阅快照。
 */
export class Store<T extends object> {
  private state: T;
  private listeners = new Set<() => void>();

  constructor(initial: T) {
    this.state = initial;
  }

  /** 当前快照（不可变引用）。 */
  get(): T {
    return this.state;
  }

  /** 部分更新（浅合并，若无变化则不通知）。 */
  patch(partial: Partial<T>): void {
    let changed = false;
    for (const key of Object.keys(partial) as (keyof T)[]) {
      if (this.state[key] !== partial[key]) {
        changed = true;
        break;
      }
    }
    if (!changed) {
      return;
    }
    this.state = { ...this.state, ...partial };
    this.emit();
  }

  /** 强制通知（用于引用未变但内容变化的场景，如背包）。 */
  bump(): void {
    this.state = { ...this.state };
    this.emit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of this.listeners) {
      l();
    }
  }
}
