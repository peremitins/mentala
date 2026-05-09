/**
 * Plugin для синхронизации данных подписки по оплатным событиям.
 * Не делает foreground-sync при обычном переключении вкладок/окна.
 */

import { useSubscriptionStore } from '@/app/stores/subscription';
import { useAuthStore } from '@/app/stores/auth';
import { runSubscriptionShortPolling } from '@/app/lib/subscriptionPolling';
import { useEntitlements } from '@/app/composables/useEntitlements';

const PAYMENT_SUCCESS_PATH = '/payment-success';
const SUBSCRIPTION_PATH = '/subscription';
const EXTERNAL_SESSION_CONSUME_PATH = '/auth/external-session/consume';

function normalizePathname(pathname: string): string {
  const normalized = String(pathname || '').trim();
  if (!normalized || normalized === '/') return '/';
  return normalized.replace(/\/+$/, '');
}

function isTruthyFlag(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function hasPaymentReturnMarker(searchParams: URLSearchParams): boolean {
  const flow = String(searchParams.get('flow') || '')
    .trim()
    .toLowerCase();
  return (
    flow === 'payment' ||
    flow === 'bind' ||
    isTruthyFlag(searchParams.get('paymentReturn')) ||
    isTruthyFlag(searchParams.get('bindReturn'))
  );
}

function sanitizeRelativePath(rawPath: string | null): string | null {
  const normalized = String(rawPath || '').trim();
  if (!normalized.startsWith('/')) return null;
  if (normalized.startsWith('//')) return null;
  return normalized;
}

function buildPaymentSuccessPath(searchParams: URLSearchParams): string {
  const next = new URLSearchParams();

  const flowRaw = String(searchParams.get('flow') || '')
    .trim()
    .toLowerCase();
  if (flowRaw === 'payment' || flowRaw === 'bind') {
    next.set('flow', flowRaw);
  }

  if (isTruthyFlag(searchParams.get('paymentReturn'))) {
    next.set('paymentReturn', '1');
  }
  if (isTruthyFlag(searchParams.get('bindReturn'))) {
    next.set('bindReturn', '1');
  }

  const subscriptionIdRaw = String(
    searchParams.get('subscriptionId') || ''
  ).trim();
  if (subscriptionIdRaw && Number.isFinite(Number(subscriptionIdRaw))) {
    next.set('subscriptionId', subscriptionIdRaw);
  }

  const bindingSessionId = String(
    searchParams.get('bindingSessionId') || ''
  ).trim();
  if (bindingSessionId) {
    next.set('bindingSessionId', bindingSessionId);
  }

  const plan = String(searchParams.get('plan') || '').trim();
  if (plan) {
    next.set('plan', plan);
  }

  const billingPeriod = String(searchParams.get('billingPeriod') || '').trim();
  if (billingPeriod === 'month' || billingPeriod === 'year') {
    next.set('billingPeriod', billingPeriod);
  }

  if (isTruthyFlag(searchParams.get('externalFlow'))) {
    next.set('externalFlow', '1');
  }
  if (isTruthyFlag(searchParams.get('nativeApp'))) {
    next.set('nativeApp', '1');
  }

  if (!next.has('bindReturn') && !next.has('paymentReturn')) {
    if (flowRaw === 'bind') {
      next.set('bindReturn', '1');
    } else {
      next.set('paymentReturn', '1');
    }
  }

  const queryString = next.toString();
  return queryString
    ? `${PAYMENT_SUCCESS_PATH}?${queryString}`
    : PAYMENT_SUCCESS_PATH;
}

function resolvePaymentReturnPath(rawUrl: string): string | null {
  const normalizedRawUrl = String(rawUrl || '').trim();
  if (!normalizedRawUrl) return null;

  let parsed: URL;
  try {
    parsed = new URL(normalizedRawUrl);
  } catch {
    return null;
  }

  const pathname = normalizePathname(parsed.pathname);
  const protocol = String(parsed.protocol || '').toLowerCase();
  const host = String(parsed.host || '').toLowerCase();

  // Custom scheme fallback: mentala://payment-success?... .
  if (protocol === 'mentala:' && host === 'payment-success') {
    return buildPaymentSuccessPath(parsed.searchParams);
  }

  if (pathname === PAYMENT_SUCCESS_PATH) {
    return buildPaymentSuccessPath(parsed.searchParams);
  }

  if (
    pathname === SUBSCRIPTION_PATH &&
    hasPaymentReturnMarker(parsed.searchParams)
  ) {
    return buildPaymentSuccessPath(parsed.searchParams);
  }

  if (pathname === EXTERNAL_SESSION_CONSUME_PATH) {
    const redirectPath = sanitizeRelativePath(
      parsed.searchParams.get('redirect')
    );
    if (!redirectPath) return null;

    let nested: URL;
    try {
      nested = new URL(redirectPath, parsed.origin);
    } catch {
      return null;
    }

    const nestedPathname = normalizePathname(nested.pathname);
    if (nestedPathname === PAYMENT_SUCCESS_PATH) {
      return buildPaymentSuccessPath(nested.searchParams);
    }

    if (
      nestedPathname === SUBSCRIPTION_PATH &&
      hasPaymentReturnMarker(nested.searchParams)
    ) {
      return buildPaymentSuccessPath(nested.searchParams);
    }
  }

  return null;
}

export default defineNuxtPlugin({
  name: 'subscription-sync',
  dependsOn: ['pinia'],
  setup() {
    // Работаем только на клиенте
    if (process.server) return;

    const subscriptionStore = useSubscriptionStore();
    const auth = useAuthStore();
    const router = useRouter();
    const { refreshEntitlements } = useEntitlements();
    let activePollingPromise: Promise<void> | null = null;
    let activeDeepLinkSyncPromise: Promise<void> | null = null;

    const refreshBillingAccessSnapshot = async () => {
      if (!auth.isLoggedIn || auth.loading || auth._isLogoutQuietPeriod())
        return;
      await refreshEntitlements().catch(() => {
        // Ошибки entitlement-refresh не должны ломать фоновой sync.
      });
      await auth.me().catch(() => {
        // Ошибки полного user-refresh не должны ломать фоновой sync.
      });
    };

    const refreshSubscriptionOnce = async () => {
      if (!auth.isLoggedIn || auth.loading || auth._isLogoutQuietPeriod()) {
        return null;
      }
      subscriptionStore.invalidateCache();
      const data = await subscriptionStore.fetchCurrentSubscription(true);
      return data?.subscription?.paymentStatus || null;
    };

    const runPendingPolling = async () => {
      if (!auth.isLoggedIn || auth.loading || auth._isLogoutQuietPeriod())
        return;
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
            const paymentReturnPath = resolvePaymentReturnPath(url);
            if (!paymentReturnPath) {
              return;
            }

            const currentFullPath = String(
              router.currentRoute.value.fullPath || ''
            );
            if (currentFullPath === paymentReturnPath) {
              void runDeepLinkSyncOnce();
              return;
            }

            void router.replace(paymentReturnPath).catch((error) => {
              console.warn(
                '[SubscriptionSync] Failed to route deep link payment return path:',
                error
              );
              void runDeepLinkSyncOnce();
            });
          });
        })
        .catch(() => {
          // Capacitor недоступен (веб-версия), это нормально
        });
    }
  },
});
