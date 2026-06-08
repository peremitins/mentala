import { Capacitor } from '@capacitor/core';

type HapticImpactStyle = 'light' | 'medium';
type WebVibratePattern = number | number[];

export function useHaptics() {
  function isNativeHapticsPlatform(): boolean {
    const platform = Capacitor.getPlatform();
    return typeof Capacitor.isNativePlatform === 'function'
      ? Capacitor.isNativePlatform()
      : platform === 'ios' || platform === 'android';
  }

  function triggerWebVibrate(pattern: WebVibratePattern): void {
    if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;

    try {
      navigator.vibrate(pattern);
    } catch {
      // Web vibrate необязателен — молча игнорируем ошибки
    }
  }

  async function triggerImpact(
    style: HapticImpactStyle,
    webPattern: WebVibratePattern
  ): Promise<void> {
    if (process.server) return;

    if (isNativeHapticsPlatform()) {
      try {
        const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
        await Haptics.impact({
          style: style === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light,
        });
      } catch {
        // Хаптика необязательна — молча игнорируем ошибки
      }
      return;
    }

    triggerWebVibrate(webPattern);
  }

  async function triggerNotification(
    webPattern: WebVibratePattern
  ): Promise<void> {
    if (process.server) return;

    if (isNativeHapticsPlatform()) {
      try {
        const { Haptics, NotificationType } = await import(
          '@capacitor/haptics'
        );
        await Haptics.notification({
          type: NotificationType.Success,
        });
      } catch {
        // Хаптика необязательна — молча игнорируем ошибки
      }
      return;
    }

    triggerWebVibrate(webPattern);
  }

  async function triggerLight(): Promise<void> {
    await triggerImpact('light', 20);
  }

  async function triggerMedium(): Promise<void> {
    await triggerImpact('medium', 40);
  }

  async function triggerSuccess(): Promise<void> {
    await triggerNotification([20, 60, 40]);
  }

  async function triggerCelebration(): Promise<void> {
    if (process.server) return;

    if (isNativeHapticsPlatform()) {
      try {
        const { Haptics, ImpactStyle, NotificationType } = await import(
          '@capacitor/haptics'
        );
        await Haptics.notification({ type: NotificationType.Success });

        // Праздничный хвост: success, короткий light, умеренно длинный акцент
        // через vibrate и ещё два impact. Держим 120 мс, чтобы ощущалось как
        // «фейерверк», но не превращалось в раздражающий гул.
        setTimeout(() => {
          void Promise.resolve(
            Haptics.impact({ style: ImpactStyle.Light })
          ).catch(() => undefined);
        }, 110);
        setTimeout(() => {
          void Promise.resolve(Haptics.vibrate({ duration: 120 })).catch(
            () => undefined
          );
        }, 210);
        setTimeout(() => {
          void Promise.resolve(
            Haptics.impact({ style: ImpactStyle.Medium })
          ).catch(() => undefined);
        }, 340);
        setTimeout(() => {
          void Promise.resolve(
            Haptics.impact({ style: ImpactStyle.Light })
          ).catch(() => undefined);
        }, 490);
        return;
      } catch {
        // Если native haptics недоступен, ниже сработает web fallback.
      }
    }

    triggerWebVibrate([28, 35, 18, 40, 120, 45, 42, 40, 18]);
  }

  return { triggerLight, triggerMedium, triggerSuccess, triggerCelebration };
}
