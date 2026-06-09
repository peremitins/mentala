import { fileURLToPath } from 'node:url';
import Icons from 'unplugin-icons/vite';
import tailwindcss from '@tailwindcss/vite';
import svgLoader from 'vite-svg-loader';
import { resolveSceneDefaultVolumePercent } from './shared/utils/sceneSettings';

const sceneDefaultVolumePercent = resolveSceneDefaultVolumePercent(
  process.env.NUXT_PUBLIC_SCENE_DEFAULT_VOLUME_PERCENT
);
const buildDir = process.env.MENTALA_NUXT_BUILD_DIR || '.nuxt';
const yandexMetrikaId = String(
  process.env.NUXT_PUBLIC_YANDEX_METRIKA_ID || ''
).trim();
const yandexMetrikaDisabled =
  process.env.NUXT_PUBLIC_YANDEX_METRIKA_DISABLED === 'true';

export default defineNuxtConfig({
  ssr: false,
  // Для mobile static/release сборок используем отдельный buildDir,
  // чтобы dev-сервер не перетирал `.nuxt` и не ломал client.manifest.
  buildDir,
  // После деплоя старые хеш-чанки исчезают вместе с docker-контейнером.
  // 'automatic' — Nuxt сам перезагружает страницу при ошибке загрузки
  // route-чанка во время навигации. Ручные import() (озвучка практик)
  // дополнительно покрыты app/plugins/chunk-reload.client.ts.
  experimental: {
    emitRouteChunkError: 'automatic',
  },
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
    'floating-vue/nuxt',
    '@vite-pwa/nuxt',
    ...(yandexMetrikaId && !yandexMetrikaDisabled
      ? ['nuxt-yandex-metrika']
      : []),
  ],
  // Яндекс.Метрика для основного приложения: нужна для post-click целей
  // после перехода с лендинга в регистрацию, онбординг, тест и checkout.
  // @ts-ignore — nuxt-yandex-metrika не аугментирует NuxtConfig
  yandexMetrika:
    yandexMetrikaId && !yandexMetrikaDisabled
      ? {
          id: yandexMetrikaId,
          cdn: true,
          options: {
            webvisor: true,
            clickmap: true,
            trackLinks: true,
            accurateTrackBounce: true,
          },
        }
      : undefined,
  plugins: ['~/i18n/plugin'],
  shadcn: {
    prefix: 'shadcn',
    componentDir: '@/app/components/ui/shadcn/',
  },
  app: {
    head: {
      htmlAttrs: {
        lang: 'ru',
      },
      viewport:
        'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover',
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        {
          rel: 'preconnect',
          href: 'https://fonts.gstatic.com',
          crossorigin: 'anonymous',
        },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700&family=Bricolage+Grotesque:opsz,wght@12..96,400..700&family=Comfortaa:wght@400;500;600;700&display=swap&subset=cyrillic,cyrillic-ext,latin,latin-ext',
        },
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
          type: 'image/svg+xml',
          href: '/favicon.svg',
        },
        {
          rel: 'icon',
          type: 'image/x-icon',
          href: '/favicon.ico',
        },
        {
          rel: 'shortcut icon',
          href: '/favicon.ico',
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
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'Ментала' },
        {
          name: 'apple-mobile-web-app-status-bar-style',
          content: 'black-translucent',
        },
        { name: 'msapplication-TileColor', content: '#ffffff' },
        { name: 'msapplication-TileImage', content: '/ms-icon-144x144.png' },
        { name: 'theme-color', content: '#09090b' },
        {
          name: 'robots',
          content: 'noindex, nofollow, noarchive, nosnippet, noimageindex',
        },
        {
          name: 'googlebot',
          content: 'noindex, nofollow, noarchive, nosnippet, noimageindex',
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
    TELEGRAM_ALERTS_BOT_TOKEN: process.env.NUXT_TELEGRAM_ALERTS_BOT_TOKEN,
    TELEGRAM_ALERTS_CHAT_ID: process.env.NUXT_TELEGRAM_ALERTS_CHAT_ID,
    TELEGRAM_REPORTS_TIMEZONE: process.env.NUXT_TELEGRAM_REPORTS_TIMEZONE,
    TELEGRAM_DAILY_REPORT_HOUR: process.env.NUXT_TELEGRAM_DAILY_REPORT_HOUR,
    TELEGRAM_REGISTRATION_MILESTONES:
      process.env.NUXT_TELEGRAM_REGISTRATION_MILESTONES,
    TELEGRAM_ALERTS_ENV_LABEL: process.env.NUXT_TELEGRAM_ALERTS_ENV_LABEL,
    TELEGRAM_API_TIMEOUT_MS: process.env.NUXT_TELEGRAM_API_TIMEOUT_MS,
    TELEGRAM_HTTP_5XX_SPIKE_THRESHOLD:
      process.env.NUXT_TELEGRAM_HTTP_5XX_SPIKE_THRESHOLD,
    TELEGRAM_HTTP_5XX_SPIKE_WINDOW_MINUTES:
      process.env.NUXT_TELEGRAM_HTTP_5XX_SPIKE_WINDOW_MINUTES,
    TELEGRAM_PUSH_DEGRADATION_ERROR_RATE_PERCENT:
      process.env.NUXT_TELEGRAM_PUSH_DEGRADATION_ERROR_RATE_PERCENT,
    TELEGRAM_PUSH_DEGRADATION_MIN_ATTEMPTS:
      process.env.NUXT_TELEGRAM_PUSH_DEGRADATION_MIN_ATTEMPTS,
    TELEGRAM_PUSH_DEGRADATION_WINDOW_MINUTES:
      process.env.NUXT_TELEGRAM_PUSH_DEGRADATION_WINDOW_MINUTES,
    telegramLeadsChatId: process.env.NUXT_TELEGRAM_LEADS_CHAT_ID,
    landingLeadsEmailTo: process.env.NUXT_LANDING_LEADS_EMAIL_TO,
    FIREBASE_SERVICE_ACCOUNT_JSON:
      process.env.NUXT_FIREBASE_SERVICE_ACCOUNT_JSON,
    authEmailCodeSecret: process.env.AUTH_EMAIL_CODE_SECRET,
    authEmailCodeSecretPrevious: process.env.AUTH_EMAIL_CODE_SECRET_PREVIOUS,
    emailHashPepper: process.env.EMAIL_HASH_PEPPER,
    smtpHost: process.env.SMTP_HOST,
    smtpPort: process.env.SMTP_PORT,
    smtpSecure: process.env.SMTP_SECURE,
    smtpUser: process.env.SMTP_USER,
    smtpPassword: process.env.SMTP_PASSWORD,
    smtpFrom: process.env.SMTP_FROM,
    smtpFromName: process.env.SMTP_FROM_NAME,
    // YooKassa настройки
    yookassaShopId: process.env.NUXT_YOOKASSA_SHOP_ID,
    yookassaSecretKey: process.env.NUXT_YOOKASSA_SECRET_KEY,
    yookassaTestMode: process.env.NUXT_YOOKASSA_TEST_MODE === 'true',
    // Apple IAP (StoreKit 2 + App Store Server API) server-only настройки.
    // ВАЖНО: приватные ключи не должны попадать в runtimeConfig.public.
    appleIapBundleIds:
      process.env.APPLE_IAP_BUNDLE_IDS ||
      process.env.NUXT_APPLE_IAP_BUNDLE_IDS ||
      process.env.NUXT_APPLE_IAP_BUNDLE_ID,
    appleIapIssuerId:
      process.env.APPLE_IAP_ISSUER_ID || process.env.NUXT_APPLE_IAP_ISSUER_ID,
    appleIapKeyId:
      process.env.APPLE_IAP_KEY_ID || process.env.NUXT_APPLE_IAP_KEY_ID,
    appleIapPrivateKeyBase64:
      process.env.APPLE_IAP_PRIVATE_KEY_BASE64 ||
      process.env.NUXT_APPLE_IAP_PRIVATE_KEY_BASE64,
    public: {
      // Если не задано, будет пустая строка = относительные пути
      apiBase: process.env.NUXT_PUBLIC_API_SERVER_URL || '',
      // Для SEO, OAuth callback и внешних ссылок нужен именно публичный origin приложения,
      // а не приватный API base. Фолбэк на private base оставляем только для локальной разработки.
      appUrl:
        process.env.NUXT_PUBLIC_APP_URL ||
        process.env.NUXT_PRIVATE_API_BASE ||
        'http://localhost:3000',
      // Dev-only URL для внешнего браузера на реальных устройствах (LAN).
      deviceAppUrl: process.env.NUXT_PUBLIC_DEVICE_APP_URL || '',
      mediaBaseUrl:
        process.env.NUXT_PUBLIC_MEDIA_BASE_URL || 'https://media.mentala.app',
      googleWebClientId: process.env.NUXT_OAUTH_GOOGLE_CLIENT_ID || '',
      googleIosClientId: process.env.NUXT_PUBLIC_GOOGLE_IOS_CLIENT_ID || '',
      speechDefaultEngine:
        process.env.NUXT_PUBLIC_SPEECH_DEFAULT_ENGINE || 'auto', // auto | native | webspeech | whisper
      isDev: process.env.NUXT_PUBLIC_IS_DEV === 'true', // Режим разработки (для управления функционалом в UI)
      chatIdleTimeoutMs: 15 * 60 * 1000, // 15 минут в миллисекундах
      featureTtsEnabled: process.env.NUXT_FEATURE_TTS_ENABLED === 'true',
      featureNativeMeditationAudioEnabled:
        // На mobile native-плеер должен быть включён по умолчанию для фонового воспроизведения.
        // Явное отключение: NUXT_FEATURE_NATIVE_MEDITATION_AUDIO_ENABLED=false
        process.env.NUXT_FEATURE_NATIVE_MEDITATION_AUDIO_ENABLED !== 'false',
      // Дефолтная громкость фоновой сцены для новых пользователей задаётся через env.
      sceneDefaultVolumePercent,
      yandexMetrikaId,
      yandexMetrikaDisabled,
    },
  },
  nitro: {
    typescript: {
      tsConfig: {
        include: ['../server/routes/.well-known/**/*'],
      },
    },
    prerender: {
      crawlLinks: false,
      // routes: [], // Пустой массив = не prerender ничего (не требует БД)
    },
    // host и port настраиваются через флаги --host 0.0.0.0 в package.json
  },
  vite: {
    optimizeDeps: {
      include: ['vue-input-otp'],
    },
    plugins: [
      tailwindcss(),
      svgLoader(),
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

  // ==========================================
  // PWA + Service Worker
  // ==========================================
  pwa: {
    // Используем injectManifest, чтобы писать кастомный SW с Firebase Messaging
    strategies: 'injectManifest',
    srcDir: '.',
    filename: 'sw.ts',
    // Регистрация SW через useRegisterSW composable вручную (из useWebPush.ts)
    injectRegister: false,
    // Не генерируем отдельный manifest — используем существующий /site.webmanifest
    manifest: false,
    injectManifest: {
      // Кешируем только статику: иконки, шрифты, базовый shell
      globPatterns: ['**/*.{ico,png,svg,woff2}'],
      // Не кешируем API, чувствительные данные, HTML
      globIgnores: ['**/api/**', '**/*.html'],
    },
    devOptions: {
      // В dev режиме SW регистрируется, но не кеширует ресурсы
      enabled: true,
      type: 'module',
    },
  },
});
