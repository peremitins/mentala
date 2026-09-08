/**
 * Яндекс.Метрика: стандартный сниппет + SPA-трекинг переходов.
 * Скрипт загружается с CDN (jsDelivr) для обхода ERR_SSL_PROTOCOL_ERROR на mc.yandex.ru.
 */
type MetrikaInitOptions = {
  clickmap: boolean;
  trackLinks: boolean;
  accurateTrackBounce: boolean;
  webvisor: boolean;
};

type MetrikaCall =
  | [id: number, command: 'init', options: MetrikaInitOptions]
  | [id: number, command: 'hit', path: string, options: { referer: string }];

type MetrikaFunction = ((...args: MetrikaCall) => void) & {
  a?: MetrikaCall[];
  l?: number;
};

type MetrikaWindow = Window & {
  ym?: MetrikaFunction;
};

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();
  if (config.public.yandexMetrikaDisabled) return;

  const id = Number(String(config.public.yandexMetrikaId || '').trim());
  if (!id || !Number.isFinite(id)) return;

  // Стандартный сниппет: stub-функция ym() буферизует вызовы до загрузки tag.js
  const metrikaWindow = window as MetrikaWindow;
  const metrika =
    metrikaWindow.ym ||
    (function (...args: MetrikaCall) {
      const queuedCalls = (metrika.a ||= []);
      queuedCalls.push(args);
    } as MetrikaFunction);
  metrika.l = Date.now();
  metrikaWindow.ym = metrika;

  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://cdn.jsdelivr.net/npm/yandex-metrica-watch/tag.js';
  document.head.appendChild(script);

  metrika(id, 'init', {
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: true,
  });

  // SPA-навигация: отправлять hit при каждом переходе
  const router = useRouter();
  router.afterEach((to, from) => {
    metrika(id, 'hit', to.fullPath, { referer: from.fullPath });
  });
});
