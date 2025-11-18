import { focus } from '@/app/directives/focus';

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.directive('focus', focus);
});
