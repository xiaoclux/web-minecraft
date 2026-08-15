import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import './styles/game.css';

window.addEventListener('unhandledrejection', (event) => {
  console.error('未处理的 Promise 异常', event.reason);
});

const container = document.getElementById('root');
if (!container) {
  throw new Error('找不到 #root 挂载点');
}
createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
