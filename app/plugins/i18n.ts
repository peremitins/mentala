import { createI18n } from 'vue-i18n';
import { defineNuxtPlugin } from 'nuxt/app';
import supportRu from '@/apps/landing/i18n/support/ru';
import supportEn from '@/apps/landing/i18n/support/en';
import { watch } from 'vue';
import { useAuthStore } from '@/app/stores/auth';

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

  const messages = {
    ru: {
      hello: 'Привет',
      notifications: {
        banner: {
          tip: 'Рекомендация. Удерживайте суммарно до 10 уведомлений в день — так напоминания остаются полезными и не перегружают.',
          over: 'Интенсивность уведомлений сейчас высокая. Выбирайте тот ритм, который подходит именно Вам. Главное, чтобы напоминания поддерживали, а не перегружали.',
        },
      },
      support: supportRu,
    },
    en: {
      hello: 'Hello',
      notifications: {
        banner: {
          tip: 'Recommendation. Keep the total under 10 notifications per day — this way reminders remain useful and not overwhelming.',
          over: 'Notification volume has become high. We recommend keeping it within 10 per day. The main thing is that reminders support, and do not overload.',
        },
      },
      support: supportEn,
    },
  };
  const i18n = createI18n({
    legacy: false,
    locale: initialLocale,
    fallbackLocale: 'en',
    messages,
  });
  nuxtApp.vueApp.use(i18n);

  function applyLocale(nextLocaleValue: unknown) {
    const nextLocale = resolveLocale(nextLocaleValue);
    if (!nextLocale) return;

    // Синхронизируем глобальную локаль и cookie из единого источника.
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
