import { computed } from 'vue';
import { useRequestURL, useRuntimeConfig } from 'nuxt/app';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, '');
}

export function useLandingSiteUrl() {
  const runtimeConfig = useRuntimeConfig();
  const requestUrl = useRequestURL();

  return computed(() => {
    const configuredSiteUrl = String(
      runtimeConfig.public.landingSiteUrl || ''
    ).trim();

    // В local dev и preview не уводим внутренние/seo-ссылки на продовый домен,
    // если публичный origin явно не задан через env.
    if (configuredSiteUrl) {
      return trimTrailingSlash(configuredSiteUrl);
    }

    return trimTrailingSlash(requestUrl.origin);
  });
}
