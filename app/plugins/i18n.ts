import { createI18n } from 'vue-i18n';
import { defineNuxtPlugin } from 'nuxt/app';

export default defineNuxtPlugin((nuxtApp) => {
  const messages = {
    ru: {
      hello: 'Привет',
      notifications: {
        banner: {
          tip: 'Рекомендация. Удерживайте суммарно до 10 уведомлений в день — так напоминания остаются полезными и не перегружают.',
          over: 'Интенсивность уведомлений сейчас высокая. Выбирайте тот ритм, который подходит именно Вам. Главное, чтобы напоминания поддерживали, а не перегружали.',
        },
      },
    },
    en: {
      hello: 'Hello',
      notifications: {
        banner: {
          tip: 'Recommendation. Keep the total under 10 notifications per day — this way reminders remain useful and not overwhelming.',
          over: 'Notification volume has become high. We recommend keeping it within 10 per day. The main thing is that reminders support, and do not overload.',
        },
      },
    },
  };
  const i18n = createI18n({
    legacy: false,
    locale: process.env.NUXT_PUBLIC_DEFAULT_LANG || 'ru',
    fallbackLocale: 'en',
    messages,
  });
  nuxtApp.vueApp.use(i18n);
});
