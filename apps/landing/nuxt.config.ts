import { fileURLToPath } from 'node:url';
import { defineNuxtConfig } from 'nuxt/config';
import tailwindcss from '@tailwindcss/vite';

const landingRoot = fileURLToPath(new URL('./', import.meta.url));
const landingCss = fileURLToPath(
  new URL('./assets/css/landing.css', import.meta.url)
);

export default defineNuxtConfig({
  ssr: true,
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  srcDir: '',
  components: false,
  alias: {
    '@': landingRoot,
  },
  modules: ['@vueuse/nuxt', 'floating-vue/nuxt'],
  css: [
    landingCss,
    'swiper/css',
    'swiper/css/pagination',
    'swiper/css/navigation',
  ],
  routeRules: {
    // В dev не кэшируем HTML, чтобы после правок не было hydration mismatch (старый HTML с сервера vs новый клиентский бандл).
    // В production (при nuxt build) — гибридный SSR + SWR. При nuxt generate эти правила не меняют статический экспорт.
    '/': { swr: process.env.NODE_ENV === 'development' ? 0 : 120 },
  },
  // Статический экспорт (nuxt generate): предрендер только маршрута / и статичных файлов из public/
  nitro: {
    prerender: {
      crawlLinks: false,
      routes: ['/'],
    },
  },
  app: {
    head: {
      htmlAttrs: {
        lang: 'ru',
      },
      viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
    },
  },
  runtimeConfig: {
    public: {
      landingApiBase:
        process.env.NUXT_PUBLIC_API_SERVER_URL || 'http://localhost:3000',
      appAuthUrl:
        process.env.NUXT_PUBLIC_APP_AUTH_URL || 'https://my.mentala.app/auth',
      landingSiteUrl:
        process.env.NUXT_PUBLIC_LANDING_SITE_URL || 'https://mentala.app',
      /** ID счётчика Яндекс.Метрики для лендинга (аналитика v1). Пустой — скрипт не подключается. */
      yandexMetrikaId: process.env.NUXT_PUBLIC_YANDEX_METRIKA_ID || '',
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
