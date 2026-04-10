<template>
  <div class="glass-deep p-4 space-y-3">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-semibold">Подписка</h3>
      <span v-if="subscription?.plan?.name === 'premium'" class="text-lg"
        >⭐</span
      >
    </div>

    <div
      v-if="shouldHideIosReviewBillingUi"
      class="rounded-md border border-white/10 bg-white/5 p-3 animate-slide-up"
    >
      <p class="text-xs text-muted-foreground mt-1">
        Для внесения изменений в тарифный план воспользуйтесь веб-версией
        сервиса.
      </p>
    </div>

    <!-- Скелетон при загрузке -->
    <div v-else-if="loading" class="space-y-3 animate-slide-up">
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

      <!-- Недельный прогресс-бар использования AI-чата -->
      <div v-if="shouldShowWeeklyProgressBar" class="space-y-1">
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
              width: `${getProgressPercent(usage?.usedMinutes || 0, weeklyMinutesLimitValue)}%`,
            }"
          />
        </div>
        <p class="text-xs text-muted-foreground">
          Лимит обновится в понедельник.
        </p>
      </div>

      <!-- Отдельный лимит realtime voice -->
      <div
        v-if="shouldShowRealtimeVoiceProgressBar"
        class="space-y-1 border-t border-white/10 pt-3 mt-3"
      >
        <div class="flex items-center justify-between text-xs">
          <span class="text-foreground">Голосовой диалог:</span>
          <span class="font-medium">
            {{
              formatRealtimeVoiceDuration(realtimeVoiceUsage?.usedSeconds || 0)
            }}
            из
            {{
              formatRealtimeVoiceDuration(realtimeVoiceUsage?.limitSeconds || 0)
            }}
            в текущем периоде
          </span>
        </div>
        <div class="h-2 w-full rounded-full bg-primary-ui/20 overflow-hidden">
          <div
            class="h-full transition-all duration-300"
            :class="
              getProgressBarColor(
                realtimeVoiceUsage?.usedSeconds || 0,
                realtimeVoiceUsage?.limitSeconds || 0
              )
            "
            :style="{
              width: `${getProgressPercent(
                realtimeVoiceUsage?.usedSeconds || 0,
                realtimeVoiceUsage?.limitSeconds || 0
              )}%`,
            }"
          />
        </div>
        <p class="text-xs text-muted-foreground">
          Осталось
          {{
            formatRealtimeVoiceDuration(
              realtimeVoiceUsage?.remainingSeconds || 0
            )
          }}. Следующее обновление:
          {{ formatDate(realtimeVoiceUsage?.resetsAt || '') }}.
        </p>
      </div>

      <!-- Информация о недоступности функционала (когда лимит = 0) -->
      <div
        v-if="shouldShowNoAccessInfo"
        class="rounded-md bg-muted/50 border border-border p-3 space-y-2"
      >
        <p class="text-xs text-muted-foreground">{{ limitedAccessLabel }}</p>
      </div>

      <Button
        v-if="!shouldHideIosReviewBillingUi"
        type="button"
        variant="outline"
        class="w-fit border-white/20 bg-white/5 text-foreground hover:border-white/35 hover:bg-white/10 hover:text-foreground"
        @click="handleManageSubscription"
      >
        {{ actionButtonLabel }}
      </Button>
    </div>

    <div v-else class="space-y-2">
      <p class="text-sm text-foreground">Текущий план: нет активной подписки</p>
      <Button
        v-if="!shouldHideIosReviewBillingUi"
        type="button"
        variant="outline"
        class="w-fit border-white/20 bg-white/5 text-foreground hover:border-white/35 hover:bg-white/10 hover:text-foreground"
        @click="handleManageSubscription"
      >
        {{ actionButtonLabel }}
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useNow } from '@vueuse/core';
import { computed, onMounted } from 'vue';
import { useIosReviewBillingUi } from '@/app/composables/useIosReviewBillingUi';
import { useSubscriptionStore } from '@/app/stores/subscription';
import { useEntitlements } from '@/app/composables/useEntitlements';
import {
  getLocalizedPlanName,
  getLocalizedTrialPlanLabel,
} from '@/app/utils/planI18n';
import {
  formatTrialCountdown,
  getTrialCountdown,
} from '@/app/utils/trialCountdown';
import { useI18n } from 'vue-i18n';

const subscriptionStore = useSubscriptionStore();
const { t } = useI18n();
const { getFeatureAccess } = useEntitlements();
const { shouldHideIosReviewBillingUi } = useIosReviewBillingUi();
const now = useNow({ interval: 60_000 });

// Computed для удобства доступа
const subscription = computed(() => subscriptionStore.currentSubscription);
const subscriptionData = computed(() => subscriptionStore.subscriptionData);
const usage = computed(() => subscriptionStore.usage);
const realtimeVoiceUsage = computed(() => usage.value?.realtimeVoice ?? null);
const loading = computed(
  () =>
    subscriptionStore.loading.subscription || subscriptionStore.loading.usage
);
const actionButtonLabel = computed(() => {
  return 'Управление подпиской';
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
    return getLocalizedTrialPlanLabel(t, trialTimeLeftLabel.value);
  }

  const effectivePlanId =
    subscriptionData.value?.currentEntitlementsPlan ||
    subscription.value.planId;
  return getLocalizedPlanName(effectivePlanId, t);
});

const limitedAccessLabel = computed(() =>
  t('PLANS.BASIC_LIMITED_ACCESS', {
    basic: getLocalizedPlanName('basic', t),
    plans: t('PLANS.PRO_AND_PREMIUM'),
  })
);

// Получаем лимит минут из features (учитывает Trial)
const aiChatMode = computed(() => subscriptionStore.aiChatMode);
const weeklyMinutesLimitValue = computed(
  () => subscriptionStore.weeklyMinutesLimit ?? 0
);

// Проверяем, нужно ли показывать прогресс-бар
const shouldShowWeeklyProgressBar = computed(() => {
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

const shouldShowRealtimeVoiceProgressBar = computed(() => {
  const { available } = getFeatureAccess('chat.realtime_voice');
  return (
    available &&
    subscription.value?.paymentStatus === 'active' &&
    aiChatMode.value !== 'disabled' &&
    realtimeVoiceUsage.value !== null &&
    realtimeVoiceUsage.value.limitSeconds > 0
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
  if (!dateString) return '—';
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
  if (limit <= 0) return 'bg-primary';
  const percentage = (used / limit) * 100;
  if (percentage >= 100) return 'bg-destructive';
  if (percentage >= 90) return 'bg-yellow-500';
  return 'bg-primary';
}

function getProgressPercent(used: number, limit: number) {
  if (limit <= 0) return 0;
  return Math.min(100, (used / limit) * 100);
}

function formatRealtimeVoiceDuration(totalSeconds: number) {
  const normalizedSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(normalizedSeconds / 60);
  const seconds = normalizedSeconds % 60;

  if (minutes <= 0) {
    return `${seconds} сек`;
  }

  if (seconds === 0) {
    return `${minutes} мин`;
  }

  return `${minutes} мин ${seconds} сек`;
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

async function handleManageSubscription() {
  // По требованиям Apple: CTA "Управлять подпиской" всегда ведёт на внутренний экран Subscription.
  await navigateTo('/subscription');
}

onMounted(async () => {
  // Загружаем данные через store (с кэшированием)
  await Promise.allSettled([
    subscriptionStore.fetchCurrentSubscription(),
    subscriptionStore.fetchUsage(),
  ]);
});
</script>
