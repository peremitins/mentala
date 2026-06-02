import { Capacitor } from '@capacitor/core';

export function useHaptics() {
  async function triggerLight(): Promise<void> {
    if (process.server) return;

    const isNative =
      typeof Capacitor.isNativePlatform === 'function'
        ? Capacitor.isNativePlatform()
        : Capacitor.getPlatform() === 'ios' || Capacitor.getPlatform() === 'android';

    if (isNative) {
      try {
        const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
        await Haptics.impact({ style: ImpactStyle.Light });
      } catch {
        // Хаптика необязательна — молча игнорируем ошибки
      }
      return;
    }

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(20);
      } catch {
        // Web vibrate необязателен — молча игнорируем ошибки
      }
    }
  }

  return { triggerLight };
}
