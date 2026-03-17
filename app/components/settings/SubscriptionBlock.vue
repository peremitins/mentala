<template>
  <div class="glass-deep p-4 space-y-3">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-semibold">Подписка</h3>
      <span v-if="subscription?.plan?.name === 'premium'" class="text-lg"
        >⭐</span
      >
    </div>

    <!-- Скелетон при загрузке -->
    <div v-if="loading" class="space-y-3 animate-slide-up">
      <div class="space-y-2">
        <div class="h-4 bg-skeleton rounded w-2/3"></div>
        <div class="h-3 bg-skeleton rounded w-1/2"></div>
      </div>
      <div class="h-10 bg-skeleton rounded-md w-full"></div>
    </div>

    <div v-else-if="subscription" class="space-y-2">
      <div>
        <p class="text-sm font-medium">{{ planName }}</p>

        <!-- Информация о пробном периоде -->
        <div
          v-if="
            subscriptionData?.trialActive &&
            subscriptionData?.currentEntitlementsPlan === 'premium' &&
            subscription?.plan?.id === 'basic'
          "
          class="mt-2 space-y-1"
        >
          <p class="text-xs text-foreground">
            Действует до:
            {{ formatTrialDate(subscriptionData.trialEndsAt) }}
          </p>
        </div>

        <!-- Обычная информация о подписке -->
        <template v-else>
          <p
            v-if="subscription.paymentStatus === 'pending'"
            class="text-xs text-yellow-600 font-medium mt-1"
          >
            ⏳ Ожидает оплаты
          </p>
          <p
            v-else-if="subscription.paymentStatus === 'active'"
            class="text-xs text-foreground mt-1"
          >
            <template v-if="subscription.plan.name === 'basic'">
              Бесплатный план без срока окончания
            </template>
            <template v-else>
              Действует до: {{ formatDate(subscription.endDate) }}
            </template>
          </p>
          <p
            v-else-if="subscription.paymentStatus === 'expired'"
            class="text-xs text-foreground mt-1"
          >
            Истекла: {{ formatDate(subscription.endDate) }}
          </p>
          <p v-else class="text-xs text-foreground mt-1">
            Статус:
            {{ getPaymentStatusText(subscription.paymentStatus) }}
          </p>
        </template>
      </div>

      <!-- Прогресс-бар использования минут (только если есть доступ к ИИ) -->
      <div v-if="shouldShowProgressBar" class="space-y-1">
        <div class="flex items-center justify-between text-xs">
          <span class="text-foreground">Использовано:</span>
          <span class="font-medium">
            {{ usage?.usedMinutes || 0 }} из {{ weeklyMinutesLimitValue }} минут
            на этой неделе
          </span>
        </div>
        <div class="h-2 w-full rounded-full bg-primary-ui/20 overflow-hidden">
          <div
            class="h-full transition-all duration-300"
            :class="
              getProgressBarColor(
                usage?.usedMinutes || 0,
                weeklyMinutesLimitValue
              )
            "
            :style="{
              width: `${Math.min(100, ((usage?.usedMinutes || 0) / weeklyMinutesLimitValue) * 100)}%`,
            }"
          />
        </div>
        <p class="text-xs text-muted-foreground">
          Лимит обновится в понедельник.
        </p>
      </div>

      <!-- Информация о недоступности функционала (когда лимит = 0) -->
      <div
        v-if="shouldShowNoAccessInfo"
        class="rounded-md bg-muted/50 border border-border p-3 space-y-2"
      >
        <p class="text-xs text-muted-foreground">
          На тарифе Basic функционал ограничен. Выберите тариф PRO или Premium,
          чтобы открыть расширенные возможности приложения.
        </p>
      </div>

      <Button
        type="button"
        variant="outline"
        class="w-fit border-white/20 bg-white/5 text-foreground hover:border-white/35 hover:bg-white/10 hover:text-foreground"
        :disabled="openingExternalFlow"
        @click="handleManageSubscription"
      >
        {{ actionButtonLabel }}
      </Button>
    </div>

    <div v-else class="space-y-2">
      <p class="text-sm text-foreground">Текущий план: нет активной подписки</p>
      <Button
        type="button"
        variant="outline"
        class="w-fit border-white/20 bg-white/5 text-foreground hover:border-white/35 hover:bg-white/10 hover:text-foreground"
        :disabled="openingExternalFlow"
        @click="handleManageSubscription"
      >
        {{ actionButtonLabel }}
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Capacitor } from '@capacitor/core';
import { useNow } from '@vueuse/core';
import { computed, onMounted, ref } from 'vue';
import { useAPI } from '@/app/composables/useAPI';
import { Button } from '@/app/components/ui/button';
import { useExternalFlowAppUrl } from '@/app/composables/useExternalFlowAppUrl';
import { usePlatform } from '@/app/composables/usePlatform';
import { useSubscriptionStore } from '@/app/stores/subscription';
import { useToast } from '@/app/composables/useToast';
import {
  formatTrialCountdown,
  getTrialCountdown,
} from '@/app/utils/trialCountdown';

const subscriptionStore = useSubscriptionStore();
const { platform } = usePlatform();
const externalFlowAppUrl = useExternalFlowAppUrl();
const openingExternalFlow = ref(false);
const now = useNow({ interval: 60_000 });

// Computed для удобства доступа
const subscription = computed(() => subscriptionStore.currentSubscription);
const subscriptionData = computed(() => subscriptionStore.subscriptionData);
const usage = computed(() => subscriptionStore.usage);
const loading = computed(
  () =>
    subscriptionStore.loading.subscription || subscriptionStore.loading.usage
);
const isNativeIos = computed(
  () => platform.value === 'ios' && Capacitor.isNativePlatform()
);
const actionButtonLabel = computed(() => {
  return isNativeIos.value ? 'Управление подпиской' : 'Управлять подпиской';
});

// Реактивный countdown trial (дни + часы) с пересчетом каждую минуту.
const trialTimeLeftLabel = computed(() => {
  if (
    !subscriptionData.value?.trialActive ||
    !subscriptionData.value?.trialEndsAt
  ) {
    return null;
  }

  const countdown = getTrialCountdown(
    subscriptionData.value.trialEndsAt,
    now.value
  );
  if (!countdown) {
    return null;
  }

  return formatTrialCountdown(countdown);
});

const planName = computed(() => {
  if (!subscription.value) return '—';
  // В trial показываем явный статус пробного Premium, пока базовая подписка еще активна.
  if (
    subscriptionData.value?.trialActive &&
    subscription.value.planId === 'basic'
  ) {
    if (trialTimeLeftLabel.value) {
      return `Пробный период · ${trialTimeLeftLabel.value} осталось`;
    }
    return 'Пробный период';
  }

  const effectivePlanId =
    subscriptionData.value?.currentEntitlementsPlan ||
    subscription.value.planId;
  if (effectivePlanId === 'basic') return 'Basic';
  if (effectivePlanId === 'pro') return 'PRO';
  if (effectivePlanId === 'premium') return 'Premium';
  return effectivePlanId;
});

// Получаем лимит минут из features (учитывает Trial)
const aiChatMode = computed(() => subscriptionStore.aiChatMode);
const weeklyMinutesLimitValue = computed(
  () => subscriptionStore.weeklyMinutesLimit ?? 0
);

// Проверяем, нужно ли показывать прогресс-бар
const shouldShowProgressBar = computed(() => {
  // Показываем прогресс-бар только если:
  // 1. Есть активная подписка
  // 2. Лимит минут > 0 (т.е. есть доступ к ИИ)
  // 3. Есть данные об использовании
  return (
    subscription.value?.paymentStatus === 'active' &&
    aiChatMode.value !== 'disabled' &&
    weeklyMinutesLimitValue.value > 0 &&
    usage.value !== null
  );
});

// Проверяем, нужно ли показывать информацию о недоступности
const shouldShowNoAccessInfo = computed(() => {
  // Показываем информацию о недоступности если:
  // 1. Есть активная подписка
  // 2. Лимит минут = 0 (нет доступа к ИИ)
  return (
    subscription.value?.paymentStatus === 'active' &&
    aiChatMode.value === 'disabled'
  );
});

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatTrialDate(dateString: string | null) {
  if (!dateString) return '—';
  const date = new Date(dateString);
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function getProgressBarColor(used: number, limit: number) {
  const percentage = (used / limit) * 100;
  if (percentage >= 100) return 'bg-destructive';
  if (percentage >= 90) return 'bg-yellow-500';
  return 'bg-primary';
}

function getPaymentStatusText(status: string) {
  const statusMap: Record<string, string> = {
    pending: 'Ожидает оплаты',
    active: 'Активна',
    expired: 'Истекла',
    canceled: 'Отменена',
  };
  return statusMap[status] || status;
}

async function openExternalBrowser(url: string) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const { InAppBrowser } = await import('@capacitor/inappbrowser');
    await InAppBrowser.openInExternalBrowser({ url });
  } catch (error) {
    // Fallback для окружений без нативного плагина.
    console.warn(
      '[SubscriptionBlock] openInExternalBrowser unavailable, using window.open fallback:',
      error
    );
    window.open(url, '_blank');
  }
}

async function handleManageSubscription() {
  if (!isNativeIos.value) {
    await navigateTo('/subscription');
    return;
  }

  if (openingExternalFlow.value) {
    return;
  }

  openingExternalFlow.value = true;
  try {
    const response = await useAPI<{
      consumeUrl: string;
      expiresAt: string;
      ttlSeconds: number;
    }>('/api/auth/external-session/create', {
      method: 'POST',
      body: {
        redirectPath: '/subscription',
        appUrl: externalFlowAppUrl.value || undefined,
      },
    });

    const consumeUrl = String(response?.consumeUrl || '').trim();
    if (!consumeUrl) {
      throw new Error('Missing consumeUrl');
    }

    await openExternalBrowser(consumeUrl);
    useToast(
      'Открываем веб-версию',
      'Управление подпиской продолжится во внешнем браузере.',
      'info'
    );
  } catch (error: any) {
    console.error('Failed to open external subscription flow:', error);
    useToast(
      'Не удалось открыть браузер',
      error?.message || 'Попробуйте еще раз.',
      'error'
    );
  } finally {
    openingExternalFlow.value = false;
  }
}

onMounted(async () => {
  // Загружаем данные через store (с кэшированием)
  await Promise.allSettled([
    subscriptionStore.fetchCurrentSubscription(),
    subscriptionStore.fetchUsage(),
  ]);
});
</script>
