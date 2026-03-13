import { fileURLToPath } from 'node:url';
import Icons from 'unplugin-icons/vite';
import tailwindcss from '@tailwindcss/vite';
import svgLoader from 'vite-svg-loader';
import { resolveSceneDefaultVolumePercent } from './shared/utils/sceneSettings';

const sceneDefaultVolumePercent = resolveSceneDefaultVolumePercent(
  process.env.NUXT_PUBLIC_SCENE_DEFAULT_VOLUME_PERCENT
);

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
    'floating-vue/nuxt',
  ],
  plugins: ['~/i18n/plugin'],
  shadcn: {
    prefix: 'shadcn',
    componentDir: '@/app/components/ui/shadcn/',
  },
  app: {
    head: {
      viewport:
        'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover',
      link: [
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
        { rel: 'manifest', href: '/manifest.json' },
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
    TELEGRAM_ALERTS_BOT_TOKEN: process.env.TELEGRAM_ALERTS_BOT_TOKEN,
    TELEGRAM_ALERTS_CHAT_ID: process.env.TELEGRAM_ALERTS_CHAT_ID,
    TELEGRAM_REPORTS_TIMEZONE: process.env.TELEGRAM_REPORTS_TIMEZONE,
    TELEGRAM_DAILY_REPORT_HOUR: process.env.TELEGRAM_DAILY_REPORT_HOUR,
    TELEGRAM_REGISTRATION_MILESTONES:
      process.env.TELEGRAM_REGISTRATION_MILESTONES,
    TELEGRAM_ALERTS_ENV_LABEL: process.env.TELEGRAM_ALERTS_ENV_LABEL,
    TELEGRAM_API_TIMEOUT_MS: process.env.TELEGRAM_API_TIMEOUT_MS,
    TELEGRAM_HTTP_5XX_SPIKE_THRESHOLD:
      process.env.TELEGRAM_HTTP_5XX_SPIKE_THRESHOLD,
    TELEGRAM_HTTP_5XX_SPIKE_WINDOW_MINUTES:
      process.env.TELEGRAM_HTTP_5XX_SPIKE_WINDOW_MINUTES,
    TELEGRAM_PUSH_DEGRADATION_ERROR_RATE_PERCENT:
      process.env.TELEGRAM_PUSH_DEGRADATION_ERROR_RATE_PERCENT,
    TELEGRAM_PUSH_DEGRADATION_MIN_ATTEMPTS:
      process.env.TELEGRAM_PUSH_DEGRADATION_MIN_ATTEMPTS,
    TELEGRAM_PUSH_DEGRADATION_WINDOW_MINUTES:
      process.env.TELEGRAM_PUSH_DEGRADATION_WINDOW_MINUTES,
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
    public: {
      // Если не задано, будет пустая строка = относительные пути
      apiBase: process.env.NUXT_PUBLIC_API_SERVER_URL || '',
      appUrl: process.env.NUXT_PRIVATE_API_BASE || 'http://localhost:3000',
      // Dev-only URL для внешнего браузера на реальных устройствах (LAN).
      deviceAppUrl: process.env.NUXT_PUBLIC_DEVICE_APP_URL || '',
      mediaBaseUrl:
        process.env.NUXT_PUBLIC_MEDIA_BASE_URL || 'https://media.mentala.app',
      googleWebClientId: process.env.NUXT_OAUTH_GOOGLE_CLIENT_ID || '',
      googleIosClientId: process.env.NUXT_PUBLIC_GOOGLE_IOS_CLIENT_ID || '',
      speechDefaultEngine:
        process.env.NUXT_PUBLIC_SPEECH_DEFAULT_ENGINE || 'auto', // auto | native | webspeech | whisper
      isDev: process.env.NUXT_PUBLIC_IS_DEV === 'true', // Режим разработки (для управления функционалом в UI)
      chatIdleTimeoutMs: 2 * 60 * 1000, // 2 минуты в миллисекундах
      featureTtsEnabled: process.env.NUXT_FEATURE_TTS_ENABLED === 'true',
      featureNativeMeditationAudioEnabled:
        // На mobile native-плеер должен быть включён по умолчанию для фонового воспроизведения.
        // Явное отключение: NUXT_FEATURE_NATIVE_MEDITATION_AUDIO_ENABLED=false
        process.env.NUXT_FEATURE_NATIVE_MEDITATION_AUDIO_ENABLED !== 'false',
      // Дефолтная громкость фоновой сцены для новых пользователей задаётся через env.
      sceneDefaultVolumePercent,
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
});
