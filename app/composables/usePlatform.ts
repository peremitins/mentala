/**
 * Composable для определения платформы (web/ios/android)
 * Использует Capacitor для точного определения платформы
 */
import { ref, readonly } from 'vue';
import { Capacitor } from '@capacitor/core';

export type Platform = 'web' | 'ios' | 'android';

/**
 * Определяет текущую платформу
 */
export function usePlatform() {
  const getPlatform = (): Platform => {
    if (process.server) {
      // На сервере всегда web
      return 'web';
    }

    const platform = Capacitor.getPlatform();

    if (platform === 'ios') return 'ios';
    if (platform === 'android') return 'android';

    // Для web и других платформ
    return 'web';
  };

  const platform = ref<Platform>(getPlatform());

  return {
    platform: readonly(platform),
    getPlatform,
  };
}
