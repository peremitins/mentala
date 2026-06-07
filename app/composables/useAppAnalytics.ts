type YandexMetrikaFunction = (
  counterId: number,
  method: 'reachGoal',
  goalName: string,
  params?: Record<string, unknown>
) => void;

declare global {
  interface Window {
    ym?: YandexMetrikaFunction;
  }
}

/**
 * Клиентские цели основного приложения для Яндекс.Метрики.
 * Работает только при наличии счётчика и не ломает WebView/блокировщики.
 */
export function useAppAnalytics() {
  const config = useRuntimeConfig();
  const rawId = String(config.public.yandexMetrikaId || '').trim();
  const counterId = Number(rawId);
  const isDisabled = config.public.yandexMetrikaDisabled === true;
  const canTrack = !isDisabled && Number.isFinite(counterId) && counterId > 0;

  function reachGoal(goalName: string, params?: Record<string, unknown>) {
    if (!canTrack || typeof window === 'undefined') {
      return;
    }

    try {
      window.ym?.(counterId, 'reachGoal', goalName, params ?? {});
    } catch {
      // Метрика не должна ломать пользовательский сценарий.
    }
  }

  return { reachGoal, canTrack };
}
