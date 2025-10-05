import Icons from 'unplugin-icons/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  srcDir: 'app',
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
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || '/api', // доступно на клиенте
    },
  },
  vite: {
    plugins: [tailwindcss(), Icons({ autoInstall: true })],
  },
});
