import { Capacitor } from '@capacitor/core';

export function useBreathPracticeHaptics() {
  async function trigger(): Promise<void> {
    if (process.server) return;

    const platform = Capacitor.getPlatform();
    const isNative =
      typeof Capacitor.isNativePlatform === 'function'
        ? Capacitor.isNativePlatform()
        : platform === 'ios' || platform === 'android';

    // На мобильных платформах используем Capacitor Haptics.
    if (isNative) {
      try {
        const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
        await Haptics.impact({ style: ImpactStyle.Medium });
      } catch (error) {
        console.error('[BreathHaptics] Failed to trigger haptics:', error);
      }
      return;
    }

    // На вебе используем vibrate, если доступно.
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(60);
      } catch (error) {
        console.error('[BreathHaptics] Web vibrate failed:', error);
      }
    }
  }

  return {
    trigger,
  };
}
