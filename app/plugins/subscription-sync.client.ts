/**
 * Plugin для синхронизации данных подписки по оплатным событиям.
 * Не делает foreground-sync при обычном переключении вкладок/окна.
 */

import { useSubscriptionStore } from '@/app/stores/subscription';
import { useAuthStore } from '@/app/stores/auth';
import { runSubscriptionShortPolling } from '@/app/lib/subscriptionPolling';
import { useEntitlements } from '@/app/composables/useEntitlements';

export default defineNuxtPlugin(() => {
  // Работаем только на клиенте
  if (process.server) return;

  const subscriptionStore = useSubscriptionStore();
  const auth = useAuthStore();
  const router = useRouter();
  const { refreshEntitlements } = useEntitlements();
  let activePollingPromise: Promise<void> | null = null;
  let activeDeepLinkSyncPromise: Promise<void> | null = null;

  const refreshBillingAccessSnapshot = async () => {
    if (!auth.isLoggedIn || auth.loading) return;
    await refreshEntitlements().catch(() => {
      // Ошибки entitlement-refresh не должны ломать фоновой sync.
    });
    await auth.me().catch(() => {
      // Ошибки полного user-refresh не должны ломать фоновой sync.
    });
  };

  const refreshSubscriptionOnce = async () => {
    if (!auth.isLoggedIn || auth.loading) return null;
    subscriptionStore.invalidateCache();
    const data = await subscriptionStore.fetchCurrentSubscription(true);
    return data?.subscription?.paymentStatus || null;
  };

  const runPendingPolling = async () => {
    if (!auth.isLoggedIn || auth.loading) return;
    if (activePollingPromise) return activePollingPromise;

    activePollingPromise = (async () => {
      const result = await runSubscriptionShortPolling(async () => {
        const data = await subscriptionStore.fetchCurrentSubscription(true);
        return data?.subscription?.paymentStatus || null;
      });

      if (result.status === 'active') {
        await subscriptionStore.fetchUsage(true).catch(() => {
          // Ошибки фонового обновления usage не блокируют flow.
        });
        await refreshBillingAccessSnapshot();
      }
    })().finally(() => {
      activePollingPromise = null;
    });

    return activePollingPromise;
  };

  const syncAfterPaymentReturn = async () => {
    const status = await refreshSubscriptionOnce().catch(() => null);
    if (status === 'active') {
      await refreshBillingAccessSnapshot();
    }
    if (status === 'pending') {
      await runPendingPolling().catch(() => {
        // Игнорируем ошибки polling в фоне.
      });
    }
  };

  const isSubscriptionRouteActive = (): boolean => {
    const currentPath = String(router.currentRoute.value.path || '').trim();
    return (
      currentPath === '/subscription' || currentPath.endsWith('/subscription')
    );
  };

  const runDeepLinkSyncOnce = async () => {
    if (activeDeepLinkSyncPromise) {
      return activeDeepLinkSyncPromise;
    }

    activeDeepLinkSyncPromise = syncAfterPaymentReturn()
      .catch(() => {
        // Ошибки sync/polling в обработчике deeplink не должны ломать UX.
      })
      .finally(() => {
        activeDeepLinkSyncPromise = null;
      });

    return activeDeepLinkSyncPromise;
  };

  if (typeof window !== 'undefined') {
    // Динамически импортируем Capacitor App, если доступен
    import('@capacitor/app')
      .then(({ App }) => {
        App.addListener('appUrlOpen', ({ url }) => {
          // Deep link возврат после оплаты:
          // mentala://payment-success?... или universal link с этим path.
          if (!url || !/payment-success/i.test(url)) {
            return;
          }

          window.dispatchEvent(
            new CustomEvent('mentala:payment-return', {
              detail: { url },
            })
          );

          // На /subscription страница сама запускает polling по mentala:payment-return.
          // Здесь избегаем дублирования глобального sync.
          if (isSubscriptionRouteActive()) {
            return;
          }

          void runDeepLinkSyncOnce();
        });
      })
      .catch(() => {
        // Capacitor недоступен (веб-версия), это нормально
      });
  }
});
