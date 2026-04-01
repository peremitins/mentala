import { createI18n } from 'vue-i18n';
import { messages, pluralRules } from '@/i18n';

export default defineNuxtPlugin((nuxtApp) => {
  const i18n = createI18n({
    legacy: false,
    locale: 'ru',
    fallbackLocale: 'ru',
    messages,
    pluralRules,
  });

  nuxtApp.vueApp.use(i18n);
});
