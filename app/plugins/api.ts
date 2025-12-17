import { defineNuxtPlugin, useRuntimeConfig } from 'nuxt/app';
import { Capacitor } from '@capacitor/core';
import { getActivePinia } from 'pinia';

import { useToast } from '#imports';

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

  // apiBase: пустой для Web и Capacitor dev, полный URL для Capacitor prod
  const baseURL = (config.public as any).apiBase || '';

  const SESSION_TOKEN_KEY = 'mentai.session.token';

  const api = $fetch.create({
    baseURL,
    credentials: 'include',

    onRequest({ request, options }) {
      // Добавляем токен сессии из localStorage в заголовок

      // Это fallback, если cookies не работают (например, cross-domain или Capacitor)

      if (typeof window !== 'undefined') {
        const token = localStorage.getItem(SESSION_TOKEN_KEY);

        // Определяем системный timezone устройства (не зависит от VPN/IP)
        // Используем Intl API для получения IANA timezone (например, 'Europe/Moscow')
        // Поддерживается на всех современных платформах:
        // - iOS Safari 10+ (2016)
        // - Android Chrome/WebView (современные версии)
        // - Все современные браузеры (Desktop и Mobile)
        let timezone: string;
        try {
          // Проверяем доступность Intl API
          if (
            typeof Intl !== 'undefined' &&
            Intl.DateTimeFormat &&
            typeof Intl.DateTimeFormat === 'function'
          ) {
            const resolved = Intl.DateTimeFormat().resolvedOptions();
            if (resolved.timeZone && typeof resolved.timeZone === 'string') {
              timezone = resolved.timeZone;
            } else {
              throw new Error('timeZone not available in resolvedOptions');
            }
          } else {
            throw new Error('Intl.DateTimeFormat not available');
          }
        } catch (error) {
          // Fallback если Intl API недоступен (очень редко, только на очень старых устройствах)
          console.warn(
            '[API] Failed to get timezone from Intl API, using Europe/Moscow:',
            error
          );
          timezone = 'Europe/Moscow';
        }

        const headers = options.headers as
          | Record<string, string>
          | Headers
          | undefined;

        // Определяем платформу для передачи на сервер
        const platform = Capacitor.getPlatform();
        const platformHeader =
          platform === 'ios'
            ? 'ios'
            : platform === 'android'
              ? 'android'
              : 'web';

        if (token) {
          if (headers instanceof Headers) {
            headers.set('X-Session-Token', token);
            headers.set('X-Timezone', timezone);
            headers.set('X-Platform', platformHeader);
            headers.set('Content-Type', 'application/json');
          } else {
            options.headers = {
              ...((headers as Record<string, string>) || {}),
              'Content-Type': 'application/json',
              'X-Session-Token': token,
              'X-Timezone': timezone,
              'X-Platform': platformHeader,
            } as any;
          }
        } else {
          // Если нет токена, всё равно устанавливаем Content-Type, X-Timezone и X-Platform
          if (headers instanceof Headers) {
            headers.set('Content-Type', 'application/json');
            headers.set('X-Timezone', timezone);
            headers.set('X-Platform', platformHeader);
          } else {
            options.headers = {
              ...((headers as Record<string, string>) || {}),
              'Content-Type': 'application/json',
              'X-Timezone': timezone,
              'X-Platform': platformHeader,
            } as any;
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

    onRequestError({ error, request }) {
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

    async onResponseError({ response, request, error }) {
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
      useToast('Ошибка запроса', String(message));

      if (response?.status === 401) {
        // Очищаем токен при 401 ошибке (неавторизован)
        if (isCapacitor && typeof window !== 'undefined') {
          localStorage.removeItem(SESSION_TOKEN_KEY);
        }
        router.push('/auth');
      }
    },
  });
  return { provide: { api } };
});
