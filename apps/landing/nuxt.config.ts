import { fileURLToPath } from 'node:url';
import { defineNuxtConfig } from 'nuxt/config';
import tailwindcss from '@tailwindcss/vite';
import viteCompression from 'vite-plugin-compression';

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
  modules: ['@vueuse/nuxt', 'floating-vue/nuxt', 'nuxt-yandex-metrika'],
  /** Яндекс.Метрика: ID из env. cdn: true — скрипт грузится с jsDelivr, обход ERR_SSL_PROTOCOL_ERROR на mc.yandex.ru у части пользователей. */
  // cdn: true — скрипт с jsDelivr, обход ERR_SSL_PROTOCOL_ERROR на mc.yandex.ru у части пользователей
  yandexMetrika: {
    id:
      String(process.env.NUXT_PUBLIC_YANDEX_METRIKA_ID || '').trim() ||
      undefined,
    cdn: true,
    options: {
      webvisor: true,
      clickmap: true,
      trackLinks: true,
      accurateTrackBounce: true,
    },
  },
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
    '/support': { swr: process.env.NODE_ENV === 'development' ? 0 : 120 },
    '/account-deletion': {
      swr: process.env.NODE_ENV === 'development' ? 0 : 120,
    },
  },
  // Статический экспорт (nuxt generate): предрендер только маршрута / и статичных файлов из public/
  nitro: {
    typescript: {
      tsConfig: {
        include: ['../server/routes/.well-known/**/*'],
      },
    },
    prerender: {
      crawlLinks: false,
      routes: [
        '/',
        '/support',
        '/account-deletion',
        '/.well-known/apple-app-site-association',
        '/.well-known/assetlinks.json',
      ],
    },
  },
  app: {
    head: {
      htmlAttrs: {
        lang: 'ru',
      },
      viewport:
        'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover',
      // Полный набор favicon/apple-touch/android/ms как в основном приложении.
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'shortcut icon', href: '/favicon.ico' },
        {
          rel: 'apple-touch-icon',
          sizes: '57x57',
          href: '/apple-icon-57x57.png',
        },
        {
          rel: 'apple-touch-icon',
          sizes: '60x60',
          href: '/apple-icon-60x60.png',
        },
        {
          rel: 'apple-touch-icon',
          sizes: '72x72',
          href: '/apple-icon-72x72.png',
        },
        {
          rel: 'apple-touch-icon',
          sizes: '76x76',
          href: '/apple-icon-76x76.png',
        },
        {
          rel: 'apple-touch-icon',
          sizes: '114x114',
          href: '/apple-icon-114x114.png',
        },
        {
          rel: 'apple-touch-icon',
          sizes: '120x120',
          href: '/apple-icon-120x120.png',
        },
        {
          rel: 'apple-touch-icon',
          sizes: '144x144',
          href: '/apple-icon-144x144.png',
        },
        {
          rel: 'apple-touch-icon',
          sizes: '152x152',
          href: '/apple-icon-152x152.png',
        },
        {
          rel: 'apple-touch-icon',
          sizes: '180x180',
          href: '/apple-icon-180x180.png',
        },
        {
          rel: 'icon',
          type: 'image/png',
          sizes: '192x192',
          href: '/android-icon-192x192.png',
        },
        {
          rel: 'icon',
          type: 'image/png',
          sizes: '32x32',
          href: '/favicon-32x32.png',
        },
        {
          rel: 'icon',
          type: 'image/png',
          sizes: '96x96',
          href: '/favicon-96x96.png',
        },
        {
          rel: 'icon',
          type: 'image/png',
          sizes: '16x16',
          href: '/favicon-16x16.png',
        },
        { rel: 'manifest', href: '/site.webmanifest' },
      ],
      meta: [
        {
          name: 'viewport',
          content:
            'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover',
        },
        { name: 'msapplication-TileColor', content: '#ffffff' },
        { name: 'msapplication-TileImage', content: '/ms-icon-144x144.png' },
        { name: 'theme-color', content: '#ffffff' },
        ...(String(process.env.NUXT_PUBLIC_GOOGLE_SITE_VERIFICATION || '').trim()
          ? [
              {
                name: 'google-site-verification',
                content: String(
                  process.env.NUXT_PUBLIC_GOOGLE_SITE_VERIFICATION
                ).trim(),
              },
            ]
          : []),
        ...(String(process.env.NUXT_PUBLIC_YANDEX_VERIFICATION || '').trim()
          ? [
              {
                name: 'yandex-verification',
                content: String(process.env.NUXT_PUBLIC_YANDEX_VERIFICATION).trim(),
              },
            ]
          : []),
      ],
      // Noscript-пиксель Яндекс.Метрики (при отключённом JS). ID подставляется на этапе сборки.
      ...(process.env.NUXT_PUBLIC_YANDEX_METRIKA_ID?.trim()
        ? {
            noscript: [
              {
                innerHTML: `<div><img src="https://mc.yandex.ru/watch/${process.env.NUXT_PUBLIC_YANDEX_METRIKA_ID.trim()}" style="position:absolute;left:-9999px;" alt="" /></div>`,
              },
            ],
          }
        : {}),
    },
  },
  runtimeConfig: {
    public: {
      landingApiBase:
        process.env.NUXT_PUBLIC_API_SERVER_URL || 'http://localhost:3000',
      appAuthUrl:
        process.env.NUXT_PUBLIC_APP_AUTH_URL || 'https://my.mentala.app/auth',
      landingSiteUrl: process.env.NUXT_PUBLIC_LANDING_SITE_URL || '',
      googleSiteVerification:
        process.env.NUXT_PUBLIC_GOOGLE_SITE_VERIFICATION || '',
      yandexVerification: process.env.NUXT_PUBLIC_YANDEX_VERIFICATION || '',
      /** ID счётчика Яндекс.Метрики. Задаётся через NUXT_PUBLIC_YANDEX_METRIKA_ID (на проде — в CI). */
      yandexMetrikaId: process.env.NUXT_PUBLIC_YANDEX_METRIKA_ID || '',
    },
  },
  vite: {
    plugins: [
      tailwindcss(),
      // Precompress для статики (gzip + brotli). Чтобы реально использовать файлы на сервере,
      // включи `gzip_static on;` и `brotli_static on;` в Nginx.
      ...(process.env.NODE_ENV === 'production'
        ? [
            viteCompression({
              algorithm: 'gzip',
              filter: /\.(?:js|mjs|css|html|svg|json|xml)$/i,
              threshold: 1024,
            }),
            viteCompression({
              algorithm: 'brotliCompress',
              ext: '.br',
              filter: /\.(?:js|mjs|css|html|svg|json|xml)$/i,
              threshold: 1024,
            }),
          ]
        : []),
    ],
  },
});
