import { computed, type ComputedRef } from 'vue';

// Singleton для кэширования computed ref
let cachedComputed: ComputedRef<boolean> | null = null;

/**
 * Определяет, находимся ли мы в режиме разработки.
 * Использует переменную окружения NUXT_PUBLIC_IS_DEV с fallback на NODE_ENV.
 *
 * @returns Computed ref с булевым значением (всегда определен)
 *
 * @example
 * // В компоненте (без импорта благодаря Nuxt auto-imports!)
 * const isDev = useIsDev();
 * if (isDev.value) {
 *   // показываем dev-функционал
 * }
 */
export function useIsDev(): ComputedRef<boolean> {
  // Если уже создан computed - возвращаем его (singleton pattern)
  if (cachedComputed) {
    return cachedComputed;
  }

  const config = useRuntimeConfig();

  cachedComputed = computed<boolean>(() => {
    // Приоритет: переменная окружения NUXT_PUBLIC_IS_DEV
    if (config.public.isDev !== undefined) {
      return config.public.isDev;
    }

    // Fallback: проверка через import.meta.dev или NODE_ENV
    if (import.meta.dev) return true;
    return process.env.NODE_ENV !== 'production';
  });

  return cachedComputed;
}
