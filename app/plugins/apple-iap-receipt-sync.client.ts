/**
 * Фоновая синхронизация Apple IAP транзакций (MVP без полного ASN v2 покрытия).
 *
 * Идея: когда ASN v2 еще не покрывает все edge-cases,
 * при открытии приложения периодически отправляем текущие entitlements на backend,
 * чтобы актуализировать доступ после renew/refund/revoke.
 */

import { Capacitor } from '@capacitor/core';
import { watch } from 'vue';
import { defineNuxtPlugin } from 'nuxt/app';
import { useAppleIap } from '@/app/composables/useAppleIap';
import { useEntitlements } from '@/app/composables/useEntitlements';
import { useAuthStore } from '@/app/stores/auth';
import { useSubscriptionStore } from '@/app/stores/subscription';

const SYNC_THROTTLE_MS = 6 * 60 * 60 * 1000; // раз в 6 часов
const STORAGE_PREFIX = 'mentai.apple_iap.entitlements_sync_at';

function readNumber(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function readLastSyncAt(key: string): number | null {
  if (typeof window === 'undefined') return null;
  try {
    return readNumber(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function writeLastSyncAt(key: string, ts: number) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, String(ts));
  } catch {
    // ignore
  }
}

export default defineNuxtPlugin({
  name: 'apple-iap-receipt-sync',
  // Важно: гарантируем, что Pinia уже инициализирована.
  dependsOn: ['pinia'],
  setup() {
    if (process.server) return;

    const isNativeIos =
      Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
    if (!isNativeIos) return;

    const auth = useAuthStore();
    const subscriptionStore = useSubscriptionStore();
    const { refreshEntitlements } = useEntitlements();
    const appleIap = useAppleIap();

    let activeSyncPromise: Promise<void> | null = null;

    const runAppleIapSyncOnce = async (reason: string): Promise<void> => {
      if (!auth.isLoggedIn || auth.loading) return;
      const userId = auth.user?.id;
      if (!userId) return;

      const storageKey = `${STORAGE_PREFIX}:${userId}`;
      const lastSyncAt = readLastSyncAt(storageKey);
      const nowMs = Date.now();

      if (lastSyncAt && nowMs - lastSyncAt < SYNC_THROTTLE_MS) {
        return;
      }

      if (activeSyncPromise) {
        return await activeSyncPromise;
      }

      activeSyncPromise = (async () => {
        try {
          let billingProviderHint =
            subscriptionStore.subscriptionData?.billingProviderHint || null;

          // Финальное решение по flow принимает backend.
          if (!billingProviderHint) {
            try {
              await subscriptionStore.refreshSubscription();
              billingProviderHint =
                subscriptionStore.subscriptionData?.billingProviderHint || null;
            } catch {
              // ignore
            }
          }

          // Для RU-flow (YooKassa) Apple sync не запускаем.
          if (billingProviderHint === 'yookassa') return;

          const result = await appleIap.syncReceipt();
          if (!result) return;

          try {
            await subscriptionStore.refreshSubscription();
          } catch {
            // ignore
          }

          try {
            await refreshEntitlements();
          } catch {
            // Ошибки entitlement-refresh не должны ломать фоновый sync.
          }
          writeLastSyncAt(storageKey, Date.now());
        } catch (error) {
          console.warn('[AppleIapBackgroundSync] failed:', { reason, error });
          // Не записываем timestamp при ошибке, чтобы следующая попытка
          // (resume/auth-ready) могла повторить sync без ожидания 6 часов.
        } finally {
          activeSyncPromise = null;
        }
      })();

      return await activeSyncPromise;
    };

    // Стартовый sync после того, как auth готов.
    watch(
      () => [auth.isLoggedIn, auth.loading],
      ([loggedIn, loading]) => {
        if (!loggedIn || loading) return;
        void runAppleIapSyncOnce('auth-ready');
      },
      { immediate: true }
    );

    // Sync при возврате в foreground.
    if (typeof window !== 'undefined') {
      void (async () => {
        try {
          const { App } = await import('@capacitor/app');
          App.addListener('appStateChange', ({ isActive }) => {
            if (!isActive) return;
            void runAppleIapSyncOnce('resume');
          });
        } catch {
          // Capacitor недоступен (web-версия), это нормально.
        }
      })();
    }
  },
});
