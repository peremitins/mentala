import { createI18n } from 'vue-i18n';
import { watch } from 'vue';
import { defineNuxtPlugin } from 'nuxt/app';
import { useAuthStore } from '@/app/stores/auth';
import { messages, pluralRules } from '@/app/i18n';

type SupportedLocale = 'ru' | 'en';

function resolveLocale(value: unknown): SupportedLocale | null {
  if (typeof value !== 'string') return null;
  const normalizedValue = value.trim().toLowerCase();
  if (normalizedValue.startsWith('ru')) return 'ru';
  if (normalizedValue.startsWith('en')) return 'en';
  return null;
}

export default defineNuxtPlugin((nuxtApp) => {
  const langCookie = useCookie<string | null>('mentai.lang', {
    maxAge: 365 * 24 * 3600,
    path: '/',
  });

  const initialLocale =
    resolveLocale(langCookie.value) ||
    resolveLocale(process.env.NUXT_PUBLIC_DEFAULT_LANG) ||
    'ru';

  const i18n = createI18n({
    legacy: false,
    locale: initialLocale,
    fallbackLocale: 'en',
    messages,
    pluralRules,
  });
  nuxtApp.vueApp.use(i18n);

  function applyLocale(nextLocaleValue: unknown) {
    const nextLocale = resolveLocale(nextLocaleValue);
    if (!nextLocale) return;

    if (i18n.global.locale.value !== nextLocale) {
      i18n.global.locale.value = nextLocale;
    }
    if (langCookie.value !== nextLocale) {
      langCookie.value = nextLocale;
    }
  }

  if (process.client) {
    nuxtApp.hook('app:created', () => {
      const auth = useAuthStore();
      watch(
        () => auth.user?.locale,
        (userLocale) => {
          applyLocale(userLocale);
        },
        { immediate: true }
      );
    });
  }
});
