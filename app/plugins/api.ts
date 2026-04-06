import { defineNuxtPlugin, useRuntimeConfig } from 'nuxt/app';
import { Capacitor } from '@capacitor/core';
import { getActivePinia } from 'pinia';

import { useToast } from '#imports';
import {
  resolveAppInfo,
  resolveClientPlatformHeader,
  resolveClientTimezone,
  resolveRuntimeApiBaseUrl,
} from '@/app/utils/runtime-api';

/**
 * Получает CSRF токен из cookie (только для web)
 */
function getCSRFToken(): string | null {
  if (typeof document === 'undefined') return null;

  // В Nuxt используем import.meta.env для определения окружения
  // В development всегда используем базовое имя без префикса
  const isProd = import.meta.env?.PROD === true;
  const cookieName = isProd ? '__Host-mentala.csrf' : 'mentala.csrf';

  try {
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const trimmed = cookie.trim();
      if (!trimmed) continue;

      const equalIndex = trimmed.indexOf('=');
      if (equalIndex === -1) continue;

      const name = trimmed.substring(0, equalIndex).trim();
      const value = trimmed.substring(equalIndex + 1).trim();

      if (name === cookieName && value) {
        try {
          return decodeURIComponent(value);
        } catch {
          // Если decodeURIComponent не работает, возвращаем как есть
          return value;
        }
      }
    }
  } catch (error) {
    console.error('[API] Error reading CSRF cookie:', error);
  }

  return null;
}

/**
 * Безопасно получает loaders store и вызывает hideAllLoaders
 * Используется в обработчиках ошибок $fetch
 */
function resetAllLoaders() {
  try {
    // На сервере не нужно
    if (typeof window === 'undefined') return;

    // Получаем активный экземпляр Pinia
    const pinia = getActivePinia();
    if (!pinia) return;

    // Получаем store instance через _s (stores map), а не только state
    const loadersStore = (pinia as any)._s?.get('loaders');
    if (loadersStore && typeof loadersStore.hideAllLoaders === 'function') {
      loadersStore.hideAllLoaders();
    }
  } catch (e) {
    // Игнорируем ошибки если Pinia еще не инициализирован
    console.warn('[API] Failed to reset loaders:', e);
  }
}

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();
  const router = useRouter();

  const isCapacitor = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();
  const isDev =
    (config.public as any).isDev === true ||
    (!import.meta.env?.PROD && import.meta.env?.MODE !== 'production');
  const appOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const baseURL = resolveRuntimeApiBaseUrl({
    apiBase: (config.public as any).apiBase,
    isDev,
    appOrigin,
    isCapacitor,
    platform,
  });

  const SESSION_TOKEN_KEY = 'mentai.session.token';

  // Версионные заголовки — инициализируются асинхронно при первом запросе
  let appVersion = '';
  let appBuild = '0';
  let appInfoResolved = false;

  const appInfoPromise = resolveAppInfo().then((info) => {
    appVersion = info.version;
    appBuild = info.build;
    appInfoResolved = true;
  });

  const api = $fetch.create({
    baseURL,
    credentials: 'include',

    async onRequest({ request, options }) {
      // Дожидаемся получения версии приложения (кэшируется, повторные вызовы мгновенны)
      if (!appInfoResolved) {
        await appInfoPromise;
      }

      if (typeof window !== 'undefined') {
        const token = localStorage.getItem(SESSION_TOKEN_KEY);

        // Определяем системный timezone устройства (не зависит от VPN/IP)
        // Используем Intl API для получения IANA timezone (например, 'Europe/Moscow')
        // Поддерживается на всех современных платформах:
        // - iOS Safari 10+ (2016)
        // - Android Chrome/WebView (современные версии)
        // - Все современные браузеры (Desktop и Mobile)
        const timezone = resolveClientTimezone();

        const headers = options.headers as
          | Record<string, string>
          | Headers
          | undefined;

        // Определяем платформу для передачи на сервер
        const platformHeader = resolveClientPlatformHeader(platform);

        // Получаем CSRF токен для state-changing операций.
        // На Capacitor основной механизм — X-Session-Token из localStorage,
        // но CSRF нужен как fallback если localStorage-токен отсутствует.
        const method = options.method?.toUpperCase() || 'GET';
        const isStateChanging = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(
          method
        );
        const csrfToken = isStateChanging ? getCSRFToken() : null;

        // Отладочное логирование для CSRF токена (только в development)
        const isDev =
          !import.meta.env?.PROD && import.meta.env?.MODE !== 'production';
        if (!isCapacitor && isStateChanging && !csrfToken && isDev) {
          const isProdForLog =
            import.meta.env?.PROD || import.meta.env?.MODE === 'production';
          console.warn(
            '[API] CSRF token not found for state-changing request:',
            {
              method,
              url: typeof request === 'string' ? request : String(request),
              cookieName: isProdForLog ? '__Host-mentala.csrf' : 'mentala.csrf',
              allCookies:
                typeof document !== 'undefined' ? document.cookie : 'N/A',
            }
          );
        }

        // Диагностика: на Capacitor при отсутствии localStorage-токена логируем для отладки
        if (isCapacitor && isStateChanging && !token && isDev) {
          console.warn(
            '[API] Capacitor: X-Session-Token отсутствует в localStorage, fallback на CSRF cookie',
            {
              method,
              url: typeof request === 'string' ? request : String(request),
              hasCsrfToken: !!csrfToken,
              platform: platformHeader,
            }
          );
        }

        // Отправляем X-Session-Token ТОЛЬКО для Capacitor
        // Для web полагаемся только на cookie (credentials: 'include')
        if (isCapacitor) {
          if (headers instanceof Headers) {
            if (token) headers.set('X-Session-Token', token);
            headers.set('X-Timezone', timezone);
            headers.set('X-Platform', platformHeader);
            headers.set('X-App-Version', appVersion);
            headers.set('X-App-Build', appBuild);
            headers.set('Content-Type', 'application/json');
            // Fallback: если localStorage-токен отсутствует (пересборка, очистка данных),
            // но session cookie уцелел — сервер определит канал как cookie и потребует CSRF.
            if (!token && csrfToken) {
              headers.set('X-CSRF-Token', csrfToken);
            }
          } else {
            const headersObj: Record<string, string> = {
              ...((headers as Record<string, string>) || {}),
              'Content-Type': 'application/json',
              'X-Timezone': timezone,
              'X-Platform': platformHeader,
              'X-App-Version': appVersion,
              'X-App-Build': appBuild,
            };
            if (token) headersObj['X-Session-Token'] = token;
            // Fallback: CSRF-токен на случай отсутствия localStorage-сессии (аналогично realtime voice)
            if (!token && csrfToken) {
              headersObj['X-CSRF-Token'] = csrfToken;
            }
            options.headers = headersObj as any;
          }
        } else {
          // Для web: добавляем CSRF токен для state-changing операций
          const headersObj: Record<string, string> = {
            ...((headers as Record<string, string>) || {}),
            'Content-Type': 'application/json',
            'X-Timezone': timezone,
            'X-Platform': platformHeader,
            'X-App-Version': appVersion,
            'X-App-Build': appBuild,
          };
          // Добавляем CSRF токен для state-changing операций (web)
          // ВАЖНО: Если токен отсутствует, запрос будет отклонен CSRF middleware
          // Но мы все равно пытаемся отправить запрос, чтобы получить понятную ошибку
          if (csrfToken) {
            headersObj['X-CSRF-Token'] = csrfToken;
          }
          if (headers instanceof Headers) {
            headers.set('Content-Type', 'application/json');
            headers.set('X-Timezone', timezone);
            headers.set('X-Platform', platformHeader);
            headers.set('X-App-Version', appVersion);
            headers.set('X-App-Build', appBuild);
            if (csrfToken) {
              headers.set('X-CSRF-Token', csrfToken);
            }
          } else {
            options.headers = headersObj as any;
          }
        }
      }

      // Логируем запрос для отладки (только для Capacitor)

      if (isCapacitor) {
        // Логируем запрос для отладки
        // Используем актуальный URL после обработки
        const finalRequestUrl =
          typeof request === 'string' ? request : String(request);
        const fullUrl = options.baseURL
          ? `${options.baseURL}${finalRequestUrl}`
          : finalRequestUrl;

        // Получаем информацию о заголовках для логирования
        const hasToken =
          typeof window !== 'undefined' &&
          !!localStorage.getItem(SESSION_TOKEN_KEY);
        const headersInfo: any = {};
        if (options.headers instanceof Headers) {
          options.headers.forEach((value, key) => {
            headersInfo[key] = value;
          });
        } else if (options.headers) {
          Object.assign(headersInfo, options.headers);
        }

        console.log(
          '[API] Request:',
          JSON.stringify(
            {
              request: finalRequestUrl,
              method: options.method || 'GET',
              baseURL: options.baseURL,
              fullUrl: fullUrl,
              hasToken: hasToken,
              headers: headersInfo,
            },
            null,
            2
          )
        );
      }
    },

    onResponse({ response }) {
      // Токен сессии теперь возвращается в теле ответа для Capacitor
      // и сохраняется в auth store (loginEmail/registerEmail), поэтому здесь ничего не делаем
      const d = response._data;
      // Сервер теперь нормализует ошибки, так что успешные ответы просто отдаём дальше
      return d;
    },

    onRequestError({ error }) {
      // Обрабатываем canceled запросы (AbortError)
      if (
        error?.name === 'AbortError' ||
        error?.message?.includes('aborted') ||
        error?.message?.includes('canceled')
      ) {
        // Сбрасываем все активные лоудеры при отмене запроса
        resetAllLoaders();
      }
      // Пробрасываем ошибку дальше
      throw error;
    },

    async onResponseError({ response, request, options, error }) {
      // Проверяем, не является ли это canceled запросом
      const isCanceled =
        error?.name === 'AbortError' ||
        error?.message?.includes('aborted') ||
        error?.message?.includes('canceled') ||
        (request instanceof Request && request.signal?.aborted);

      // Сбрасываем все активные лоудеры при ошибке (включая canceled)
      resetAllLoaders();

      // Для canceled запросов не показываем тост и не обрабатываем дальше
      if (isCanceled) {
        return;
      }

      // Детальное логирование ошибок в Capacitor
      if (isCapacitor) {
        console.error('[API] Error:', {
          url: request,
          status: response?.status,
          statusText: response?.statusText,
          error: error?.message,
          responseData: response?._data,
        });
      }

      const payload = response?._data as any;
      const message =
        (payload && (payload.message || payload.error)) ||
        error?.message ||
        `${response?.status || 'Network'} ${response?.statusText || 'Request Error'}`;

      // Авто‑тост ошибок
      if ((options as any)?.suppressErrorToast !== true) {
        useToast('Ошибка запроса', String(message), 'error');
      }

      if (response?.status === 401) {
        // Очищаем токен при 401 ошибке (неавторизован)
        if (isCapacitor && typeof window !== 'undefined') {
          localStorage.removeItem(SESSION_TOKEN_KEY);
        }
        // Не редиректим на /auth для публичных маршрутов
        const currentPath = router.currentRoute.value?.path || '';
        const publicRoutes = [
          '/auth',
          '/auth/link',
          '/forgot',
          '/reset-password',
        ];
        if (
          !publicRoutes.includes(currentPath) &&
          !currentPath.startsWith('/auth/link')
        ) {
          router.push('/auth');
        }
      }
    },
  });
  return { provide: { api } };
});
