import React from 'react';
import ReactDOM from 'react-dom/client';
import { HeroUIProvider, ToastProvider } from '@heroui/react';
import App from './App';
import { localizeDocument } from './i18n';
import './fonts/misans/MiSansVF.min.css';
import './index.css';

localizeDocument();

window.addEventListener('error', (e) => {
  if (e.message && e.message.includes('ResizeObserver')) return;
  console.error('[Window Error]');
});
window.addEventListener('unhandledrejection', () => {
  console.error('[Unhandled Rejection]');
});

type ToastItemProps = NonNullable<React.ComponentProps<typeof ToastProvider>['toastProps']>;

/**
 * 复制验证码等提示统一成标题栏下方的浮层小卡片：
 * 保留默认图标与 12px 内边距，宽度随文案自适应、最多 300px，水平居中，
 * 不再像默认 Toast 那样用 w-full 左右占满一整行，也不进入标题栏。
 * toastOffset 取标题栏高度（2.75rem ≈ 44.7px）+ 约 7px 间距 = 52，正好贴在标题栏下方。
 */
const compactToastProps: ToastItemProps = {
  hideCloseButton: true,
  variant: 'flat',
  radius: 'lg',
  shadow: 'md',
  classNames: {
    base: 'w-fit max-w-[300px] mx-auto my-0',
    wrapper: 'min-w-0',
    title: 'me-0 text-[13px] leading-5 font-medium',
  },
};

const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <HeroUIProvider>
        <ToastProvider placement="top-center" toastOffset={52} toastProps={compactToastProps} />
        <main className="light text-foreground bg-background min-h-screen">
          <App />
        </main>
      </HeroUIProvider>
    </React.StrictMode>
  );
}
