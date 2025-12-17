/**
 * Plugin для синхронизации данных подписки при возврате фокуса приложения
 * Обеспечивает актуальность данных подписки после изменений в веб-версии
 */

import { useSubscriptionStore } from '@/app/stores/subscription';
import { useAuthStore } from '@/app/stores/auth';

export default defineNuxtPlugin(() => {
  // Работаем только на клиенте
  if (process.server) return;

  const subscriptionStore = useSubscriptionStore();
  const auth = useAuthStore();

  // Обновляем подписку при возврате фокуса (для синхронизации с веб-версией)
  const handleVisibilityChange = () => {
    if (
      document.visibilityState === 'visible' &&
      auth.isLoggedIn &&
      !auth.loading
    ) {
      // Инвалидируем кэш и обновляем в фоне
      subscriptionStore.invalidateCache();
      subscriptionStore.fetchCurrentSubscription().catch(() => {
        // Игнорируем ошибки при фоновом обновлении
      });
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Также обновляем при возврате приложения (для мобильных через Capacitor)
  if (typeof window !== 'undefined') {
    // Динамически импортируем Capacitor App, если доступен
    import('@capacitor/app')
      .then(({ App }) => {
        App.addListener('appStateChange', ({ isActive }) => {
          if (isActive && auth.isLoggedIn && !auth.loading) {
            subscriptionStore.invalidateCache();
            subscriptionStore.fetchCurrentSubscription().catch(() => {
              // Игнорируем ошибки
            });
          }
        });
      })
      .catch(() => {
        // Capacitor недоступен (веб-версия), это нормально
      });
  }
});
