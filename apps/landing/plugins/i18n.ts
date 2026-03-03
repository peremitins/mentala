import { createI18n } from 'vue-i18n';
import supportRu from '@/i18n/support/ru';
import supportEn from '@/i18n/support/en';

export default defineNuxtPlugin((nuxtApp) => {
  const i18n = createI18n({
    legacy: false,
    locale: 'ru',
    fallbackLocale: 'ru',
    messages: {
      ru: {
        support: supportRu,
      },
      en: {
        support: supportEn,
      },
    },
  });

  nuxtApp.vueApp.use(i18n);
});
