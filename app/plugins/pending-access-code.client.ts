import { defineNuxtPlugin } from 'nuxt/app';
import { watch } from 'vue';
import { useAuthStore } from '@/app/stores/auth';
import { useSubscriptionStore } from '@/app/stores/subscription';
import {
  normalizePendingAccessCode,
  usePendingAccessCode,
} from '@/app/composables/usePendingAccessCode';
import { useToast } from '@/app/composables/useToast';

function extractErrorMessage(error: any) {
  return (
    error?.data?.statusMessage ||
    error?.data?.message ||
    error?.message ||
    'Не удалось активировать код после входа'
  );
}

function extractErrorStatus(error: any): number | null {
  const candidates = [
    error?.statusCode,
    error?.status,
    error?.response?.status,
    error?.data?.statusCode,
  ];
  for (const value of candidates) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) {
      return num;
    }
  }
  return null;
}

// Финальный провал: 4xx (кроме 408/429) означает, что код нерабочий
// и повторные ретраи не помогут — пользователю нужно сообщить, а код убрать.
// Transient ошибки (5xx, network, 408 Timeout, 429 Rate limit) оставляют
// код в cookie: следующий заход или refresh повторит попытку.
function isFinalActivationFailure(error: any): boolean {
  const status = extractErrorStatus(error);
  if (status == null) {
    // network / CORS / parse — считаем transient, ретраим в будущем.
    return false;
  }
  if (status >= 500) {
    return false;
  }
  if (status === 408 || status === 429) {
    return false;
  }
  return status >= 400 && status < 500;
}

export default defineNuxtPlugin({
  name: 'pending-access-code',
  dependsOn: ['pinia'],
  setup() {
    if (process.server) return;

    const auth = useAuthStore();
    const subscriptionStore = useSubscriptionStore();
    const { pendingAccessCode, clearPendingAccessCode } =
      usePendingAccessCode();
    const toast = useToast;
    let processingPromise: Promise<void> | null = null;

    const processPendingAccessCode = async () => {
      const code = normalizePendingAccessCode(pendingAccessCode.value);
      if (
        !code ||
        code.length < 3 ||
        !auth.isLoggedIn ||
        !auth.user?.id ||
        processingPromise
      ) {
        return processingPromise;
      }

      processingPromise = (async () => {
        try {
          const response = await useAPI<{
            kind: 'promo' | 'referral';
            message?: string;
          }>('/api/access-codes/redeem', {
            method: 'POST',
            body: { code },
            // Для post-auth фоновой активации показываем только наш доменный toast,
            // а общий API-toast подавляем, чтобы не было дублей.
            suppressErrorToast: true,
          });

          clearPendingAccessCode();

          const toastTitle =
            response?.kind === 'referral'
              ? 'Код активирован'
              : 'Промокод применён';
          toast(
            toastTitle,
            response?.message || 'Код успешно активирован.',
            'success'
          );

          subscriptionStore.invalidateCache();
          await Promise.allSettled([
            subscriptionStore.fetchCurrentSubscription(true),
            auth.me(),
          ]);
        } catch (error: any) {
          if (isFinalActivationFailure(error)) {
            // 4xx — код реально невалиден (не найден/занят/просрочен/заблокирован).
            // Чистим cookie, чтобы не спамить ретраями на каждой навигации.
            clearPendingAccessCode();
            toast('Код не активирован', extractErrorMessage(error), 'warning');
          } else {
            // Transient — оставляем код, попробуем в следующий раз.
            // Тост показываем тихий, чтобы пользователь знал что проблема временная.
            toast(
              'Не удалось применить код',
              'Проблема со связью — попробуем снова при следующем входе.',
              'info'
            );
          }
        } finally {
          processingPromise = null;
        }
      })();

      return processingPromise;
    };

    watch(
      () => auth.user?.id,
      (userId) => {
        if (userId) {
          void processPendingAccessCode();
        }
      },
      { immediate: true }
    );
  },
});
