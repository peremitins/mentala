import { createI18n } from 'vue-i18n'
import { defineNuxtPlugin } from 'nuxt/app'

export default defineNuxtPlugin((nuxtApp) => {
  const messages = {
    ru: { hello: 'Привет' },
    en: { hello: 'Hello' },
  }
  const i18n = createI18n({
    legacy: false,
    locale: process.env.NUXT_PUBLIC_DEFAULT_LANG || 'ru',
    fallbackLocale: 'en',
    messages,
  })
  nuxtApp.vueApp.use(i18n)
})
