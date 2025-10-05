import {
  defineNuxtPlugin,
  useRuntimeConfig,
  useRequestHeaders,
  useCookie,
  navigateTo,
} from 'nuxt/app';
import type { FetchOptions } from 'ofetch';
// импортируем авто-импортируемый композабл (Nuxt его резолвит из #imports)
import { useToast } from '#imports';

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig();

  const api = $fetch.create({
    baseURL: (config.public as any).apiBase || '',
    credentials: 'include',

    onRequest({ options }) {},

    async onResponseError({ response }) {
      const message =
        (response?._data && (response._data.message || response._data.error)) ||
        `${response?.status} ${response?.statusText || 'Request Error'}`;

      // Авто‑тост ошибок
      useToast('Ошибка запроса', String(message), 'error');

      // Пример реакции на 401
      if (response?.status === 401) {
        await nuxtApp.runWithContext(() => navigateTo('/login'));
      }
    },
  });

  return { provide: { api } };
});
