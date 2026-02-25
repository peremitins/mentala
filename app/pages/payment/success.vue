<template>
  <div class="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
    <div
      class="mx-auto max-w-xl rounded-2xl border border-border glass-deep p-6 space-y-4"
    >
      <h1 class="text-2xl font-semibold">Оплата обрабатывается</h1>

      <p v-if="status === 'active'" class="text-sm text-foreground">
        Подписка успешно активирована. Можно вернуться в приложение.
      </p>
      <p
        v-else-if="status === 'canceled' || status === 'expired'"
        class="text-sm text-foreground"
      >
        Платеж не завершен. Проверьте данные оплаты и попробуйте еще раз.
      </p>
      <p v-else class="text-sm text-foreground">
        Мы получили информацию об оплате и обновляем статус подписки. Если
        обновление задерживается, нажмите «Проверить статус».
      </p>

      <div
        class="rounded-lg border border-border/80 bg-background/20 p-3 text-xs text-foreground/80"
      >
        <p>
          {{
            checkingStatus
              ? 'Проверяем статус подписки...'
              : `Текущий статус: ${statusText}`
          }}
        </p>
        <p v-if="subscriptionId" class="mt-1">
          Номер подписки: {{ subscriptionId }}
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          :disabled="checkingStatus"
          class="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-primary-ui/10 disabled:opacity-60 disabled:cursor-not-allowed"
          @click="checkStatus"
        >
          {{ checkingStatus ? 'Проверяем...' : 'Проверить статус' }}
        </button>

        <a
          v-if="showReturnToAppButton"
          :href="deepLinkUrl"
          class="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Вернуться в приложение
        </a>

        <NuxtLink
          v-else
          to="/subscription"
          class="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          К подписке
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useAPI } from '@/app/composables/useAPI';
import { runSubscriptionShortPolling } from '@/app/lib/subscriptionPolling';

type PaymentPageStatus =
  | 'active'
  | 'pending'
  | 'canceled'
  | 'expired'
  | 'timeout'
  | 'unknown';

interface CheckPaymentStatusResponse {
  localStatus: string | null;
  paymentStatus: string | null;
  providerStatus: string | null;
  paid: boolean;
  shouldContinuePolling: boolean;
}

const route = useRoute();

const checkingStatus = ref(false);
const status = ref<PaymentPageStatus>('pending');

const subscriptionId = computed(() => {
  const raw = route.query.subscriptionId;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  return String(value);
});
const subscriptionIdNumber = computed(() => {
  if (!subscriptionId.value) return null;
  const parsed = Number(subscriptionId.value);
  return Number.isFinite(parsed) ? parsed : null;
});

const deepLinkUrl = computed(() => {
  const base = 'mentala://payment-success';
  if (!subscriptionId.value) return base;
  return `${base}?subscriptionId=${encodeURIComponent(subscriptionId.value)}`;
});

const isExternalFlow = computed(() => {
  const raw = route.query.externalFlow;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === '1' || value === 'true';
});

const showReturnToAppButton = computed(() => {
  if (!isExternalFlow.value) return false;
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod|android/i.test(navigator.userAgent);
});

const statusText = computed(() => {
  if (status.value === 'active') return 'active';
  if (status.value === 'pending') return 'pending';
  if (status.value === 'canceled') return 'canceled';
  if (status.value === 'expired') return 'expired';
  if (status.value === 'timeout') return 'pending (timeout polling)';
  return 'unknown';
});

async function checkStatus() {
  if (checkingStatus.value) return;
  checkingStatus.value = true;

  try {
    const result = await runSubscriptionShortPolling(async () => {
      const verification = await useAPI<CheckPaymentStatusResponse>(
        '/api/subscriptions/check-payment-status',
        {
          method: 'GET',
          query: {
            subscriptionId: subscriptionIdNumber.value || undefined,
          },
        }
      );

      if (
        verification?.providerStatus === 'succeeded' &&
        verification?.paid === true
      ) {
        return 'active';
      }

      if (
        verification?.providerStatus === 'canceled' ||
        verification?.providerStatus === 'expired'
      ) {
        return 'canceled';
      }

      const resolvedStatus =
        verification?.paymentStatus || verification?.localStatus;
      if (
        resolvedStatus === 'active' ||
        resolvedStatus === 'pending' ||
        resolvedStatus === 'canceled' ||
        resolvedStatus === 'expired'
      ) {
        return resolvedStatus;
      }

      if (verification?.shouldContinuePolling === false) {
        return 'unknown';
      }

      return 'pending';
    });

    if (
      result.status === 'active' ||
      result.status === 'canceled' ||
      result.status === 'expired'
    ) {
      status.value = result.status;
      return;
    }

    status.value = result.status === 'timeout' ? 'timeout' : 'pending';
  } catch {
    status.value = 'unknown';
  } finally {
    checkingStatus.value = false;
  }
}

onMounted(async () => {
  await checkStatus();
});
</script>
