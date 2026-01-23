import { defineNuxtPlugin } from 'nuxt/app';
import { createPinia } from 'pinia';

export default defineNuxtPlugin({
  name: 'pinia',
  setup(nuxtApp) {
    const pinia = createPinia();
    nuxtApp.vueApp.use(pinia);
  },
});
