import { defineNuxtPlugin, useRuntimeConfig } from 'nuxt/app';

import { useToast } from '#imports';

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();
  const router = useRouter();
  const api = $fetch.create({
    baseURL: (config.public as any).apiBase || '',
    credentials: 'include',

    onRequest({ options }) {},

    onResponse({ response }) {
      const d = response._data;
      // Сервер теперь нормализует ошибки, так что успешные ответы просто отдаём дальше
      return d;
    },

    async onResponseError({ response }) {
      const payload = response?._data as any;
      const message =
        (payload && (payload.message || payload.error)) ||
        `${response?.status} ${response?.statusText || 'Request Error'}`;

      // Авто‑тост ошибок
      useToast('Ошибка запроса', String(message), 'error');

      if (response?.status === 401) {
        router.push('/auth');
      }
    },
  });
  return { provide: { api } };
});
