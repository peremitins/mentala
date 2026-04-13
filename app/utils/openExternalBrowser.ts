import { Capacitor } from '@capacitor/core';
import {
  DefaultSystemBrowserOptions,
  DismissStyle,
  InAppBrowser,
} from '@capacitor/inappbrowser';

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
    // На iOS откроется SFSafariViewController с системной кнопкой "Готово",
    // на Android — Custom Tabs с системной навигацией "назад".
    await InAppBrowser.openInSystemBrowser({
      url: resolvedUrl,
      options: {
        ...DefaultSystemBrowserOptions,
        iOS: {
          ...DefaultSystemBrowserOptions.iOS,
          closeButtonText: DismissStyle.DONE,
          enableBarsCollapsing: true,
        },
        android: {
          ...DefaultSystemBrowserOptions.android,
          showTitle: true,
          hideToolbarOnScroll: true,
        },
      },
    });
  } catch (error) {
    // На случай, если плагин не подключен в текущей сборке.
    console.warn(
      '[openExternalBrowser] Failed to open external browser via InAppBrowser:',
      error
    );
    // Фоллбек внутри WebView приложения.
    window.location.href = resolvedUrl;
  }
}

