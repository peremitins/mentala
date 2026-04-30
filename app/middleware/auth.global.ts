import { useAuthStore } from '@/app/stores/auth';
import { useChatSettingsStore } from '@/app/stores/chatSettings';
import { useSubscriptionStore } from '@/app/stores/subscription';
import {
  buildMarketingAttributionQueryParams,
  extractMarketingAttributionFromQuery,
} from '@/shared/utils/marketingAttribution';

function buildAuthRedirectPath(query: Record<string, unknown>): string {
  const attribution = extractMarketingAttributionFromQuery(query);
  const params = buildMarketingAttributionQueryParams(attribution);
  const search = params.toString();
  return search ? `/auth?${search}` : '/auth';
}

export default defineNuxtRouteMiddleware(async (to) => {
  // Публичные маршруты, не требующие авторизации
  const publicRoutes = [
    '/auth',
    '/error',
    '/forgot',
    '/reset-password',
    '/payment-success',
  ];

  // Явная проверка для /auth/link (может быть с query параметрами)
  if (to.path === '/auth/link' || to.path.startsWith('/auth/link')) {
    return; // Пропускаем проверку авторизации
  }

  if (publicRoutes.includes(to.path)) {
    return;
  }

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
    } catch (error) {
      console.warn('[AuthMiddleware] auth.me() failed in initial guard', error);
    }
  } else {
    // Если пользователь уже есть, проверяем кэш подписки
    // Если кэш устарел или отсутствует - обновляем в фоне
    if (subscriptionStore.shouldRefetch('subscription')) {
      subscriptionStore.fetchCurrentSubscription().catch(() => {
        // Игнорируем ошибки при фоновом обновлении
      });
    }
  }

  if (!auth.user) return navigateTo(buildAuthRedirectPath(to.query));

  if (!auth.user.onboarding) {
    try {
      await auth.me();
    } catch (error) {
      console.warn(
        '[AuthMiddleware] auth.me() failed in onboarding check',
        error
      );
    }
  }

  const onboardingCompleted = auth.user?.onboarding?.welcome === true;
  if (!onboardingCompleted && to.path !== '/onboarding') {
    return navigateTo('/onboarding');
  }

  if (onboardingCompleted && to.path === '/onboarding') {
    return navigateTo('/');
  }
});
