import { defineNuxtPlugin } from 'nuxt/app';
import { useChatStore } from '@/app/stores/chat';

export default defineNuxtPlugin(() => {
  if (process.server) return;
  const onBeforeUnload = () => {
    try {
      const chat = useChatStore();
      // отправим без await, чтобы не блокировать закрытие
      void chat.finishAndSave();
    } catch {}
  };
  window.addEventListener('beforeunload', onBeforeUnload);
});
