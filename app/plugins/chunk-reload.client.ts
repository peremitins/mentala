import { defineNuxtPlugin } from 'nuxt/app';
import { Capacitor } from '@capacitor/core';

/**
 * Восстановление после деплоя ("version skew").
 *
 * После выката новой web-версии docker-контейнер пересоздаётся и старые
 * хешированные чанки `/_nuxt/*.js` исчезают. Уже открытая вкладка
 * (особенно мобильный web) при ленивой загрузке догружаемых по требованию
 * модулей получает 404 на старый чанк.
 *
 * Навигационные (route) чанки Nuxt 4 перезагружает сам
 * (`emitRouteChunkError: 'automatic'`), но РУЧНЫЕ динамические импорты —
 * `import('howler')` в дыхательных практиках, `import(engine.*)` в
 * speech-движках, нативный аудиосервис медитаций — этим не покрываются.
 * Именно поэтому после деплоя ломается в первую очередь озвучка.
 *
 * Vite на любую неудачу прелоада динамического импорта кидает событие
 * `vite:preloadError` на window. Ловим его и делаем однократную
 * перезагрузку — браузер подтянет свежий index.html (он отдаётся
 * с `Cache-Control: no-cache`, см. server/plugins/html-cache-control.ts)
 * и новые чанки.
 */
export default defineNuxtPlugin((nuxtApp) => {
  if (import.meta.server || typeof window === 'undefined') return;

  // В нативных сборках (iOS/Android) чанки зашиты в бандл приложения,
  // version skew там невозможен — перезагрузка WebView не нужна.
  try {
    if (Capacitor.isNativePlatform()) return;
  } catch {
    // Capacitor может быть недоступен — продолжаем как web.
  }

  const RELOAD_GUARD_KEY = 'mentala.chunkReloadAt';
  // Не перезагружаемся чаще раза в минуту — защита от петли,
  // если свежий index.html по какой-то причине так и не подтянулся.
  const RELOAD_COOLDOWN_MS = 60_000;

  function reloadOnce() {
    try {
      const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
      if (Number.isFinite(last) && Date.now() - last < RELOAD_COOLDOWN_MS) {
        return;
      }
      sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
    } catch {
      // sessionStorage может быть недоступен (приватный режим и т.п.) —
      // тогда просто перезагружаемся без guard.
    }
    window.location.reload();
  }

  // Основной канал: ошибки прелоада динамических импортов Vite
  // (покрывает в т.ч. ручные import('howler') / import(engine.*)).
  window.addEventListener('vite:preloadError', (event) => {
    // Гасим необработанный reject, чтобы не засорять Sentry/консоль.
    event.preventDefault();
    reloadOnce();
  });

  // Подстраховка на уровне Nuxt (route-чанки и пр.).
  nuxtApp.hook('app:chunkError', () => {
    reloadOnce();
  });
});
