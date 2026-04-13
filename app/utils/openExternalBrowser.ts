import { Capacitor } from '@capacitor/core';

export async function openExternalBrowser(url: string) {
  if (typeof window === 'undefined') return;

  const resolvedUrl = String(url || '').trim();
  if (!resolvedUrl) return;

  if (!Capacitor.isNativePlatform()) {
    // В web — обычный переход/новая вкладка.
    if (typeof window.open === 'function') {
      window.open(resolvedUrl, '_blank', 'noopener,noreferrer');
      return;
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
    if (typeof window.open === 'function') {
      window.open(resolvedUrl, '_blank', 'noopener,noreferrer');
    }
  }
}

