import { Capacitor } from '@capacitor/core';

type RoadmapHapticIntensity =
  | 'tap-locked' // Тап по locked/available — мягкий, без обещания награды.
  | 'tap-completed' // Тап по completed — тихий, replay-доступ.
  | 'tap-active' // Тап по active — основная CTA, средний импакт.
  | 'step-completed' // Шаг завершён — success notification.
  | 'chapter-completed'; // Глава пройдена — двойной success.

/**
 * Тактильная отдача для карты пути.
 *
 * - На iOS/Android — Capacitor Haptics с подобранным style/notification type.
 * - На web — `navigator.vibrate` как graceful fallback (короткий тик).
 * - На SSR / при ошибках — silent no-op.
 *
 * См. `useBreathPracticeHaptics` как референс паттерна.
 */
export function useRoadmapHaptics() {
  async function trigger(intensity: RoadmapHapticIntensity): Promise<void> {
    if (import.meta.server) return;

    const platform = Capacitor.getPlatform();
    const isNative =
      typeof Capacitor.isNativePlatform === 'function'
        ? Capacitor.isNativePlatform()
        : platform === 'ios' || platform === 'android';

    if (isNative) {
      try {
        const { Haptics, ImpactStyle, NotificationType } = await import(
          '@capacitor/haptics'
        );
        switch (intensity) {
          case 'tap-locked':
          case 'tap-completed':
            await Haptics.impact({ style: ImpactStyle.Light });
            return;
          case 'tap-active':
            await Haptics.impact({ style: ImpactStyle.Medium });
            return;
          case 'step-completed':
            await Haptics.notification({ type: NotificationType.Success });
            return;
          case 'chapter-completed':
            // Двойной success: первый тик сразу, второй — через 180ms для
            // ощущения «отметили + ещё что-то открылось».
            await Haptics.notification({ type: NotificationType.Success });
            window.setTimeout(() => {
              void Haptics.impact({ style: ImpactStyle.Medium }).catch(
                () => undefined
              );
            }, 180);
            return;
          default:
            return;
        }
      } catch (error) {
        console.error('[RoadmapHaptics] Failed:', error);
      }
      return;
    }

    // Web fallback: короткий vibrate. Большинство десктопов проигнорирует,
    // мобильный браузер — даст лёгкий тик.
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      const duration = matchWebVibrateDuration(intensity);
      try {
        navigator.vibrate(duration);
      } catch {
        // ignore
      }
    }
  }

  return { trigger };
}

function matchWebVibrateDuration(
  intensity: RoadmapHapticIntensity
): number | number[] {
  switch (intensity) {
    case 'tap-locked':
    case 'tap-completed':
      return 12;
    case 'tap-active':
      return 30;
    case 'step-completed':
      return [20, 60, 40];
    case 'chapter-completed':
      return [30, 80, 30, 80, 60];
    default:
      return 20;
  }
}
