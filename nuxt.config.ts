import { fileURLToPath } from 'node:url';
import Icons from 'unplugin-icons/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineNuxtConfig({
  ssr: false,
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  srcDir: '',
  alias: {
    '@': fileURLToPath(new URL('./', import.meta.url)),
  },
  modules: [
    '@vueuse/nuxt',
    'shadcn-nuxt',
    '@scalar/nuxt',
    'vue-sonner/nuxt',
    '@nuxtjs/color-mode',
    'floating-vue/nuxt',
  ],
  shadcn: {
    prefix: 'shadcn',
    componentDir: '@/app/components/ui/shadcn/',
  },
  colorMode: {
    preference: 'system', // default value of $colorMode.preference
    fallback: 'light', // fallback value if not system preference found
    hid: 'nuxt-color-mode-script',
    globalName: '__NUXT_COLOR_MODE__',
    componentName: 'ColorScheme',
    classPrefix: '',
    classSuffix: '',
    storage: 'localStorage', // or 'sessionStorage' or 'cookie'
    storageKey: 'nuxt-color-mode',
    dataValue: 'theme', // data attribute for CSS selectors
  },
  app: {
    head: {
      viewport:
        'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover',
      link: [
        {
          rel: 'icon',
          type: 'image/png',
          href: '/favicon-96x96.png',
          sizes: '96x96',
        },
        {
          rel: 'icon',
          type: 'image/svg+xml',
          href: '/favicon.svg',
        },
        {
          rel: 'shortcut icon',
          href: '/favicon.ico',
        },
        {
          rel: 'apple-touch-icon',
          sizes: '180x180',
          href: '/apple-touch-icon.png',
        },
        {
          rel: 'manifest',
          href: '/site.webmanifest',
        },
      ],
      meta: [
        {
          name: 'viewport',
          content:
            'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover',
        },
      ],
    },
    // Глобальные настройки переходов между страницами
    pageTransition: { name: 'page', mode: 'out-in' },
  },
  css: [
    '~/assets/css/main.scss',
    '~/assets/css/tailwind.css',
    'vue-sonner/style.css',
  ],
  runtimeConfig: {
    // apiBase: process.env.NUXT_PRIVATE_API_BASE || 'http://localhost:3000', // только сервер
    heygenApiKey: process.env.NUXT_HEYGEN_API_KEY,
    heygenBaseUrl: process.env.NUXT_HEYGEN_BASE_URL || 'https://api.heygen.com',
    heygenAvatarId: process.env.NUXT_HEYGEN_AVATAR_ID || '',
    openaiApiKey: process.env.NUXT_OPENAI_API_KEY,
    OAUTH_GOOGLE_CLIENT_ID: process.env.NUXT_OAUTH_GOOGLE_CLIENT_ID,
    OAUTH_GOOGLE_CLIENT_SECRET: process.env.NUXT_OAUTH_GOOGLE_CLIENT_SECRET,
    OAUTH_VK_CLIENT_ID: process.env.NUXT_OAUTH_VK_CLIENT_ID,
    OAUTH_VK_CLIENT_SECRET: process.env.NUXT_OAUTH_VK_CLIENT_SECRET,
    TELEGRAM_BOT_TOKEN: process.env.NUXT_TELEGRAM_BOT_TOKEN,
    FIREBASE_SERVICE_ACCOUNT_JSON:
      process.env.NUXT_FIREBASE_SERVICE_ACCOUNT_JSON,
    // YooKassa настройки
    yookassaShopId: process.env.NUXT_YOOKASSA_SHOP_ID,
    yookassaSecretKey: process.env.NUXT_YOOKASSA_SECRET_KEY,
    yookassaTestMode: process.env.NUXT_YOOKASSA_TEST_MODE === 'true',
    public: {
      // Если не задано, будет пустая строка = относительные пути
      apiBase: process.env.NUXT_PUBLIC_API_SERVER_URL || '',
      appUrl: process.env.NUXT_PRIVATE_API_BASE || 'http://localhost:3000',
      speechDefaultEngine:
        process.env.NUXT_PUBLIC_SPEECH_DEFAULT_ENGINE || 'auto', // auto | native | webspeech | whisper
      isDev: process.env.NUXT_PUBLIC_IS_DEV === 'true', // Режим разработки (для управления функционалом в UI)
      chatIdleTimeoutMs: 2 * 60 * 1000, // 2 минуты в миллисекундах
    },
  },
  nitro: {
    prerender: {
      crawlLinks: false,
      // routes: [], // Пустой массив = не prerender ничего (не требует БД)
    },
    // host и port настраиваются через флаги --host 0.0.0.0 в package.json
  },
  vite: {
    plugins: [
      tailwindcss(),
      Icons({ autoInstall: true }),
      // Плагин для замены Vue DevTools API на заглушку
      {
        name: 'replace-vue-devtools',
        resolveId(id) {
          if (id === '@vue/devtools-api' || id.includes('@vue/devtools-api')) {
            return fileURLToPath(
              new URL('./app/utils/devtools-stub.ts', import.meta.url)
            );
          }
          return null;
        },
      },
    ],
  },
});
