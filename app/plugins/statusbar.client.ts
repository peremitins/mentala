import { defineNuxtPlugin } from 'nuxt/app';
import { Capacitor } from '@capacitor/core';

/**
 * Плагин для инициализации внешнего вида StatusBar на мобильных устройствах.
 *
 * Важно:
 * - На Android 15+ / 16+ edge-to-edge фактически принудительный, поэтому нельзя
 *   полагаться на overlaysWebView=false и тем более на фиксированную высоту status bar.
 * - Insets для контента берём из CSS env(safe-area-inset-*), чтобы они были
 *   реальными для конкретного устройства, эмулятора и режима системных баров.
 * - На iOS явно оставляем overlay=true, чтобы WebView корректно отдавал safe area.
 */
export default defineNuxtPlugin(async () => {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    const platform = Capacitor.getPlatform();

    await StatusBar.setStyle({
      style: Style.Dark,
    });

    if (platform === 'ios') {
      await StatusBar.setOverlaysWebView({ overlay: true });
    }
  } catch (error) {
    console.warn('[StatusBar] Failed to initialize:', error);
  }
});
