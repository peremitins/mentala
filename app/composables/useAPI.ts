import type { UseFetchOptions } from 'nuxt/app';

export function useAPI<T = unknown>(
  url: string | (() => string),
  options: UseFetchOptions<T> & { useFetch?: boolean } = {}
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
      // если нужен кэш — передайте свой key извне; если не нужен — передавайте
      // уникальный key (например, Symbol()), тогда ре-использования не будет
      ...options,
    }) as any;
  }

  // Ветка реального вызова ($api)
  const resolved = typeof url === 'function' ? url() : url;

  return nuxtApp.$api<T>(resolved, options as any);
}
