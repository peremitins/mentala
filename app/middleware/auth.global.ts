import { useAuthStore } from '@/app/stores/auth';
import { useChatSettingsStore } from '@/app/stores/chatSettings';

export default defineNuxtRouteMiddleware(async (to) => {
  const publicRoutes = ['/auth', '/error'];
  if (publicRoutes.includes(to.path)) return;

  // Проверяем только на клиенте, чтобы избежать проблем с SSR
  if (process.server) return;

  const auth = useAuthStore();
  const chatSettings = useChatSettingsStore();

  if (!auth.user) {
    try {
      await auth.me(); // Это вернет user: null если не авторизован
      if (auth.user) {
        await chatSettings.getChatSettings();
      }
    } catch {}
  }

  if (!auth.user) return navigateTo('/auth');
});
