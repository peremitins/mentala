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

export function useLandingLocale() {
  const route = useRoute();
  const { locale } = useI18n();

  const selectedLocale = computed<SupportedLocale>(() => {
    // Для SEO корневой URL лендинга должен всегда оставаться русской версией.
    // Английский включаем только по явному query-параметру.
    const queryLocale =
      resolveLocale(toSingleQueryValue(route.query.lang)) ||
      resolveLocale(toSingleQueryValue(route.query.locale));
    if (queryLocale) return queryLocale;

    return 'ru';
  });

  watch(
    () => selectedLocale.value,
    (value) => {
      if (locale.value !== value) {
        locale.value = value;
      }
    },
    { immediate: true }
  );

  async function switchLocale(nextLocale: SupportedLocale) {
    if (locale.value === nextLocale && selectedLocale.value === nextLocale) {
      return;
    }

    locale.value = nextLocale;

    const nextQuery = { ...route.query };
    delete nextQuery.locale;

    if (nextLocale === 'ru') {
      delete nextQuery.lang;
    } else {
      nextQuery.lang = nextLocale;
    }

    await navigateTo(
      {
        path: route.path,
        query: nextQuery,
      },
      { replace: true }
    );
  }

  function getLocalizedPath(
    path: string,
    nextLocale: SupportedLocale = selectedLocale.value
  ): string {
    return nextLocale === 'en' ? `${path}?lang=en` : path;
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
    getLocalizedPath,
    brandLogoSrc,
    brandLogoAlt,
  };
}
