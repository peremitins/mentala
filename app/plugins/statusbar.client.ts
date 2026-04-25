import { defineNuxtPlugin } from 'nuxt/app';
import { Capacitor } from '@capacitor/core';

/**
 * Плагин для инициализации внешнего вида StatusBar на мобильных устройствах.
 *
 * Важно:
 * - На Android 15+ / 16+ edge-to-edge фактически принудительный, поэтому нельзя
 *   полагаться на overlaysWebView=false и тем более на фиксированную высоту status bar.
 * - Insets для контента берём из CSS env(safe-area-inset-*) и Android WindowInsets bridge,
 *   чтобы они были реальными для конкретного устройства, эмулятора и режима системных баров.
 * - На iOS overlay/layout настраивается ранним native-кодом в MainViewController,
 *   чтобы не вызывать поздний JS-пересчёт геометрии и не ломать Android config.
 */
export default defineNuxtPlugin(async () => {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');

    await StatusBar.setStyle({
      style: Style.Dark,
    });
  } catch (error) {
    console.warn('[StatusBar] Failed to initialize:', error);
  }
});
