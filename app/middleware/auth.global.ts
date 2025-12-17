import { useAuthStore } from '@/app/stores/auth';
import { useChatSettingsStore } from '@/app/stores/chatSettings';
import { useSubscriptionStore } from '@/app/stores/subscription';

export default defineNuxtRouteMiddleware(async (to) => {
  const publicRoutes = ['/auth', '/error'];
  if (publicRoutes.includes(to.path)) return;

  // Проверяем только на клиенте, чтобы избежать проблем с SSR
  if (process.server) return;

  const auth = useAuthStore();
  const chatSettings = useChatSettingsStore();
  const subscriptionStore = useSubscriptionStore();

  if (!auth.user) {
    try {
      await auth.me(); // Это вернет user: null если не авторизован
      if (auth.user) {
        // Загружаем подписку при инициализации (с кэшированием на 5 минут)
        await Promise.all([
          chatSettings.getChatSettings(),
          subscriptionStore.fetchCurrentSubscription(), // Кэш на 5 минут
        ]);
      }
    } catch {}
  } else {
    // Если пользователь уже есть, проверяем кэш подписки
    // Если кэш устарел или отсутствует - обновляем в фоне
    if (subscriptionStore.shouldRefetch('subscription')) {
      subscriptionStore.fetchCurrentSubscription().catch(() => {
        // Игнорируем ошибки при фоновом обновлении
      });
    }
  }

  if (!auth.user) return navigateTo('/auth');
});
