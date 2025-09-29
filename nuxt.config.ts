import Icons from 'unplugin-icons/vite'
import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@vueuse/nuxt', ''],
  css: ['~/assets/css/main.scss', '~/assets/css/tailwind.css'],
  vite: {
    plugins: [tailwindcss(), Icons({ autoInstall: true })],
  },
})
