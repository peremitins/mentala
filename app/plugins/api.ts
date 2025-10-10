import { defineNuxtPlugin, useRuntimeConfig } from 'nuxt/app';

import { useToast } from '#imports';

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();
  const router = useRouter();
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

      if (response?.status === 401) {
        router.push('/auth');
      }
    },
  });
  return { provide: { api } };
});
