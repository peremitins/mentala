<template>
  <div class="space-y-2 h-full overflow-y-auto rounded-lg">
    <PageHeader
      :title="'Управление подпиской'"
      :show-back-button="true"
      @go-back="goBack()"
    />

    <div class="space-y-2 pb-[100px]">
      <div class="" style="animation-delay: 0.1s">
        <p class="text-sm text-muted-foreground">
          Подберите план, который подойдёт именно вам. Вы всегда можете изменить
          его позже.
        </p>
      </div>

      <!-- Текущий статус -->
      <div
        class="transition-[max-height,opacity] duration-300 ease-in-out overflow-hidden"
        :style="{
          maxHeight: subscriptionStore.loading.subscription ? '200px' : '500px',
          animationDelay: '0.2s',
        }"
      >
        <Transition name="fade" mode="out-in">
          <Skeleton
            v-if="subscriptionStore.loading.subscription"
            :count="1"
            rounded-size="lg"
            type="subscription-status"
          />
          <div
            v-else
            key="content"
            class="glass-deep rounded-lg border border-border p-4"
          >
            <div
              v-if="
                currentSubscription && !subscriptionStore.loading.subscription
              "
            >
              <p class="text-sm font-medium">
                <strong>Сейчас:</strong>
                {{ getPlanDisplayName(currentSubscription.plan.name) }}
              </p>

              <!-- Информация о пробном периоде -->
              <div
                v-if="trialActive && currentSubscription.plan.name === 'basic'"
                class="mt-2 space-y-1"
              >
                <p class="text-xs text-foreground">
                  Доступен полный функционал Premium: AI-чат, 100 минут в неделю
                </p>
                <p class="text-xs text-foreground">
                  Пробный период действует до:
                  {{ formatTrialDate(trialExpiresAt) }}
                </p>
              </div>

              <!-- Обычная информация о подписке -->
              <template v-else>
                <p
                  v-if="currentSubscription.paymentStatus === 'pending'"
                  class="text-sm text-yellow-600 font-medium mt-2"
                >
                  ⏳ Ожидает оплаты
                </p>
                <p
                  v-else-if="currentSubscription.paymentStatus === 'active'"
                  class="text-sm text-foreground mt-1"
                >
                  Действует до: {{ formatDate(currentSubscription.endDate) }}
                </p>
                <p
                  v-else-if="currentSubscription.paymentStatus === 'expired'"
                  class="text-sm text-foreground mt-1"
                >
                  Истекла: {{ formatDate(currentSubscription.endDate) }}
                </p>
                <p v-else class="text-sm text-foreground mt-1">
                  Статус:
                  {{ getPaymentStatusText(currentSubscription.paymentStatus) }}
                </p>
                <p
                  v-if="currentSubscription.paymentStatus === 'pending'"
                  class="text-xs text-foreground mt-2"
                >
                  Завершите оплату, чтобы активировать подписку. Если вы уже
                  оплатили, подождите несколько минут — статус обновится
                  автоматически.
                </p>
              </template>
            </div>
            <div
              v-else-if="
                !currentSubscription && !subscriptionStore.loading.subscription
              "
            >
              <p class="text-sm font-medium">
                <strong>Сейчас:</strong> нет активной подписки
              </p>
              <p class="text-sm text-foreground">
                Чтобы продолжить пользоваться Mentala, выберите один из тарифов
                ниже.
              </p>
            </div>
          </div>
        </Transition>
      </div>

      <!-- Карточки тарифов -->
      <div
        v-if="subscriptionStore.loading.plans"
        class="grid grid-cols-1 md:grid-cols-3 gap-2"
      >
        <Skeleton type="plan-card" :count="4" rounded-size="lg" />
      </div>
      <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-2">
        <PlanCard
          v-for="(plan, index) in subscriptionStore.visiblePlans"
          :key="plan.id"
          z
          :plan="plan"
          :billing-period="getBillingPeriod(plan.id)"
          :is-selected="selectedPlanId === plan.id"
          :is-current="isCurrentPlan(plan.id)"
          :trial-active="
            plan.name === 'basic' ? subscriptionStore.trialActive : false
          "
          :style="`animation-delay: ${0.3 + index * 0.1}s`"
          class=""
          @select="selectPlan(plan)"
          @update:billing-period="(period) => setBillingPeriod(plan.id, period)"
          @confirm-change="handlePlanChangeConfirm"
        />
      </div>
    </div>

    <!-- Модалка подтверждения смены тарифа -->
    <AlertDialog
      :open="showConfirmDialog"
      @update:open="showConfirmDialog = $event"
    >
      <AlertDialogContent class="glass-deep">
        <AlertDialogHeader>
          <AlertDialogTitle>Подтвердите смену тарифа</AlertDialogTitle>
          <AlertDialogDescription>
            Вы хотите перейти на тариф
            <strong>{{
              getPlanDisplayName(pendingPlanChange?.name || '')
            }}</strong
            >?
            {{ getConfirmDialogDescription() }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="showConfirmDialog = false">
            Отменить
          </AlertDialogCancel>
          <AlertDialogAction @click="confirmPlanChange">
            Подтвердить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useAPI } from '@/app/composables/useAPI';
import { useRouter } from 'vue-router';
import { useSubscriptionStore } from '@/app/stores/subscription';
import { nanoid } from 'nanoid';
import PlanCard from '@/app/components/subscription/PlanCard.vue';
import Skeleton from '@/app/components/ui/Skeleton.vue';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/app/components/ui/alert-dialog';

interface Plan {
  id: string;
  name: string;
  basePrice: number;
  weeklyMinutesLimit: number;
  isVisibleInUI?: boolean;
}

interface Subscription {
  id: number;
  planId: string;
  endDate: string;
  paymentStatus: string;
  billingPeriod?: 'month' | 'year';
  plan: {
    id: string;
    name: string;
  };
}

interface SubscriptionResponse {
  plan: string;
  trialActive: boolean;
  trialExpiresAt: string | null;
  features: {
    ai: boolean;
    weeklyMinutesLimit: number;
  };
  subscription: Subscription | null;
  noActiveSubscription: boolean;
  user?: {
    billingCredit: number;
    hasUsedTrial: boolean;
    timezone: string;
  };
}

const router = useRouter();
const subscriptionStore = useSubscriptionStore();

// Computed для удобства доступа
const plans = computed(() => subscriptionStore.plans);
const currentSubscription = computed(
  () => subscriptionStore.currentSubscription
);
const trialActive = computed(() => subscriptionStore.trialActive);
const trialExpiresAt = computed(
  () => subscriptionStore.subscriptionData?.trialExpiresAt || null
);
const features = computed(
  () => subscriptionStore.subscriptionData?.features || null
);
const noActiveSubscription = computed(
  () => subscriptionStore.subscriptionData?.noActiveSubscription ?? false
);
// Храним период оплаты для каждого плана отдельно
const planBillingPeriods = ref<Map<string, 'month' | 'year'>>(new Map());
const selectedPlanId = ref<string | null>(null);
const processing = ref(false);
const showConfirmDialog = ref(false);
const pendingPlanChange = ref<Plan | null>(null);
const checkoutIdempotencyKey = ref<string | null>(null);

const selectedPlan = computed(() => {
  return plans.value.find((p) => p.id === selectedPlanId.value);
});

// Используем visiblePlans из store

// Вычисляем количество дней до окончания Trial
const trialDaysLeft = computed(() => {
  if (!trialActive.value || !trialExpiresAt.value) {
    return null;
  }
  const now = new Date();
  const expiresAt = new Date(trialExpiresAt.value);
  const diffTime = expiresAt.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
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

function getPlanDisplayName(name: string) {
  if (name === 'basic') {
    // Если Trial активен, показываем как "Пробный период Premium"
    if (trialActive.value) {
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

function getBillingPeriod(planId: string): 'month' | 'year' {
  return planBillingPeriods.value.get(planId) || 'month';
}

function setBillingPeriod(planId: string, period: 'month' | 'year') {
  // Basic план всегда только 'month', нельзя выбрать 'year'
  const plan = plans.value.find((p) => p.id === planId);
  if (plan?.name === 'basic') {
    planBillingPeriods.value.set(planId, 'month');
    return;
  }
  planBillingPeriods.value.set(planId, period);
}

function isCurrentPlan(planId: string): boolean {
  if (!currentSubscription.value) return false;

  // Проверяем и planId, и billingPeriod
  // Если период отличается от текущего, это считается новым тарифом
  const currentPlanId = currentSubscription.value.planId;
  const currentBillingPeriod =
    currentSubscription.value.billingPeriod || 'month';
  const planBillingPeriod = getBillingPeriod(planId);

  // Тариф считается текущим только если совпадают и план, и период
  // Если пользователь меняет период у текущего тарифа (месяц -> год или наоборот),
  // это считается новым тарифом, и кнопка станет "Выбрать"
  return currentPlanId === planId && currentBillingPeriod === planBillingPeriod;
}

function selectPlan(plan: Plan) {
  // Если это текущий план, ничего не делаем
  if (isCurrentPlan(plan.id)) {
    return;
  }

  // НЕ устанавливаем selectedPlanId здесь - только после подтверждения
  pendingPlanChange.value = plan;
  showConfirmDialog.value = true;
}

function handlePlanChangeConfirm(plan: Plan) {
  selectPlan(plan);
}

function getConfirmDialogDescription(): string {
  if (!pendingPlanChange.value) {
    return '';
  }

  const newPlanName = getPlanDisplayName(pendingPlanChange.value.name);
  const billingPeriod = getBillingPeriod(pendingPlanChange.value.id);

  const price =
    billingPeriod === 'year'
      ? Math.round(pendingPlanChange.value.basePrice * 12 * 0.8)
      : pendingPlanChange.value.basePrice;
  const priceText = `Стоимость: ${price.toLocaleString('ru-RU')} ₽/${billingPeriod === 'year' ? 'год' : 'месяц'}`;

  if (currentSubscription.value) {
    const currentPlanName = getPlanDisplayName(
      currentSubscription.value.plan.name
    );
    return `Вы переходите с тарифа "${currentPlanName}" на "${newPlanName}". ${priceText}`;
  } else {
    return `Вы выбираете тариф "${newPlanName}". ${priceText}`;
  }
}

async function confirmPlanChange() {
  if (!pendingPlanChange.value) return;

  showConfirmDialog.value = false;

  // Устанавливаем выбранный план только после подтверждения
  selectedPlanId.value = pendingPlanChange.value.id;
  // Генерируем идемпотентный ключ для этого checkout (нужен для защиты от повторов/ретраев)
  checkoutIdempotencyKey.value = nanoid();

  // Автоматически запускаем checkout
  // fetchCurrentSubscription уже вызывается внутри startCheckout
  await startCheckout();
}

function goBack() {
  navigateTo('/settings');
}

// Функции fetchPlans и fetchCurrentSubscription теперь в store

async function startCheckout() {
  if (!selectedPlanId.value) return;

  processing.value = true;

  try {
    const plan = selectedPlan.value;
    if (!plan) return;

    const billingPeriod = planBillingPeriods.value.get(plan.id) || 'month';
    const body: any = {
      planId: plan.id,
      billingPeriod,
    };

    // Если по какой-то причине ключ ещё не задан — создаём прямо здесь
    if (!checkoutIdempotencyKey.value) {
      checkoutIdempotencyKey.value = nanoid();
    }

    const response = await useAPI<{
      paymentUrl: string | null;
      subscriptionId: number;
      amount: number;
      toPay: number;
      status: 'pending' | 'active';
    }>('/api/subscriptions/start-checkout', {
      method: 'POST',
      headers: {
        'Idempotency-Key': checkoutIdempotencyKey.value,
      },
      body,
    });

    if (response.status === 'active' || response.toPay === 0) {
      alert('Подписка активирована. К оплате: 0 ₽');
    } else {
      // В реальной реализации здесь будет редирект на YooKassa
      // window.location.href = response.paymentUrl;
      alert(`Оплата начата. Сумма: ${response.toPay} ₽`);
    }

    // Обновляем данные через store
    await subscriptionStore.refreshSubscription();
  } catch (error: any) {
    console.error('Checkout error:', error);
    alert(
      'Ошибка при оформлении подписки: ' +
        (error.message || 'Неизвестная ошибка')
    );
  } finally {
    processing.value = false;
  }
}

onMounted(async () => {
  // Загружаем данные через store (с кэшированием)
  await Promise.all([
    subscriptionStore.fetchPlans(),
    subscriptionStore.fetchCurrentSubscription(),
  ]);

  // По умолчанию выделяем текущий активный тариф
  if (currentSubscription.value) {
    selectedPlanId.value = currentSubscription.value.planId;
    // Инициализируем период для текущего тарифа из подписки
    const currentBillingPeriod =
      currentSubscription.value.billingPeriod || 'month';
    planBillingPeriods.value.set(
      currentSubscription.value.planId,
      currentBillingPeriod
    );
  }

  // Инициализируем период для всех планов (по умолчанию месяц)
  // Basic всегда только 'month'
  plans.value.forEach((plan: Plan) => {
    if (!planBillingPeriods.value.has(plan.id)) {
      const period = plan.name === 'basic' ? 'month' : 'month';
      planBillingPeriods.value.set(plan.id, period);
    } else if (plan.name === 'basic') {
      // Убеждаемся, что Basic всегда 'month'
      planBillingPeriods.value.set(plan.id, 'month');
    }
  });
});
</script>
