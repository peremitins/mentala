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
            subscriptionData?.trialActive && subscription.plan.name === 'basic'
          "
          class="mt-2 space-y-1"
        >
          <p class="text-xs text-foreground">
            В пробном периоде доступен полный Premium-доступ
          </p>
          <p class="text-xs text-foreground">
            Пробный период действует до:
            {{ formatTrialDate(subscriptionData.trialExpiresAt) }}
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
        <p class="text-sm font-medium text-foreground">
          Функционал ИИ недоступен
        </p>
        <p class="text-xs text-muted-foreground">
          На тарифе Basic без пробного периода доступны только уведомления с
          шаблонами. Выберите тариф PRO или Premium, чтобы получить доступ к
          ИИ-чату.
        </p>
      </div>

      <NuxtLink
        to="/subscription"
        class="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
      >
        Управлять подпиской
      </NuxtLink>
    </div>

    <div v-else class="space-y-2">
      <p class="text-sm text-foreground">Текущий план: нет активной подписки</p>
      <NuxtLink
        to="/subscription"
        class="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
      >
        Оформить подписку
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useSubscriptionStore } from '@/app/stores/subscription';

const subscriptionStore = useSubscriptionStore();

// Computed для удобства доступа
const subscription = computed(() => subscriptionStore.currentSubscription);
const subscriptionData = computed(() => subscriptionStore.subscriptionData);
const usage = computed(() => subscriptionStore.usage);
const loading = computed(
  () =>
    subscriptionStore.loading.subscription || subscriptionStore.loading.usage
);

// Вычисляем количество дней до окончания Trial
const trialDaysLeft = computed(() => {
  if (
    !subscriptionData.value?.trialActive ||
    !subscriptionData.value?.trialExpiresAt
  ) {
    return null;
  }
  const now = new Date();
  const expiresAt = new Date(subscriptionData.value.trialExpiresAt);
  const diffTime = expiresAt.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
});

const planName = computed(() => {
  if (!subscription.value) return '—';
  const name = subscription.value.plan.name;
  if (name === 'basic') {
    // Если Trial активен, показываем как "Пробный период Premium"
    if (subscriptionData.value?.trialActive) {
      const days = trialDaysLeft.value;
      if (days !== null && days > 0) {
        return `Пробный период Premium · ${days} ${getDaysWord(days)} осталось`;
      }
      return 'Пробный период Premium';
    }
    return 'Basic';
  }
  if (name === 'pro') return 'PRO';
  if (name === 'premium') return 'Premium';
  return name;
});

// Функция для правильного склонения слова "день"
function getDaysWord(days: number): string {
  const lastDigit = days % 10;
  const lastTwoDigits = days % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return 'дней';
  }
  if (lastDigit === 1) {
    return 'день';
  }
  if (lastDigit >= 2 && lastDigit <= 4) {
    return 'дня';
  }
  return 'дней';
}

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

onMounted(async () => {
  // Загружаем данные через store (с кэшированием)
  await Promise.allSettled([
    subscriptionStore.fetchCurrentSubscription(),
    subscriptionStore.fetchUsage(),
  ]);
});
</script>
