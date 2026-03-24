/**
 * Яндекс.Метрика: стандартный сниппет + SPA-трекинг переходов.
 * Скрипт загружается с CDN (jsDelivr) для обхода ERR_SSL_PROTOCOL_ERROR на mc.yandex.ru.
 */
export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();
  if (config.public.yandexMetrikaDisabled) return;

  const id = Number(String(config.public.yandexMetrikaId || '').trim());
  if (!id || !Number.isFinite(id)) return;

  // Стандартный сниппет: stub-функция ym() буферизует вызовы до загрузки tag.js
  const w = window as any;
  w.ym =
    w.ym ||
    function (...args: any[]) {
      (w.ym.a = w.ym.a || []).push(args);
    };
  w.ym.l = Date.now();

  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://cdn.jsdelivr.net/npm/yandex-metrica-watch/tag.js';
  document.head.appendChild(script);

  w.ym(id, 'init', {
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: true,
  });

  // SPA-навигация: отправлять hit при каждом переходе
  const router = useRouter();
  router.afterEach((to, from) => {
    w.ym(id, 'hit', to.fullPath, { referer: from.fullPath });
  });
});
