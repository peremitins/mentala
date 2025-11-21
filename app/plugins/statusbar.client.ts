import { defineNuxtPlugin } from 'nuxt/app';
import { Capacitor } from '@capacitor/core';

/**
 * Плагин для инициализации StatusBar на мобильных устройствах
 * Обеспечивает правильное отображение приложения с учетом safe area insets
 *
 * ПРОФЕССИОНАЛЬНОЕ РЕШЕНИЕ:
 * - На Android: overlay: false (статус-бар НЕ накладывается), затем получаем высоту и добавляем padding
 * - На iOS: используем safe-area-inset-top через CSS env()
 */
export default defineNuxtPlugin(async () => {
  // Инициализируем только на мобильных платформах
  if (Capacitor.isNativePlatform()) {
    try {
      const { StatusBar, Style } = await import('@capacitor/status-bar');
      const platform = Capacitor.getPlatform();

      // Настраиваем StatusBar для Android/iOS
      await StatusBar.setStyle({
        style: Style.Dark, // Темный стиль для светлого контента
      });

      if (platform === 'android') {
        // ВАЖНО: На Android НЕ используем overlay, чтобы статус-бар не накладывался на контент
        // Вместо этого получаем высоту статус-бара и добавляем padding-top
        await StatusBar.setOverlaysWebView({ overlay: false });

        // Высота статус-бара на Android:
        // - Стандартная: 24dp (24px на mdpi)
        // - На современных устройствах может быть 24-27px
        // - На устройствах с notch может быть больше
        // Используем типичное значение 24px, которое работает на большинстве устройств
        let statusBarHeight = 24;

        // Пытаемся получить более точное значение через window (если доступно)
        if (typeof window !== 'undefined') {
          try {
            // На некоторых устройствах можно вычислить через разницу высот
            // Но это не всегда точно, поэтому используем стандартное значение
            // Для более точного определения можно использовать плагин @capacitor-community/safe-area
            statusBarHeight = 24; // Стандартная высота статус-бара на Android
          } catch (e) {
            console.warn('[StatusBar] Using default height:', e);
          }
        }

        // Устанавливаем CSS переменную для использования в стилях
        if (typeof document !== 'undefined') {
          document.documentElement.style.setProperty(
            '--status-bar-height',
            `${statusBarHeight}px`
          );
          // Также устанавливаем для safe-area-inset-top (fallback для Android)
          document.documentElement.style.setProperty(
            '--safe-area-inset-top',
            `${statusBarHeight}px`
          );
        }

        console.log(
          '[StatusBar] Android initialized, height:',
          statusBarHeight,
          'px (standard Android status bar height)'
        );
      } else if (platform === 'ios') {
        // На iOS используем overlay для поддержки safe area insets
        await StatusBar.setOverlaysWebView({ overlay: true });
        console.log('[StatusBar] iOS initialized with overlay');
      }
    } catch (error) {
      console.warn('[StatusBar] Failed to initialize:', error);
      // Игнорируем ошибки, если плагин недоступен (например, в браузере)
    }
  }
});
