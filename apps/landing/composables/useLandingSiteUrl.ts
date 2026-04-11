import { computed } from 'vue';
import { useRequestURL, useRuntimeConfig } from 'nuxt/app';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, '');
}

function isLocalOrigin(value: string): boolean {
  return /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?$/i.test(value);
}

export function useLandingSiteUrl() {
  const runtimeConfig = useRuntimeConfig();
  const requestUrl = useRequestURL();

  return computed(() => {
    const configuredSiteUrl = String(
      runtimeConfig.public.landingSiteUrl || ''
    ).trim();

    if (configuredSiteUrl) {
      return trimTrailingSlash(configuredSiteUrl);
    }

    const requestOrigin = trimTrailingSlash(requestUrl.origin);

    // Для production/generate SEO-ссылки должны оставаться на боевом домене,
    // даже если CI не прокинул явный origin и Nitro использует localhost.
    if (!import.meta.dev && isLocalOrigin(requestOrigin)) {
      return 'https://mentala.app';
    }

    return requestOrigin;
  });
}
