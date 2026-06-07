import { computed } from 'vue';
import { useRequestURL, useRuntimeConfig } from 'nuxt/app';

// При локальной разработке лендинга CTA должны вести на локальное приложение,
// а не на прод. Прод и собранные dev/staging оставляем на основном домене.
const LOCAL_APP_AUTH_URL = 'https://local.mentala.app/auth';

function isLocalOrigin(value: string): boolean {
  return /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?$/i.test(value);
}

/**
 * Базовый auth-URL приложения для CTA лендинга.
 *
 * Локальный `nuxt dev` лендинга (origin = localhost) ведёт на
 * `https://local.mentala.app/auth`, чтобы проверять редирект на локальную сборку.
 * Во всех остальных случаях (dev/staging/prod деплой) используем настроенный
 * `appAuthUrl` (по умолчанию боевой `https://my.mentala.app/auth`).
 */
export function useLandingAppAuthUrl() {
  const runtimeConfig = useRuntimeConfig();
  const requestUrl = useRequestURL();

  return computed(() => {
    const configured = String(
      runtimeConfig.public.appAuthUrl || 'https://my.mentala.app/auth'
    );

    if (import.meta.dev && isLocalOrigin(requestUrl.origin)) {
      return LOCAL_APP_AUTH_URL;
    }

    return configured;
  });
}
