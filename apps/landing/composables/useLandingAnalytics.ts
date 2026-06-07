/**
 * Аналитика лендинга: цели и скролл через nuxt-yandex-metrika.
 * События: landing_view, landing_scroll_depth_*,
 * landing_auth_redirect_click, landing_auth_redirect_click_*,
 * landing_assessment_cta_click, landing_assessment_cta_click_*,
 * landing_android_store_click, landing_android_store_click_*.
 */
export function useLandingAnalytics() {
  const metrika = useYandexMetrika();
  const config = useRuntimeConfig();
  const rawId = config.public.yandexMetrikaId;
  const hasMetrika =
    (typeof rawId === 'number' && Number.isFinite(rawId)) ||
    (typeof rawId === 'string' && String(rawId).trim() !== '');

  function reachGoal(eventName: string, params?: Record<string, unknown>) {
    if (!hasMetrika) return;
    try {
      // nuxt-yandex-metrika: reachGoal(name, params?)
      (
        metrika.reachGoal as (
          name: string,
          params?: Record<string, unknown>
        ) => void
      )(eventName, params ?? {});
    } catch {
      // Игнорируем ошибки (блокировщики и т.п.)
    }
  }

  /**
   * Подписывается на скролл и один раз отправляет landing_scroll_depth_25/50/75/100.
   */
  function trackScrollDepth() {
    if (typeof window === 'undefined' || typeof document === 'undefined')
      return;
    const sent = { 25: false, 50: false, 75: false, 100: false };
    const thresholds = [25, 50, 75, 100] as const;

    function check() {
      const doc = document.documentElement;
      const scrollTop = window.scrollY || doc.scrollTop;
      const scrollHeight = doc.scrollHeight - window.innerHeight || 1;
      const percent = Math.round((scrollTop / scrollHeight) * 100);
      for (const t of thresholds) {
        if (percent >= t && !sent[t]) {
          sent[t] = true;
          reachGoal(`landing_scroll_depth_${t}`);
        }
      }
    }

    window.addEventListener('scroll', check, { passive: true });
    check();
  }

  return { reachGoal, trackScrollDepth, hasMetrika: !!hasMetrika };
}
