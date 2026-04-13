import { Capacitor } from '@capacitor/core';

export async function openExternalBrowser(url: string) {
  if (typeof window === 'undefined') return;

  const resolvedUrl = String(url || '').trim();
  if (!resolvedUrl) return;

  if (!Capacitor.isNativePlatform()) {
    // В web — стараемся открыть в новой вкладке, но при блокировке попапов уходим в location.
    if (typeof window.open === 'function') {
      const opened = window.open(resolvedUrl, '_blank', 'noopener,noreferrer');
      if (opened) return;
    }
    window.location.href = resolvedUrl;
    return;
  }

  try {
    const { InAppBrowser } = await import('@capacitor/inappbrowser');
    await InAppBrowser.openInExternalBrowser({ url: resolvedUrl });
  } catch (error) {
    // На случай, если плагин не подключен в текущей сборке.
    console.warn(
      '[openExternalBrowser] Failed to open external browser via InAppBrowser:',
      error
    );
    // `window.open` на iOS часто блокируется (теряется user gesture из-за await import).
    // location.href работает стабильнее.
    window.location.href = resolvedUrl;
  }
}

