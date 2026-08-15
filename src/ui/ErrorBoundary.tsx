import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  message: string | null;
}

/** 顶层错误边界：把崩溃转为可读提示。 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { message: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('渲染错误', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.message) {
      return (
        <div className="overlay center">
          <div className="panel menu-panel">
            <h2>发生错误</h2>
            <p>{this.state.message}</p>
            <button className="menu-button" onClick={() => window.location.reload()}>
              重新加载
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
