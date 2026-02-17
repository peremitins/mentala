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
    // В production — гибридный SSR + SWR для снижения нагрузки.
    '/': { swr: process.env.NODE_ENV === 'development' ? 0 : 120 },
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
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
