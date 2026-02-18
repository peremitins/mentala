/**
 * Аналитика лендинга v1: Яндекс.Метрика.
 * События по ТЗ: landing_view, landing_cta_click, landing_modal_open,
 * landing_lead_submit_*, landing_scroll_depth_*, landing_auth_redirect_click.
 */
declare global {
  interface Window {
    ym?: ((counterId: number, action: string, ...args: unknown[]) => void) & {
      a?: unknown[];
      l?: number;
    };
  }
}

function toCounterId(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

export function useLandingAnalytics() {
  const config = useRuntimeConfig();
  const counterId = toCounterId(config.public.yandexMetrikaId);

  function reachGoal(eventName: string, params?: Record<string, unknown>) {
    if (typeof window === 'undefined' || !window.ym || !Number.isFinite(counterId)) {
      return;
    }
    try {
      if (params && Object.keys(params).length > 0) {
        window.ym(counterId, 'reachGoal', eventName, params);
      } else {
        window.ym(counterId, 'reachGoal', eventName);
      }
    } catch {
      // Игнорируем ошибки метрики (блокировщики рекламы и т.п.)
    }
  }

  /**
   * Подписывается на скролл и один раз отправляет landing_scroll_depth_25/50/75/100.
   */
  function trackScrollDepth() {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }
    const sent = { 25: false, 50: false, 75: false, 100: false };
    const thresholds = [25, 50, 75, 100] as const;

    function check() {
      const doc = document.documentElement;
      const scrollTop = window.scrollY || doc.scrollTop;
      const scrollHeight = (doc.scrollHeight - window.innerHeight) || 1;
      const percent = Math.round((scrollTop / scrollHeight) * 100);

      for (const t of thresholds) {
        if (percent >= t && !sent[t]) {
          sent[t] = true;
          reachGoal(`landing_scroll_depth_${t}`);
        }
      }
    }

    window.addEventListener('scroll', check, { passive: true });
    check(); // на случай если уже проскроллено
  }

  return { reachGoal, trackScrollDepth, hasMetrika: Number.isFinite(counterId) };
}
