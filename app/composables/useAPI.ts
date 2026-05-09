import type { UseFetchOptions } from 'nuxt/app';

/**
 * Композабл для API запросов
 * X-Platform заголовок добавляется автоматически в app/plugins/api.ts
 */
export function useAPI<T = unknown>(
  url: string | (() => string),
  options: UseFetchOptions<T> & {
    useFetch?: boolean;
    suppressErrorToast?: boolean;
    suppressAuthRedirect?: boolean;
  } = {}
) {
  const nuxtApp = useNuxtApp();
  const method = (options.method || 'GET').toString().toUpperCase();
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

  // единственный наш флаг
  const shouldUseFetch = options.useFetch === true && !isMutation;

  if (shouldUseFetch) {
    // Никаких getCachedData/default принудительно не задаём —
    // чтобы не ломать типы. Ключ можно передать снаружи.
    return useFetch(url, {
      $fetch: nuxtApp.$api as typeof $fetch,
      server: true,
      immediate: true,
      // X-Platform добавляется автоматически в app/plugins/api.ts
      ...options,
    }) as any;
  }

  // Ветка реального вызова ($api)
  // X-Platform добавляется автоматически в app/plugins/api.ts
  const resolved = typeof url === 'function' ? url() : url;

  return nuxtApp.$api<T>(resolved, options as any);
}
