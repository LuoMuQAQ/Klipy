import React from 'react';
import ReactDOM from 'react-dom/client';
import { HeroUIProvider, ToastProvider } from '@heroui/react';
import App from './App';
import './fonts/misans/MiSansVF.min.css';
import './index.css';

window.addEventListener('error', (e) => {
  if (e.message && e.message.includes('ResizeObserver')) return;
  console.error('[Window Error]', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[Unhandled Rejection]', e.reason);
});

const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <HeroUIProvider>
        <ToastProvider placement="bottom-center" toastOffset={16} />
        <main className="light text-foreground bg-background min-h-screen">
          <App />
        </main>
      </HeroUIProvider>
    </React.StrictMode>
  );
}
