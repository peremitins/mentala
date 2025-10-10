import { fileURLToPath } from 'node:url';
import Icons from 'unplugin-icons/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  srcDir: 'app',
  alias: {
    '@': fileURLToPath(new URL('./', import.meta.url)),
  },
  modules: ['@vueuse/nuxt', 'shadcn-nuxt', '@scalar/nuxt', 'vue-sonner/nuxt'],
  shadcn: {
    prefix: '',
    componentDir: '~/components/ui',
  },
  css: [
    '~/assets/css/main.scss',
    '~/assets/css/tailwind.css',
    'vue-sonner/style.css',
  ],
  runtimeConfig: {
    apiBase: process.env.NUXT_PRIVATE_API_BASE || 'http://localhost:3000', // только сервер
    heygenApiKey: process.env.NUXT_HEYGEN_API_KEY,
    heygenBaseUrl: process.env.NUXT_HEYGEN_BASE_URL || 'https://api.heygen.com',
    heygenAvatarId: process.env.NUXT_HEYGEN_AVATAR_ID || '',
    openaiApiKey: process.env.OPENAI_API_KEY,
    OAUTH_GOOGLE_CLIENT_ID: process.env.NUXT_OAUTH_GOOGLE_CLIENT_ID,
    OAUTH_GOOGLE_CLIENT_SECRET: process.env.NUXT_OAUTH_GOOGLE_CLIENT_SECRET,
    OAUTH_VK_CLIENT_ID: process.env.NUXT_OAUTH_VK_CLIENT_ID,
    OAUTH_VK_CLIENT_SECRET: process.env.NUXT_OAUTH_VK_CLIENT_SECRET,
    TELEGRAM_BOT_TOKEN: process.env.NUXT_TELEGRAM_BOT_TOKEN,
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || '/api', // доступно на клиенте
      speechDefaultEngine:
        process.env.NUXT_PUBLIC_SPEECH_DEFAULT_ENGINE || 'auto', // auto | native | webspeech | whisper
    },
  },
  vite: {
    plugins: [tailwindcss(), Icons({ autoInstall: true })],
  },
});
