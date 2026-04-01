import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';

export type SupportedLocale = 'ru' | 'en';
const SUPPORTED_LOCALES: ReadonlyArray<SupportedLocale> = ['ru', 'en'];

function toSingleQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : undefined;
  }
  return typeof value === 'string' ? value : undefined;
}

function normalizeLocaleTag(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, '-');
}

function resolveLocale(value: unknown): SupportedLocale | null {
  if (typeof value !== 'string') return null;
  const normalizedValue = normalizeLocaleTag(value);
  if (!normalizedValue) return null;

  if ((SUPPORTED_LOCALES as readonly string[]).includes(normalizedValue)) {
    return normalizedValue as SupportedLocale;
  }

  const [baseLocale = ''] = normalizedValue.split('-');
  if ((SUPPORTED_LOCALES as readonly string[]).includes(baseLocale)) {
    return baseLocale as SupportedLocale;
  }

  return null;
}

function parseAcceptLanguage(headerValue?: string): string[] {
  if (!headerValue) {
    return [];
  }

  return headerValue
    .split(',')
    .map((rawLocale, index) => {
      const [localeTag, ...params] = rawLocale.trim().split(';');
      if (!localeTag) {
        return null;
      }

      const qualityParam = params.find((param) =>
        param.trim().toLowerCase().startsWith('q=')
      );
      const qualityValue = qualityParam
        ? Number.parseFloat(qualityParam.split('=')[1] ?? '')
        : 1;

      return {
        localeTag,
        quality: Number.isFinite(qualityValue) ? qualityValue : 1,
        index,
      };
    })
    .filter(
      (item): item is { localeTag: string; quality: number; index: number } =>
        Boolean(item)
    )
    .sort((left, right) => {
      if (right.quality !== left.quality) {
        return right.quality - left.quality;
      }
      return left.index - right.index;
    })
    .map((item) => item.localeTag);
}

function detectBrowserLocales(): string[] {
  if (typeof navigator === 'undefined') {
    return [];
  }

  const locales = [
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    navigator.language,
  ];

  return locales.filter(
    (localeTag, index) =>
      typeof localeTag === 'string' &&
      localeTag.length > 0 &&
      locales.indexOf(localeTag) === index
  );
}

export function useLandingLocale() {
  const route = useRoute();
  const langCookie = useCookie<string | null>('mentai.lang', {
    maxAge: 365 * 24 * 3600,
    path: '/',
  });
  const { locale } = useI18n();
  const requestHeaders = import.meta.server
    ? useRequestHeaders(['accept-language'])
    : {};

  const selectedLocale = computed<SupportedLocale>(() => {
    // Best practice: явный выбор пользователя (URL/cookie) всегда приоритетнее автодетекта.
    const queryLocale =
      resolveLocale(toSingleQueryValue(route.query.lang)) ||
      resolveLocale(toSingleQueryValue(route.query.locale));
    if (queryLocale) return queryLocale;

    const cookieLocale = resolveLocale(langCookie.value);
    if (cookieLocale) return cookieLocale;

    const autoDetectedLocales = import.meta.client
      ? detectBrowserLocales()
      : parseAcceptLanguage(requestHeaders['accept-language']);

    for (const autoDetectedLocale of autoDetectedLocales) {
      const resolvedAutoLocale = resolveLocale(autoDetectedLocale);
      if (resolvedAutoLocale) {
        return resolvedAutoLocale;
      }
    }

    return 'ru';
  });

  watch(
    () => selectedLocale.value,
    (value) => {
      if (locale.value !== value) {
        locale.value = value;
      }
      if (langCookie.value !== value) {
        langCookie.value = value;
      }
    },
    { immediate: true }
  );

  async function switchLocale(nextLocale: SupportedLocale) {
    if (locale.value === nextLocale && selectedLocale.value === nextLocale) {
      return;
    }

    langCookie.value = nextLocale;
    locale.value = nextLocale;

    await navigateTo(
      {
        path: route.path,
        query: {
          ...route.query,
          lang: nextLocale,
        },
      },
      { replace: true }
    );
  }

  const brandLogoSrc = computed(() =>
    locale.value === 'ru' ? '/logo_ru.svg' : '/logo_en.svg'
  );

  const brandLogoAlt = computed(() =>
    locale.value === 'ru' ? 'Ментала' : 'Mentala'
  );

  return {
    locale,
    selectedLocale,
    switchLocale,
    brandLogoSrc,
    brandLogoAlt,
  };
}
