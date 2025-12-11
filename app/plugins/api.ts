import { defineNuxtPlugin, useRuntimeConfig } from 'nuxt/app';
import { Capacitor } from '@capacitor/core';

import { useToast } from '#imports';

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

        if (token) {
          if (headers instanceof Headers) {
            headers.set('X-Session-Token', token);
            headers.set('X-Timezone', timezone);
            headers.set('Content-Type', 'application/json');
          } else {
            options.headers = {
              ...((headers as Record<string, string>) || {}),
              'Content-Type': 'application/json',
              'X-Session-Token': token,
              'X-Timezone': timezone,
            } as any;
          }
        } else {
          // Если нет токена, всё равно устанавливаем Content-Type и X-Timezone
          if (headers instanceof Headers) {
            headers.set('Content-Type', 'application/json');
            headers.set('X-Timezone', timezone);
          } else {
            options.headers = {
              ...((headers as Record<string, string>) || {}),
              'Content-Type': 'application/json',
              'X-Timezone': timezone,
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

    async onResponseError({ response, request, error }) {
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
