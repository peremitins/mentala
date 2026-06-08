import { useAPI } from '@/app/composables/useAPI';
import { useAppAnalytics } from '@/app/composables/useAppAnalytics';

/**
 * Промо-paywall привязки карты в триале (контрольные точки 1 / 5 / 10 шага).
 * Логика «показывать ли» живёт на бэке и приходит в ответе завершения шага
 * (ProgramStepCompleteResponseDto.trialUpsell). Здесь — только отметка показа
 * и аналитика.
 */
export function useTrialUpsell() {
  const { reachGoal } = useAppAnalytics();

  /**
   * Отмечает контрольную точку как показанную, чтобы она не повторилась.
   * Fire-and-forget: ошибка сети не должна ломать навигацию пользователя.
   */
  async function markShown(milestone: number): Promise<void> {
    try {
      await useAPI('/api/subscriptions/trial-upsell/mark-shown', {
        method: 'POST',
        body: { milestone },
      });
    } catch (error) {
      console.warn('[TrialUpsell] Failed to mark milestone shown:', error);
    }
  }

  function trackShown(milestone: number) {
    reachGoal('trial_upsell_shown', { milestone });
  }

  function trackCta(milestone: number) {
    reachGoal('trial_upsell_cta', { milestone });
  }

  function trackDismissed(milestone: number) {
    reachGoal('trial_upsell_dismissed', { milestone });
  }

  return {
    markShown,
    trackShown,
    trackCta,
    trackDismissed,
  };
}
