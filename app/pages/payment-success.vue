<template>
  <div class="min-h-screen px-4 py-8">
    <div
      class="mx-auto max-w-xl rounded-2xl border border-border glass-deep p-6"
    >
      <p class="text-sm text-foreground">
        Завершаем возврат после оплаты. Если переход не произошёл автоматически,
        нажмите «К подписке».
      </p>
      <button
        type="button"
        class="mt-4 inline-flex items-center justify-center rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-primary-ui/10"
        @click="goToSubscription"
      >
        К подписке
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Capacitor } from '@capacitor/core';
import { computed, onMounted } from 'vue';

const route = useRoute();

function readQueryValue(key: string): string | null {
  const raw = route.query[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const normalized = String(value || '').trim();
  return normalized ? normalized : null;
}

function isTruthyFlag(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function normalizeBillingPeriod(value: string | null): 'month' | 'year' | null {
  return value === 'month' || value === 'year' ? value : null;
}

const subscriptionRoute = computed(() => {
  const flow = (readQueryValue('flow') || '').toLowerCase();
  const bindReturn =
    isTruthyFlag(readQueryValue('bindReturn')) || flow === 'bind';
  const paymentReturn =
    isTruthyFlag(readQueryValue('paymentReturn')) || flow === 'payment';

  const query: Record<string, string> = {};

  // Нормализуем флаги в контракт страницы подписок.
  if (bindReturn) {
    query.bindReturn = '1';
  }
  if (paymentReturn || !bindReturn) {
    query.paymentReturn = '1';
  }

  const subscriptionId = readQueryValue('subscriptionId');
  if (subscriptionId && Number.isFinite(Number(subscriptionId))) {
    query.subscriptionId = subscriptionId;
  }

  const bindingSessionId = readQueryValue('bindingSessionId');
  if (bindingSessionId) {
    query.bindingSessionId = bindingSessionId;
  }

  const plan = readQueryValue('plan');
  if (plan) {
    query.plan = plan;
  }

  const billingPeriod = normalizeBillingPeriod(readQueryValue('billingPeriod'));
  if (billingPeriod) {
    query.billingPeriod = billingPeriod;
  }

  if (isTruthyFlag(readQueryValue('externalFlow'))) {
    query.externalFlow = '1';
  }

  return {
    path: '/subscription',
    query,
  };
});

const shouldAttemptNativeSchemeFallback = computed(() => {
  if (Capacitor.isNativePlatform()) return false;
  return (
    isTruthyFlag(readQueryValue('nativeApp')) ||
    isTruthyFlag(readQueryValue('externalFlow'))
  );
});

const schemeFallbackUrl = computed(() => {
  const params = new URLSearchParams(subscriptionRoute.value.query);
  const search = params.toString();
  return search
    ? `mentala://payment-success?${search}`
    : 'mentala://payment-success';
});

async function goToSubscription() {
  await navigateTo(subscriptionRoute.value, { replace: true });
}

onMounted(async () => {
  if (
    shouldAttemptNativeSchemeFallback.value &&
    typeof window !== 'undefined'
  ) {
    // Fallback для сценариев, где Universal/App Links не сработали:
    // пробуем открыть приложение через custom scheme и затем идем в web-flow.
    window.location.href = schemeFallbackUrl.value;
    await new Promise((resolve) => {
      setTimeout(resolve, 1200);
    });
  }

  await goToSubscription();
});
</script>
