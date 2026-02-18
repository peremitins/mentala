/**
 * Подключает счётчик Яндекс.Метрики на лендинге (только клиент).
 * Совместимо с Nuxt 3: загрузка tag.js по src, инициализация в onload.
 * ID принимается как number или string (в payload может прийти число).
 */
declare global {
  interface Window {
    ym?: ((counterId: number, action: string, ...args: unknown[]) => void) & {
      a?: unknown[];
      l?: number;
    };
  }
}

function toCounterId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig();
  const counterId = toCounterId(config.public.yandexMetrikaId);
  if (counterId === null) {
    return;
  }

  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return;
  }

  // Очередь вызовов до загрузки tag.js (официальная рекомендация Яндекса)
  if (!window.ym) {
    const queue: unknown[] = [];
    const q = function (...args: unknown[]) {
      queue.push(args);
    };
    (q as { a?: unknown[]; l?: number }).a = queue;
    (q as { a?: unknown[]; l?: number }).l = 1 * new Date().getTime();
    window.ym = q as Window['ym'];
  }

  const scriptUrl = `https://mc.yandex.ru/metrika/tag.js?id=${counterId}`;

  // Проверяем, не подключён ли уже скрипт
  const existing = document.querySelector(`script[src="${scriptUrl}"]`);
  if (existing) {
    window.ym?.(counterId, 'init', {
      clickmap: true,
      trackLinks: true,
      accurateTrackBounce: true,
      webvisor: true,
      defer: true,
      referrer: document.referrer,
      url: location.href,
    });
    return;
  }

  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.async = true;
  script.src = scriptUrl;
  script.onload = () => {
    window.ym?.(counterId, 'init', {
      clickmap: true,
      trackLinks: true,
      accurateTrackBounce: true,
      webvisor: true,
      defer: true,
      referrer: document.referrer,
      url: location.href,
    });
  };
  const first = document.getElementsByTagName('script')[0];
  if (first?.parentNode) {
    first.parentNode.insertBefore(script, first);
  } else {
    document.head.appendChild(script);
  }

  // SPA: хит при смене страницы (у лендинга одна страница, но хук не помешает)
  nuxtApp.hook('page:finish', () => {
    window.ym?.(counterId, 'hit', window.location.href);
  });
});
