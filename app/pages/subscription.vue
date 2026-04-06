<template>
  <div class="space-y-2 h-full overflow-y-auto rounded-lg">
    <PageHeader
      :title="'Управление подпиской'"
      :show-back-button="true"
      @go-back="goBack()"
    />

    <div class="space-y-2 pb-[100px]">
      <div
        v-if="isIosAppleIapFlow"
        class="glass-deep rounded-lg border border-border p-4 space-y-3"
      >
        <div
          v-if="shouldBlockAppleIapPurchase"
          class="rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-foreground/90"
        >
          У вас уже есть активная подписка. Чтобы избежать двойного списания,
          оформление через App Store временно недоступно.
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            :disabled="processing"
            class="inline-flex items-center justify-center rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-primary-ui/10 disabled:opacity-60 disabled:cursor-not-allowed"
            @click="handleRestorePurchases"
          >
            Восстановить покупки
          </button>
          <button
            type="button"
            :disabled="processing"
            class="inline-flex items-center justify-center rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-primary-ui/10 disabled:opacity-60 disabled:cursor-not-allowed"
            @click="handleManageAppleSubscriptions"
          >
            Управление подпиской в App Store
          </button>
        </div>

        <p class="text-[11px] leading-snug text-foreground/80">
          Подписка автоматически продлевается, если не отменена минимум за 24
          часа до окончания текущего периода.
        </p>
      </div>

      <!-- Текущий статус -->
      <div
        v-if="shouldShowCurrentStatusCard"
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
                {{ getCurrentStatusPlanLabel() }}
              </p>

              <!-- Информация о пробном периоде -->
              <div
                v-if="
                  trialActive &&
                  currentSubscription.planId === 'basic' &&
                  currentEntitlementsPlan === 'premium'
                "
                class="mt-2 space-y-1"
              >
                <p class="text-xs text-foreground">
                  Действует до:
                  {{ formatTrialDate(trialEndsAt) }}
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
                  <template v-if="currentSubscription.plan.name === 'basic'">
                    Бесплатный план без срока окончания
                  </template>
                  <template v-else>
                    Действует до: {{ formatDate(currentSubscription.endDate) }}
                  </template>
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

              <div v-if="isPaidActiveSubscription" class="mt-3">
                <div
                  v-if="isCurrentSubscriptionCancellationScheduled"
                  class="space-y-2"
                >
                  <p class="text-xs text-foreground/80">
                    Автопродление отключено. Подписка останется активной до
                    {{ formatDate(currentSubscription.endDate) }}.
                  </p>
                  <button
                    v-if="canResumeCurrentSubscription"
                    type="button"
                    :disabled="processing"
                    class="inline-flex items-center justify-center rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-primary-ui/10 disabled:opacity-60 disabled:cursor-not-allowed"
                    @click="showResumeSubscriptionDialog = true"
                  >
                    Включить автопродление
                  </button>
                </div>
                <button
                  v-else-if="canCancelCurrentSubscription"
                  type="button"
                  :disabled="processing"
                  class="inline-flex items-center justify-center rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-primary-ui/10 disabled:opacity-60 disabled:cursor-not-allowed"
                  @click="showCancelSubscriptionDialog = true"
                >
                  Отменить подписку
                </button>
              </div>
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
                Чтобы продолжить пользоваться Ментала, выберите один из тарифов
                ниже.
              </p>
            </div>
          </div>
        </Transition>
      </div>

      <div
        v-if="scheduledChange"
        class="glass-deep rounded-lg border border-border p-4 space-y-3"
      >
        <p class="text-sm font-medium">Запланированная смена тарифа</p>
        <p class="text-sm text-foreground">
          Сменится на
          <strong>{{ getPlanDisplayNameById(scheduledChange.planId) }}</strong>
          ({{ formatBillingPeriodLabel(scheduledChange.billingPeriod) }})
          {{ formatDate(scheduledChange.effectiveAt) }}.
        </p>
        <button
          type="button"
          :disabled="processing"
          class="inline-flex items-center justify-center rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-primary-ui/10 disabled:opacity-60 disabled:cursor-not-allowed"
          @click="cancelScheduledChange"
        >
          Отменить запланированную смену
        </button>
      </div>

      <div
        v-if="
          billingPlan && nextChargeAt && billingCollectionStatus === 'scheduled'
        "
        class="glass-deep rounded-lg border border-border p-4 space-y-3"
      >
        <p class="text-sm font-medium">Списание запланировано</p>
        <p class="text-sm text-foreground">
          Тариф: <strong>{{ getPlanDisplayNameById(billingPlan) }}</strong
          >.
          <br />
          Первое списание: {{ formatDate(nextChargeAt) }}
        </p>
        <p class="text-xs text-foreground/80">
          Вы сможете отменить до {{ formatDate(nextChargeAt) }}
        </p>
        <button
          type="button"
          :disabled="processing"
          class="inline-flex items-center justify-center rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-primary-ui/10 disabled:opacity-60 disabled:cursor-not-allowed"
          @click="cancelScheduledChange"
        >
          Отменить будущее списание
        </button>
      </div>

      <div
        v-if="billingCollectionStatus === 'past_due'"
        class="glass-deep rounded-lg border border-yellow-500/60 p-4 space-y-3"
      >
        <p class="text-sm font-medium text-yellow-300">Оплата не прошла</p>
        <p class="text-sm text-foreground">
          Повторите оплату до
          <strong>{{ formatDate(graceEndsAt) }}</strong
          >, иначе доступ будет ограничен.
        </p>
        <button
          type="button"
          :disabled="processing"
          class="relative inline-flex items-center justify-center rounded-md border border-yellow-400/70 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-yellow-500/10 disabled:opacity-60 disabled:cursor-not-allowed"
          @click="retryChargeNow"
        >
          <ButtonLoader v-if="processing" />
          <span :class="processing ? 'invisible' : ''">Повторить оплату</span>
        </button>
      </div>

      <div
        v-if="!isNativeIos && !isCurrentSubscriptionApple"
        class="glass-deep rounded-lg border border-border p-4 space-y-3"
      >
        <p class="text-sm font-medium">Способ оплаты</p>

        <template v-if="paymentMethod">
          <p class="text-sm text-foreground font-medium">
            {{ paymentMethodPrimaryLabel }}
          </p>
          <p class="text-xs text-foreground/80">
            Срок: {{ paymentMethodExpiryLabel }}
          </p>
          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              :disabled="processing"
              class="inline-flex items-center justify-center rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-primary-ui/10 disabled:opacity-60 disabled:cursor-not-allowed"
              @click="handleReplacePaymentMethod"
            >
              Заменить карту
            </button>
            <button
              type="button"
              :disabled="processing"
              class="inline-flex items-center justify-center rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-primary-ui/10 disabled:opacity-60 disabled:cursor-not-allowed"
              @click="handleUnbindPaymentMethod"
            >
              Отвязать карту
            </button>
          </div>
        </template>

        <template v-else>
          <p class="text-sm text-foreground">
            Чтобы включить автосписание, привяжите карту.
          </p>
          <button
            type="button"
            :disabled="processing"
            class="inline-flex items-center justify-center rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-primary-ui/10 disabled:opacity-60 disabled:cursor-not-allowed"
            @click="handleBindPaymentMethod"
          >
            Привязать карту
          </button>
        </template>
      </div>

      <div
        v-if="shouldShowAppleIapPricesError"
        class="glass-deep rounded-lg border border-destructive/50 p-4 space-y-3"
      >
        <p class="text-sm font-medium text-foreground">
          Не удалось загрузить цены
        </p>

        <button
          type="button"
          :disabled="processing"
          class="inline-flex items-center justify-center rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-primary-ui/10 disabled:opacity-60 disabled:cursor-not-allowed"
          @click="handleReloadAppleIapProducts"
        >
          Повторить загрузку цен
        </button>
      </div>

      <!-- Карточки тарифов -->
      <div
        v-if="
          subscriptionStore.loading.plans ||
          isAppleIapPricesLoading ||
          isIosBillingFlowPending
        "
        class="grid grid-cols-1 md:grid-cols-3 gap-2"
      >
        <Skeleton type="plan-card" :count="4" rounded-size="lg" />
      </div>
      <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-2">
        <PlanCard
          v-for="(plan, index) in subscriptionStore.visiblePlans"
          :key="plan.id"
          :plan="plan"
          :billing-period="getBillingPeriod(plan.id)"
          :is-selected="selectedPlanId === plan.id"
          :is-current="isCurrentPlan(plan.id)"
          :is-scheduled="isScheduledPlan(plan.id)"
          :price-label="resolvePlanPriceLabel(plan)"
          :show-year-discount="!isIosAppleIapFlow"
          :trial-active="
            plan.name === 'basic' ? subscriptionStore.trialActive : false
          "
          :style="`animation-delay: ${0.3 + index * 0.1}s`"
          class=""
          @update:billing-period="(period) => setBillingPeriod(plan.id, period)"
          @confirm-change="handlePlanChangeConfirm"
        />
      </div>
    </div>

    <!-- Модалка подтверждения смены тарифа -->
    <AlertDialog
      :open="showConfirmDialog"
      @update:open="handleConfirmDialogOpenChange"
    >
      <AlertDialogContent class="glass-deep">
        <AlertDialogHeader>
          <AlertDialogTitle>Подтвердите смену тарифа</AlertDialogTitle>
          <AlertDialogDescription>
            {{ getConfirmDialogDescription() }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            :disabled="loadersStore.isButtonLoading"
            @click="handleConfirmDialogOpenChange(false)"
          >
            Отменить
          </AlertDialogCancel>
          <Button
            type="button"
            class="relative"
            :disabled="processing || loadersStore.isButtonLoading"
            @click="confirmPlanChange"
          >
            <ButtonLoader v-if="loadersStore.isButtonLoading" />
            <span :class="loadersStore.isButtonLoading ? 'invisible' : ''">
              Подтвердить
            </span>
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- Модалка подтверждения отмены автопродления -->
    <AlertDialog
      :open="showCancelSubscriptionDialog"
      @update:open="showCancelSubscriptionDialog = $event"
    >
      <AlertDialogContent class="glass-deep">
        <AlertDialogHeader>
          <AlertDialogTitle>Отменить подписку?</AlertDialogTitle>
          <AlertDialogDescription>
            Мы отключим автопродление. Текущий период останется активным до
            {{ formatDate(currentSubscription?.endDate || null) }}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="showCancelSubscriptionDialog = false">
            Отмена
          </AlertDialogCancel>
          <AlertDialogAction
            class="relative"
            :disabled="processing"
            @click="cancelActiveSubscription"
          >
            <ButtonLoader v-if="processing" />
            <span :class="processing ? 'invisible' : ''">
              Отменить подписку
            </span>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- Модалка подтверждения возобновления автопродления -->
    <AlertDialog
      :open="showResumeSubscriptionDialog"
      @update:open="showResumeSubscriptionDialog = $event"
    >
      <AlertDialogContent class="glass-deep">
        <AlertDialogHeader>
          <AlertDialogTitle>Включить автопродление?</AlertDialogTitle>
          <AlertDialogDescription>
            Подписка будет автоматически продлена
            {{ formatDate(currentSubscription?.endDate || null) }}. С вашей
            карты будет списана оплата за следующий период.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="showResumeSubscriptionDialog = false">
            Отмена
          </AlertDialogCancel>
          <AlertDialogAction
            class="relative"
            :disabled="processing"
            @click="resumeActiveSubscription"
          >
            <ButtonLoader v-if="processing" />
            <span :class="processing ? 'invisible' : ''"> Включить</span>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- Модалка блокировки Apple IAP при активной подписке через сайт (анти‑double charge) -->
    <AlertDialog
      :open="showAppleIapBlockedDialog"
      @update:open="showAppleIapBlockedDialog = $event"
    >
      <AlertDialogContent class="glass-deep">
        <AlertDialogHeader>
          <AlertDialogTitle
            >Покупка через App Store недоступна</AlertDialogTitle
          >
          <AlertDialogDescription>
            {{ appleIapBlockedDialogDescription }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="showAppleIapBlockedDialog = false">
            Понятно
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- Модалка блокировки оплаты через сайт при активной подписке App Store (анти‑double charge) -->
    <AlertDialog
      :open="showYookassaBlockedDialog"
      @update:open="showYookassaBlockedDialog = $event"
    >
      <AlertDialogContent class="glass-deep">
        <AlertDialogHeader>
          <AlertDialogTitle>Оплата через сайт недоступна</AlertDialogTitle>
          <AlertDialogDescription>
            {{ yookassaBlockedDialogDescription }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="showYookassaBlockedDialog = false">
            Понятно
          </AlertDialogCancel>
          <AlertDialogAction
            type="button"
            @click="openExternalBrowser(APPLE_SUBSCRIPTIONS_MANAGE_URL)"
          >
            Управление в App Store
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- Модалка checkout в custom-режиме (YooKassa modal: false) -->
    <Dialog
      :open="isCheckoutWidgetDialogOpen"
      :modal="false"
      @update:open="handleCheckoutWidgetDialogOpenChange"
    >
      <DialogContent
        overlay-class="z-[190] bg-black/70 backdrop-blur-sm"
        class="z-[200] !w-[min(96vw,560px)] !max-w-[560px] !bg-transparent !border-0 !shadow-none !p-0 !max-h-[92dvh] !overflow-y-auto [&>button]:z-[220] [&>button]:opacity-100 [&>button]:text-slate-700 [&>button]:right-2.5 [&>button]:top-2.5 [&>button]:focus:ring-0 [&>button]:focus:ring-offset-0"
        @interact-outside.prevent
        @focus-outside.prevent
      >
        <DialogTitle class="sr-only">Оплата подписки</DialogTitle>
        <DialogDescription class="sr-only">
          Форма оплаты YooKassa. После завершения статус подписки обновится
          автоматически.
        </DialogDescription>
        <!-- Добавляем внутренний верхний отступ, чтобы верхняя строка виджета не прилипала к краю. -->
        <div
          class="overflow-hidden rounded-[22px] bg-white pt-2 shadow-2xl sm:pt-3"
        >
          <div
            :id="YOOKASSA_WIDGET_CONTAINER_ID"
            ref="checkoutWidgetContainerRef"
            class="min-h-[340px]"
          />
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { Capacitor } from '@capacitor/core';
import { useNow } from '@vueuse/core';
import { nanoid } from 'nanoid';
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { useAPI } from '@/app/composables/useAPI';
import { useEntitlements } from '@/app/composables/useEntitlements';
import { useExternalFlowAppUrl } from '@/app/composables/useExternalFlowAppUrl';
import { useAppleIap } from '@/app/composables/useAppleIap';
import { usePlatform } from '@/app/composables/usePlatform';
import { useToast } from '@/app/composables/useToast';
import { getIosStorefrontCountryCode } from '@/app/lib/iosStorefront';
import { runSubscriptionShortPolling } from '@/app/lib/subscriptionPolling';
import { useAuthStore } from '@/app/stores/auth';
import { useLoadersStore } from '@/app/stores/loaders';
import { useSubscriptionStore } from '@/app/stores/subscription';
import {
  resolveAppleIapProductId,
  type AppleIapProductId,
} from '@/shared/constants/appleIap';
import {
  getLocalizedPlanName,
  getLocalizedTrialPlanLabel,
} from '@/app/utils/planI18n';
import {
  formatTrialCountdown,
  getTrialCountdown,
} from '@/app/utils/trialCountdown';
import PlanCard from '@/app/components/subscription/PlanCard.vue';
import ButtonLoader from '@/app/components/ui/ButtonLoader.vue';
import Skeleton from '@/app/components/ui/Skeleton.vue';
import { Button } from '@/app/components/ui/button';
import type {
  YooKassaWidgetInstance,
  YooKassaWidgetOptions,
} from '@/app/types/yookassa-widget';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/app/components/ui/dialog';

interface Plan {
  id: string;
  name: string;
  basePrice: number;
  weeklyMinutesLimit: number;
  isVisibleInUI?: boolean;
}

interface StartCheckoutResponse {
  subscriptionId: number;
  amount: number;
  toPay: number;
  creditApplied: number;
  creditGranted: number;
  status: 'pending' | 'active';
  paymentProvider: 'yookassa';
  paymentId: string | null;
  paymentMode: 'none' | 'widget' | 'redirect';
  confirmationToken: string | null;
  paymentUrl: string | null;
  checkoutAction?:
    | 'payment'
    | 'activated'
    | 'scheduled_downgrade'
    | 'noop'
    | 'bind_payment_method_required'
    | 'trial_scheduled';
  scheduledChange?: {
    planId: string;
    billingPeriod: 'month' | 'year';
    effectiveAt: string;
  } | null;
  trialEndsAt?: string | null;
  billingPlan?: 'pro' | 'premium' | null;
  billingPeriod?: 'month' | 'year' | null;
  nextChargeAt?: string | null;
  currentEntitlementsPlan?: 'basic' | 'pro' | 'premium';
  paymentMethodBound?: boolean;
  bindingSessionId?: string | null;
}

interface ExternalSessionResponse {
  consumeUrl: string;
  expiresAt: string;
  ttlSeconds: number;
}

interface CheckPaymentStatusResponse {
  subscriptionId: number | null;
  localStatus: string | null;
  paymentStatus: string | null;
  providerStatus: string | null;
  paid: boolean;
  shouldContinuePolling: boolean;
}

interface BindPaymentMethodResponse {
  checkoutAction: 'bind_payment_method_required' | 'noop';
  paymentMode: 'none' | 'redirect';
  paymentUrl: string | null;
  bindingSessionId: string | null;
  paymentMethodBound: boolean;
}

const subscriptionStore = useSubscriptionStore();
const authStore = useAuthStore();
const loadersStore = useLoadersStore();
const { t } = useI18n();
const { refreshEntitlements } = useEntitlements();
const route = useRoute();
const router = useRouter();
const { platform } = usePlatform();
const externalFlowAppUrl = useExternalFlowAppUrl();
const appleIap = useAppleIap();
const { $yooKassaWidget } = useNuxtApp();
const YOOKASSA_WIDGET_CONTAINER_ID = 'yookassa-widget-container';
const APPLE_SUBSCRIPTIONS_MANAGE_URL =
  'https://apps.apple.com/account/subscriptions';
const now = useNow({ interval: 60_000 });

// Computed для удобства доступа
const plans = computed(() => subscriptionStore.plans);
const currentSubscription = computed(
  () => subscriptionStore.currentSubscription
);
const billingProviderHint = computed(
  () => subscriptionStore.subscriptionData?.billingProviderHint || null
);
const isCurrentSubscriptionApple = computed(() => {
  return currentSubscription.value?.paymentProvider === 'apple_iap';
});
const trialActive = computed(() => subscriptionStore.trialActive);
const trialEndsAt = computed(
  () => subscriptionStore.subscriptionData?.trialEndsAt || null
);
const currentEntitlementsPlan = computed(
  () => subscriptionStore.subscriptionData?.currentEntitlementsPlan || null
);
const scheduledChange = computed(
  () => subscriptionStore.subscriptionData?.scheduledChange || null
);
const billingPlan = computed(
  () => subscriptionStore.subscriptionData?.billingPlan || null
);
const billingCollectionStatus = computed(
  () => subscriptionStore.subscriptionData?.billingCollectionStatus || 'none'
);
const graceEndsAt = computed(
  () => subscriptionStore.subscriptionData?.graceEndsAt || null
);
const nextChargeAt = computed(
  () => subscriptionStore.subscriptionData?.nextChargeAt || null
);
const paymentMethodBound = computed(() =>
  Boolean(subscriptionStore.subscriptionData?.paymentMethodBound)
);
const paymentMethod = computed(
  () => subscriptionStore.subscriptionData?.paymentMethod || null
);
const paymentMethodPrimaryLabel = computed(() => {
  if (!paymentMethod.value) return '';

  if (!paymentMethod.value.last4 && paymentMethod.value.title) {
    return paymentMethod.value.title;
  }

  const brandRaw = String(
    paymentMethod.value.cardBrand || paymentMethod.value.type || ''
  )
    .trim()
    .toLowerCase();
  const brand =
    brandRaw === 'visa'
      ? 'Visa'
      : brandRaw === 'mastercard'
        ? 'Mastercard'
        : brandRaw === 'mir'
          ? 'Mir'
          : brandRaw === 'master_card'
            ? 'Mastercard'
            : brandRaw
                .replace(/_/g, ' ')
                .replace(/\b\w/g, (char) => char.toUpperCase()) || 'Карта';
  const last4 = paymentMethod.value.last4
    ? `**** ${paymentMethod.value.last4}`
    : '****';

  return `${brand}, ${last4}`;
});
const paymentMethodExpiryLabel = computed(() => {
  if (!paymentMethod.value) return '—';

  if (!paymentMethod.value.expiryMonth && !paymentMethod.value.expiryYear) {
    return '—';
  }

  const month = paymentMethod.value.expiryMonth || '—';
  const yearRaw = paymentMethod.value.expiryYear || '';
  const year = yearRaw ? yearRaw.slice(-2) : '—';

  return `${month}/${year}`;
});

const shouldShowCurrentStatusCard = computed(() => {
  if (subscriptionStore.loading.subscription) {
    return true;
  }

  if (!currentSubscription.value) {
    return true;
  }

  return !(
    currentSubscription.value.plan.name === 'basic' &&
    currentSubscription.value.paymentStatus === 'active' &&
    !trialActive.value
  );
});

const isPaidActiveSubscription = computed(() => {
  return Boolean(
    currentSubscription.value &&
      currentSubscription.value.paymentStatus === 'active' &&
      currentSubscription.value.plan.name !== 'basic'
  );
});

const isCurrentSubscriptionCancellationScheduled = computed(() => {
  if (!isPaidActiveSubscription.value) {
    return false;
  }

  return currentSubscription.value?.autoRenew === false;
});

const canResumeCurrentSubscription = computed(() => {
  if (!isPaidActiveSubscription.value) return false;
  if (isCurrentSubscriptionApple.value) return false;
  if (!isCurrentSubscriptionCancellationScheduled.value) return false;
  const endDate = currentSubscription.value?.endDate;
  if (!endDate) return false;
  return new Date(endDate).getTime() > Date.now();
});

// Храним период оплаты для каждого плана отдельно
const planBillingPeriods = ref<Map<string, 'month' | 'year'>>(new Map());
const selectedPlanId = ref<string | null>(null);
const processing = ref(false);
const showConfirmDialog = ref(false);
const showCancelSubscriptionDialog = ref(false);
const showResumeSubscriptionDialog = ref(false);
const pendingPlanChange = ref<Plan | null>(null);
const checkoutIdempotencyKey = ref<string | null>(null);
const checkoutPayloadSignature = ref<string | null>(null);
const pendingCheckoutSubscriptionId = ref<number | null>(null);
const isCheckoutWidgetDialogOpen = ref(false);
const checkoutWidgetContainerRef = ref<HTMLElement | null>(null);
const isNativeIos = computed(
  () => platform.value === 'ios' && Capacitor.isNativePlatform()
);
const isNativeAndroid = computed(
  () => platform.value === 'android' && Capacitor.isNativePlatform()
);
// iOS payment flow по storefront:
// - RU -> YooKassa (внешний переход)
// - остальные -> Apple IAP
// - если storefront неизвестен -> Apple IAP (безопасный дефолт)
// ВАЖНО: пока subscriptionData не загружена, оба flow === false,
// чтобы не рендерить flow-specific UI до определения billingProviderHint.
const isIosYookassaFlow = computed(() => {
  if (!isNativeIos.value || !subscriptionStore.subscriptionData) return false;
  return billingProviderHint.value === 'yookassa';
});
const isIosAppleIapFlow = computed(() => {
  if (!isNativeIos.value || !subscriptionStore.subscriptionData) return false;
  return billingProviderHint.value !== 'yookassa';
});
const isIosBillingFlowPending = computed(() => {
  return isNativeIos.value && !subscriptionStore.subscriptionData;
});
const isAppleIapPricesLoading = computed(() => {
  return isIosAppleIapFlow.value && appleIap.loadingProducts.value;
});
const hasAppleIapPrices = computed(() => {
  return Object.keys(appleIap.products.value || {}).length > 0;
});
const appleIapProductsLoadAttempted = ref(false);
const appleIapPricesErrorMessage = ref<string | null>(null);

function resolveUserFacingErrorMessage(error: any): string | null {
  const candidates = [
    error?.data?.error?.message,
    error?.data?.message,
    error?.response?._data?.error?.message,
    error?.response?._data?.message,
    error?.message,
  ];

  for (const candidate of candidates) {
    const text = typeof candidate === 'string' ? candidate.trim() : '';
    if (text) return text;
  }

  return null;
}
const shouldShowAppleIapPricesError = computed(() => {
  return (
    isIosAppleIapFlow.value &&
    appleIapProductsLoadAttempted.value &&
    !isAppleIapPricesLoading.value &&
    !hasAppleIapPrices.value
  );
});
const showAppleIapBlockedDialog = ref(false);
const shouldBlockAppleIapPurchase = computed(() => {
  // MVP-правило: не даём купить через Apple IAP, если уже есть активная подписка,
  // оформленная через YooKassa (иначе почти гарантирован "double charge").
  return Boolean(
    isIosAppleIapFlow.value &&
      currentSubscription.value &&
      currentSubscription.value.paymentStatus === 'active' &&
      currentSubscription.value.plan?.name !== 'basic' &&
      currentSubscription.value.paymentProvider === 'yookassa'
  );
});
const appleIapBlockedDialogDescription = computed(() => {
  if (!currentSubscription.value) {
    return 'У вас уже есть активная подписка, оплаченная через внешнюю страницу в браузере. Чтобы избежать двойного списания, покупка через App Store временно недоступна.';
  }

  const planLabel = getPlanDisplayName(currentSubscription.value.plan?.name);
  const endsAt = formatDate(currentSubscription.value.endDate);

  return `Сейчас у вас активна подписка «${planLabel}» (до ${endsAt}), оплаченная через внешнюю страницу в браузере. Чтобы избежать двойного списания, покупка через App Store временно недоступна. Дождитесь окончания периода или отмените автопродление в управлении подпиской, после чего сможете оформить подписку через App Store.`;
});
const showYookassaBlockedDialog = ref(false);
const shouldBlockYookassaCheckout = computed(() => {
  // Симметричное правило MVP: не даём оформить/изменить подписку через сайт,
  // если источник истины — App Store (иначе получим параллельные подписки).
  return Boolean(
    !isNativeIos.value &&
      currentSubscription.value &&
      currentSubscription.value.paymentStatus === 'active' &&
      currentSubscription.value.plan?.name !== 'basic' &&
      currentSubscription.value.paymentProvider === 'apple_iap'
  );
});
const yookassaBlockedDialogDescription = computed(() => {
  if (!currentSubscription.value) {
    return 'У вас уже активна подписка, оформленная в App Store. Чтобы избежать двойного списания, оплата через сайт временно недоступна.';
  }

  const planLabel = getPlanDisplayName(currentSubscription.value.plan?.name);
  const endsAt = formatDate(currentSubscription.value.endDate);

  return `Сейчас у вас активна подписка «${planLabel}» (до ${endsAt}), оформленная в App Store. Чтобы избежать двойного списания, оплата через сайт временно недоступна. Управляйте подпиской в App Store или дождитесь окончания периода.`;
});
const canCancelCurrentSubscription = computed(() => {
  return !isCurrentSubscriptionApple.value;
});

let widgetInstance: YooKassaWidgetInstance | null = null;
let activePollingPromise: Promise<void> | null = null;
let paymentReturnListener: ((event: Event) => void) | null = null;

const selectedPlan = computed(() => {
  return plans.value.find((p) => p.id === selectedPlanId.value);
});

// Используем visiblePlans из store

// Реактивный countdown trial (дни + часы) с пересчетом каждую минуту.
const trialTimeLeftLabel = computed(() => {
  if (!trialActive.value || !trialEndsAt.value) {
    return null;
  }

  const countdown = getTrialCountdown(trialEndsAt.value, now.value);
  if (!countdown) {
    return null;
  }

  return formatTrialCountdown(countdown);
});

function getPlanDisplayName(name: string) {
  if (name === 'basic') {
    // Если Trial активен, показываем как "Пробный период"
    if (trialActive.value) {
      return getLocalizedTrialPlanLabel(t, trialTimeLeftLabel.value);
    }
    return getLocalizedPlanName('basic', t);
  }

  return getLocalizedPlanName(name, t);
}

function getPlanDisplayNameById(planId: string) {
  const plan = plans.value.find((item) => item.id === planId);
  if (plan) {
    return getPlanDisplayName(plan.name);
  }
  return getPlanDisplayName(planId);
}

function getCurrentStatusPlanLabel(): string {
  // В trial у пользователя остается Premium-доступ, даже если выбрано будущее списание PRO.
  if (trialActive.value && currentSubscription.value?.planId === 'basic') {
    return getLocalizedTrialPlanLabel(t, trialTimeLeftLabel.value);
  }

  const effectivePlanId =
    currentEntitlementsPlan.value || currentSubscription.value?.planId;

  return getPlanDisplayNameById(effectivePlanId || 'basic');
}

function formatBillingPeriodLabel(period: 'month' | 'year') {
  return period === 'year' ? 'год' : 'месяц';
}

function isScheduledPlan(planId: string): boolean {
  return scheduledChange.value?.planId === planId;
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

function formatDate(dateString?: string | null) {
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

  // При смене периода сбрасываем payload-подпись, чтобы при новой команде
  // генерировался новый idempotency-key.
  if (selectedPlanId.value === planId) {
    checkoutPayloadSignature.value = null;
    checkoutIdempotencyKey.value = null;
  }
}

function resolvePlanPriceLabel(plan: Plan): string | null | undefined {
  // Для web/android/RU-flow цены считаем по basePrice (рубли).
  if (!isIosAppleIapFlow.value) {
    return undefined;
  }

  if (plan.name !== 'pro' && plan.name !== 'premium') {
    return undefined;
  }

  const billingPeriod = getBillingPeriod(plan.id);
  const productId = resolveAppleIapProductId({
    planId: plan.name,
    billingPeriod,
  });

  if (!productId) {
    return null;
  }

  const pricing = appleIap.products.value[productId];
  const price = String(pricing?.price || '').trim();
  return price || null;
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
  // На iOS действие должно происходить после явного выбора тарифа и нажатия "Выбрать":
  // - RU storefront -> внешний переход (YooKassa)
  // - остальной мир -> Apple IAP
  if (isIosYookassaFlow.value) {
    void startIosExternalCheckout(plan);
    return;
  }

  if (isIosAppleIapFlow.value) {
    if (shouldBlockAppleIapPurchase.value) {
      showAppleIapBlockedDialog.value = true;
      return;
    }
    void startAppleIapPurchase(plan);
    return;
  }

  // Web/Android: оставляем текущий flow (confirm modal + checkout).
  if (shouldBlockYookassaCheckout.value) {
    showYookassaBlockedDialog.value = true;
    return;
  }
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
  const savings =
    billingPeriod === 'year'
      ? Math.max(0, pendingPlanChange.value.basePrice * 12 - price)
      : 0;

  const priceText = `Стоимость: ${price.toLocaleString('ru-RU')} ₽/${billingPeriod === 'year' ? 'год' : 'месяц'}${savings > 0 ? ` · Экономия: ${savings.toLocaleString('ru-RU')} ₽` : ''}`;

  const isTrialToPaidPlan =
    trialActive.value &&
    currentSubscription.value?.planId === 'basic' &&
    pendingPlanChange.value.name !== 'basic';

  if (isTrialToPaidPlan && trialEndsAt.value) {
    const trialEndsAtLabel = formatDate(trialEndsAt.value);
    return `Сейчас у вас действует пробный период до ${trialEndsAtLabel} Сегодня списаний не будет. Первое списание произойдет после окончания пробного периода. ${priceText}`;
  }

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
  if (!pendingPlanChange.value || loadersStore.isButtonLoading) return;

  loadersStore.showButtonLoader();

  try {
    // Устанавливаем выбранный план только после подтверждения в модалке.
    selectedPlanId.value = pendingPlanChange.value.id;

    // Автоматически запускаем checkout.
    // fetchCurrentSubscription уже вызывается внутри startCheckout.
    const isCheckoutStarted = await startCheckout();

    // Закрываем модалку только при успешном ответе/старте checkout.
    if (isCheckoutStarted) {
      showConfirmDialog.value = false;
      pendingPlanChange.value = null;
    }
  } finally {
    // Лоадер кнопки скрываем всегда: и при success, и при ошибке.
    loadersStore.hideButtonLoader();
  }
}

function handleConfirmDialogOpenChange(nextOpen: boolean) {
  // Во время подтверждения запрещаем закрытие по overlay/ESC/Cancel.
  if (!nextOpen && loadersStore.isButtonLoading) {
    return;
  }

  showConfirmDialog.value = nextOpen;
  if (!nextOpen) {
    pendingPlanChange.value = null;
  }
}

function goBack() {
  navigateTo('/settings');
}

function buildCheckoutSignature(
  planId: string,
  billingPeriod: 'month' | 'year',
  paymentMode: 'widget' | 'redirect',
  externalFlow: boolean
): string {
  return `${planId}:${billingPeriod}:${paymentMode}:${externalFlow ? '1' : '0'}`;
}

function ensureCheckoutIdempotencyKey(
  planId: string,
  billingPeriod: 'month' | 'year',
  paymentMode: 'widget' | 'redirect',
  externalFlow: boolean
) {
  const nextSignature = buildCheckoutSignature(
    planId,
    billingPeriod,
    paymentMode,
    externalFlow
  );
  if (
    !checkoutIdempotencyKey.value ||
    checkoutPayloadSignature.value !== nextSignature
  ) {
    checkoutIdempotencyKey.value = nanoid();
    checkoutPayloadSignature.value = nextSignature;
  }
}

function resolveRequestedPeriod(): 'month' | 'year' | null {
  const raw = route.query.billingPeriod;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === 'month' || value === 'year') return value;
  return null;
}

function resolveExternalFlowFlag(): boolean {
  const raw = route.query.externalFlow;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === '1' || value === 'true';
}

function resolveBindReturnFlag(): boolean {
  const raw = route.query.bindReturn;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === '1' || value === 'true';
}

function resolvePaymentReturnFlag(): boolean {
  const raw = route.query.paymentReturn;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === '1' || value === 'true';
}

async function clearBindReturnQueryParams() {
  const nextQuery = { ...route.query };
  delete nextQuery.bindReturn;
  delete nextQuery.bindingSessionId;

  try {
    await router.replace({
      path: route.path,
      query: nextQuery,
      hash: route.hash,
    });
  } catch (error) {
    console.warn('[Subscription] Failed to clear bindReturn params:', error);
  }
}

async function clearPaymentReturnQueryParams() {
  const nextQuery = { ...route.query };
  delete nextQuery.paymentReturn;
  delete nextQuery.subscriptionId;
  delete nextQuery.externalFlow;

  try {
    await router.replace({
      path: route.path,
      query: nextQuery,
      hash: route.hash,
    });
  } catch (error) {
    console.warn(
      '[Subscription] Failed to clear payment return params:',
      error
    );
  }
}

async function waitForBoundPaymentMethodOnBindReturn(): Promise<boolean> {
  const maxAttempts = 5;
  const delayMs = 700;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await subscriptionStore.fetchCurrentSubscription(true);
    } catch (error) {
      console.warn(
        '[Subscription] Failed to refresh subscription during bind return sync:',
        error
      );
    }

    if (paymentMethodBound.value) {
      return true;
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => {
        setTimeout(resolve, delayMs);
      });
    }
  }

  return paymentMethodBound.value;
}

function isCompactMobileWeb(): boolean {
  if (typeof window === 'undefined') return false;
  if (Capacitor.isNativePlatform()) return false;

  const matchMediaResult =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 640px)').matches
      : false;
  const viewportResult =
    typeof window.innerWidth === 'number'
      ? window.innerWidth > 0 && window.innerWidth <= 640
      : false;

  return matchMediaResult || viewportResult;
}

function resolveCheckoutModeForCurrentContext(): 'widget' | 'redirect' {
  // На native Android не используем embedded widget в WebView:
  // redirect-flow стабильнее для 3DS и не закрывается сразу в системных WebView.
  if (isNativeAndroid.value) return 'redirect';

  // На мобильном web используем redirect flow:
  // это надежнее для 3DS, чем iframe в popup-виджете.
  return isCompactMobileWeb() ? 'redirect' : 'widget';
}

async function openExternalBrowser(url: string) {
  if (typeof window === 'undefined') return;

  if (!Capacitor.isNativePlatform()) {
    window.location.href = url;
    return;
  }

  try {
    const { InAppBrowser } = await import('@capacitor/inappbrowser');
    await InAppBrowser.openInExternalBrowser({ url });
  } catch (error) {
    // На случай, если плагин не подключен в текущей сборке.
    console.warn(
      '[Subscription] Failed to open external browser via InAppBrowser, using window.open fallback:',
      error
    );
    window.open(url, '_blank');
  }
}

async function openExternalSubscriptionFlow(
  planId: string,
  billingPeriod: 'month' | 'year'
) {
  const redirectPath = `/subscription?plan=${encodeURIComponent(planId)}&billingPeriod=${billingPeriod}&externalFlow=1`;
  const response = await useAPI<ExternalSessionResponse>(
    '/api/auth/external-session/create',
    {
      method: 'POST',
      body: {
        redirectPath,
        appUrl: externalFlowAppUrl.value || undefined,
      },
    }
  );

  const consumeUrl = String(response?.consumeUrl || '').trim();
  if (!consumeUrl) {
    throw new Error('External session consume URL is missing');
  }

  await openExternalBrowser(consumeUrl);
  useToast(
    'Открываем веб-версию',
    'Управление подпиской продолжится во внешнем браузере.',
    'info'
  );
}

async function startIosExternalCheckout(plan: Plan) {
  if (!isNativeIos.value || !isIosYookassaFlow.value) return;
  if (processing.value) return;

  const billingPeriod = getBillingPeriod(plan.id);

  processing.value = true;
  try {
    selectedPlanId.value = plan.id;
    await openExternalSubscriptionFlow(plan.id, billingPeriod);
  } catch (error: any) {
    console.error('Failed to start external checkout flow:', error);
    useToast(
      'Не удалось открыть оплату',
      error?.message || 'Попробуйте еще раз.',
      'error'
    );
  } finally {
    processing.value = false;
  }
}

async function startAppleIapPurchase(plan: Plan) {
  if (!isNativeIos.value || !isIosAppleIapFlow.value) return;
  if (processing.value) return;
  if (shouldBlockAppleIapPurchase.value) {
    showAppleIapBlockedDialog.value = true;
    return;
  }

  // Смена на Basic для Apple IAP — это отмена подписки, её делают в App Store.
  if (plan.name === 'basic') {
    useToast(
      'Отмена подписки',
      'Отмена подписки выполняется в App Store.',
      'info'
    );
    await handleManageAppleSubscriptions();
    return;
  }

  const billingPeriod = getBillingPeriod(plan.id);
  if (plan.name !== 'pro' && plan.name !== 'premium') {
    useToast(
      'Не удалось начать покупку',
      'Apple IAP доступен только для платных тарифов Pro/Premium.',
      'error'
    );
    return;
  }

  const productId = resolveAppleIapProductId({
    planId: plan.name,
    billingPeriod,
  });

  if (!productId) {
    useToast(
      'Не удалось начать покупку',
      'Не найден productId для выбранного тарифа.',
      'error'
    );
    return;
  }

  processing.value = true;
  try {
    selectedPlanId.value = plan.id;

    const response = await appleIap.purchase(productId as AppleIapProductId);

    await subscriptionStore.refreshSubscription();
    await refreshEntitlements().catch(() => {
      // Ошибки entitlement-refresh не должны ломать покупку.
    });

    if (response.status === 'active') {
      useToast('Подписка активирована', 'Спасибо! Доступ обновлён.', 'success');
    } else {
      useToast(
        'Покупка не подтверждена',
        'Если подписка уже оформлена, нажмите «Восстановить покупки».',
        'info'
      );
    }
  } catch (error: any) {
    console.error('Apple IAP purchase failed:', error);
    useToast(
      'Не удалось оформить подписку',
      error?.message || 'Попробуйте еще раз.',
      'error'
    );
  } finally {
    processing.value = false;
  }
}

async function handleRestorePurchases() {
  if (!isNativeIos.value || !isIosAppleIapFlow.value) return;
  if (processing.value) return;

  processing.value = true;
  try {
    const response = await appleIap.restorePurchases();
    await subscriptionStore.refreshSubscription();
    await refreshEntitlements().catch(() => {
      // Ошибки entitlement-refresh не должны ломать restore.
    });

    if (response.status === 'active') {
      useToast(
        'Покупки восстановлены',
        'Подписка синхронизирована.',
        'success'
      );
    } else {
      useToast(
        'Подписок не найдено',
        'Если вы уверены, что подписка есть, попробуйте еще раз позже.',
        'info'
      );
    }
  } catch (error: any) {
    console.error('Restore purchases failed:', error);
    useToast(
      'Не удалось восстановить покупки',
      error?.message || 'Попробуйте еще раз.',
      'error'
    );
  } finally {
    processing.value = false;
  }
}

async function handleManageAppleSubscriptions() {
  if (!isNativeIos.value) return;
  if (processing.value) return;

  processing.value = true;
  try {
    await appleIap.openManageSubscriptions();
  } catch {
    // Fallback: если плагин недоступен/не смог открыть системный экран.
    await openExternalBrowser('https://apps.apple.com/account/subscriptions');
  } finally {
    processing.value = false;
  }
}

async function handleReloadAppleIapProducts() {
  if (!isNativeIos.value || !isIosAppleIapFlow.value) return;
  if (processing.value) return;

  processing.value = true;
  try {
    appleIapProductsLoadAttempted.value = true;
    await appleIap.loadProducts();
    appleIapPricesErrorMessage.value = null;
    useToast(
      'Цены обновлены',
      'Данные App Store успешно загружены.',
      'success'
    );
  } catch (error: any) {
    console.warn('[Subscription] Failed to reload Apple IAP products:', error);
    const message = resolveUserFacingErrorMessage(error);
    appleIapPricesErrorMessage.value = message;
    useToast(
      'Не удалось загрузить цены App Store',
      message || 'Проверьте интернет и попробуйте снова.',
      'error'
    );
  } finally {
    processing.value = false;
  }
}

async function destroyWidget() {
  if (!widgetInstance) return;
  try {
    await widgetInstance.destroy?.();
  } catch (error) {
    console.warn('[Subscription] Widget destroy failed:', error);
  } finally {
    widgetInstance = null;
    if (checkoutWidgetContainerRef.value) {
      checkoutWidgetContainerRef.value.innerHTML = '';
    }
  }
}

function handleCheckoutWidgetDialogOpenChange(nextOpen: boolean) {
  isCheckoutWidgetDialogOpen.value = nextOpen;

  if (nextOpen) return;

  void destroyWidget();
}

function resolveSubscriptionIdFromQuery(): number | null {
  const raw = route.query.subscriptionId;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveSubscriptionIdFromPaymentReturnEvent(
  event: Event
): number | null {
  const customEvent = event as CustomEvent<{ url?: string }>;
  const rawUrl = String(customEvent?.detail?.url || '').trim();
  if (!rawUrl) return null;

  try {
    const parsedUrl = new URL(rawUrl);
    const fromQuery = parsedUrl.searchParams.get('subscriptionId');
    if (!fromQuery) return null;
    const parsed = Number(fromQuery);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    // Fallback для окружений, где URL может прийти в нестандартном формате.
    const match = /[?&]subscriptionId=(\d+)/i.exec(rawUrl);
    if (!match) return null;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }
}

function normalizeCheckoutStatus(
  payload: CheckPaymentStatusResponse | null | undefined
): string | null {
  if (!payload) return null;

  if (payload.providerStatus === 'succeeded' && payload.paid === true) {
    return 'active';
  }

  if (
    payload.providerStatus === 'canceled' ||
    payload.providerStatus === 'expired'
  ) {
    return 'canceled';
  }

  const status = payload.paymentStatus || payload.localStatus;
  if (
    status === 'active' ||
    status === 'pending' ||
    status === 'canceled' ||
    status === 'expired'
  ) {
    return status;
  }

  return null;
}

async function runStatusPolling(targetSubscriptionId?: number | null) {
  if (activePollingPromise) {
    return activePollingPromise;
  }

  const pollingSubscriptionId =
    targetSubscriptionId ?? pendingCheckoutSubscriptionId.value;

  activePollingPromise = (async () => {
    const pollingResult = await runSubscriptionShortPolling(async () => {
      const verifyResponse = await useAPI<CheckPaymentStatusResponse>(
        '/api/subscriptions/check-payment-status',
        {
          method: 'GET',
          query: {
            subscriptionId: pollingSubscriptionId || undefined,
          },
        }
      );

      const resolvedStatus = normalizeCheckoutStatus(verifyResponse);
      if (resolvedStatus) {
        return resolvedStatus;
      }

      if (verifyResponse?.shouldContinuePolling === false) {
        return 'unknown';
      }

      return 'pending';
    });

    if (pollingResult.status === 'active') {
      await subscriptionStore.refreshSubscription();
      await refreshBillingAccessSnapshot();
      pendingCheckoutSubscriptionId.value = null;
      isCheckoutWidgetDialogOpen.value = false;
      await destroyWidget();
      useToast('Подписка активирована', 'Оплата подтверждена.', 'success');
      return;
    }

    if (
      pollingResult.status === 'canceled' ||
      pollingResult.status === 'expired'
    ) {
      await subscriptionStore.refreshSubscription();
      pendingCheckoutSubscriptionId.value = null;
      isCheckoutWidgetDialogOpen.value = false;
      await destroyWidget();
      useToast(
        'Оплата не завершена',
        'Проверьте статус платежа и попробуйте еще раз.',
        'warning'
      );
      return;
    }

    // Если polling завершился timeout/unknown, делаем форс-рефреш состояния,
    // чтобы снять stale-данные после возврата из платежного провайдера.
    const refreshed = await subscriptionStore
      .fetchCurrentSubscription(true)
      .catch(() => null);
    const refreshedStatus = refreshed?.subscription?.paymentStatus || null;

    if (refreshedStatus === 'active') {
      await refreshBillingAccessSnapshot();
      pendingCheckoutSubscriptionId.value = null;
      isCheckoutWidgetDialogOpen.value = false;
      await destroyWidget();
      useToast('Подписка активирована', 'Оплата подтверждена.', 'success');
      return;
    }

    if (refreshedStatus === 'canceled' || refreshedStatus === 'expired') {
      pendingCheckoutSubscriptionId.value = null;
      isCheckoutWidgetDialogOpen.value = false;
      await destroyWidget();
      useToast(
        'Оплата не завершена',
        'Платеж не был подтвержден. Попробуйте еще раз.',
        'warning'
      );
      return;
    }
  })().finally(() => {
    activePollingPromise = null;
  });

  return activePollingPromise;
}

async function refreshBillingAccessSnapshot() {
  // 1) Быстрый и точный entitlement snapshot для paywall-логики.
  await refreshEntitlements().catch((error) => {
    console.warn('[Subscription] Failed to refresh entitlements:', error);
  });
  // 2) Полный user bootstrap (включая billing в /api/user/me).
  await authStore.me().catch((error) => {
    console.warn('[Subscription] Failed to refresh /api/user/me:', error);
  });
}

async function cancelActiveSubscription() {
  if (processing.value) return;

  showCancelSubscriptionDialog.value = false;
  processing.value = true;

  try {
    const response = await useAPI<{
      success: boolean;
      message?: string;
      endDate?: string;
    }>('/api/subscriptions/cancel', {
      method: 'POST',
    });

    await subscriptionStore.refreshSubscription();
    await refreshBillingAccessSnapshot();

    useToast(
      'Автопродление отключено',
      response?.message ||
        'Подписка останется активной до конца оплаченного периода.',
      'info'
    );
  } catch (error: any) {
    console.error('Failed to cancel active subscription:', error);
    useToast(
      'Не удалось отменить подписку',
      error?.message || 'Попробуйте еще раз.',
      'error'
    );
  } finally {
    processing.value = false;
  }
}

async function resumeActiveSubscription() {
  if (processing.value) return;

  showResumeSubscriptionDialog.value = false;
  processing.value = true;

  try {
    await useAPI('/api/subscriptions/resume', {
      method: 'POST',
    });

    await subscriptionStore.refreshSubscription();
    await refreshBillingAccessSnapshot();

    useToast(
      'Автопродление включено',
      'Подписка будет продлена автоматически.',
      'success'
    );
  } catch (error: any) {
    console.error('Failed to resume subscription:', error);

    if (error?.statusMessage === 'payment_method_required') {
      useToast(
        'Привяжите карту',
        'Для автопродления необходимо привязать карту.',
        'warning'
      );
    } else {
      useToast(
        'Не удалось включить автопродление',
        error?.message || 'Попробуйте еще раз.',
        'error'
      );
    }
  } finally {
    processing.value = false;
  }
}

async function cancelScheduledChange() {
  if (processing.value) return;

  processing.value = true;
  try {
    await useAPI('/api/subscriptions/scheduled-change/cancel', {
      method: 'POST',
    });
    await subscriptionStore.refreshSubscription();
    useToast(
      'Будущее списание отменено',
      'Подписка не будет продлена автоматически.',
      'info'
    );
  } catch (error: any) {
    console.error('Failed to cancel scheduled change:', error);
    useToast(
      'Не удалось отменить',
      error?.message || 'Попробуйте еще раз.',
      'error'
    );
  } finally {
    processing.value = false;
  }
}

async function retryChargeNow() {
  if (processing.value) return;

  processing.value = true;
  try {
    const response = await useAPI<{
      status: 'success' | 'failed' | 'processing' | 'noop';
      paymentId?: string;
    }>('/api/subscriptions/retry-charge', {
      method: 'POST',
    });

    await subscriptionStore.refreshSubscription();
    await refreshBillingAccessSnapshot();

    if (response?.status === 'success') {
      useToast('Оплата прошла', 'Подписка активирована.', 'success');
      return;
    }

    if (response?.status === 'noop') {
      useToast(
        'Оплата уже подтверждена',
        'Дополнительный платеж не нужен.',
        'info'
      );
      return;
    }

    if (response?.status === 'processing') {
      useToast(
        'Платеж обрабатывается',
        'Статус обновится автоматически через несколько секунд.',
        'info'
      );
      return;
    }

    useToast(
      'Оплата не прошла',
      'Проверьте карту и попробуйте снова.',
      'warning'
    );
  } catch (error: any) {
    console.error('Manual retry charge failed:', error);
    useToast(
      'Не удалось повторить оплату',
      error?.message || 'Попробуйте позже.',
      'error'
    );
  } finally {
    processing.value = false;
  }
}

async function startPaymentMethodBinding(force: boolean) {
  const response = await useAPI<BindPaymentMethodResponse>(
    '/api/subscriptions/bind-payment-method',
    {
      method: 'POST',
      headers: {
        'Idempotency-Key': nanoid(),
      },
      body: {
        force,
        appUrl: externalFlowAppUrl.value || undefined,
      },
    }
  );

  if (response.checkoutAction === 'noop') {
    await subscriptionStore.refreshSubscription();
    useToast('Карта уже привязана', 'Можно продолжать оплату.', 'info');
    return;
  }

  if (
    response.checkoutAction === 'bind_payment_method_required' &&
    response.paymentMode === 'redirect' &&
    response.paymentUrl
  ) {
    await openExternalBrowser(response.paymentUrl);
    useToast(
      force ? 'Замените карту' : 'Нужно привязать карту',
      'Завершите привязку в YooKassa и вернитесь в приложение.',
      'info'
    );
    return;
  }

  throw new Error('Некорректный ответ bind-payment-method');
}

async function handleBindPaymentMethod() {
  if (processing.value) return;

  processing.value = true;
  try {
    await startPaymentMethodBinding(false);
  } catch (error: any) {
    console.error('Failed to bind payment method:', error);
    useToast(
      'Не удалось запустить привязку',
      error?.message || 'Попробуйте позже.',
      'error'
    );
  } finally {
    processing.value = false;
  }
}

async function handleReplacePaymentMethod() {
  if (processing.value) return;

  processing.value = true;
  try {
    await startPaymentMethodBinding(true);
  } catch (error: any) {
    console.error('Failed to replace payment method:', error);
    useToast(
      'Не удалось запустить замену карты',
      error?.message || 'Попробуйте позже.',
      'error'
    );
  } finally {
    processing.value = false;
  }
}

async function handleUnbindPaymentMethod() {
  if (processing.value) return;

  const shouldUnbind =
    typeof window === 'undefined'
      ? true
      : window.confirm(
          'Отвязать карту автосписания? При необходимости можно привязать новую карту позже.'
        );

  if (!shouldUnbind) return;

  processing.value = true;
  try {
    await useAPI('/api/subscriptions/payment-method/unbind', {
      method: 'POST',
    });
    await subscriptionStore.refreshSubscription();
    await refreshBillingAccessSnapshot();
    useToast(
      'Карта отвязана',
      'Автосписание отключено, будущее списание отменено.',
      'info'
    );
  } catch (error: any) {
    console.error('Failed to unbind payment method:', error);
    useToast(
      'Не удалось отвязать карту',
      error?.message || 'Попробуйте позже.',
      'error'
    );
  } finally {
    processing.value = false;
  }
}

async function openYooKassaWidget(
  confirmationToken: string,
  subscriptionId: number,
  useReturnUrl: boolean
) {
  await $yooKassaWidget.ensureLoaded();

  await destroyWidget();
  isCheckoutWidgetDialogOpen.value = true;
  await nextTick();

  const widgetOptions: YooKassaWidgetOptions = {
    confirmation_token: confirmationToken,
    customization: {
      // Встраиваем виджет в наш контейнер, а не в popup YooKassa.
      modal: false,
      colors: {
        //Цвет акцентных элементов: кнопка Заплатить, выбранные переключатели, опции и текстовые поля
        // control_primary: '#000', //Значение цвета в HEX
        // background: '#000',
      },
    },
    error_callback: (error) => {
      console.error('[Subscription] YooKassa widget error:', error);
      useToast(
        'Ошибка виджета YooKassa',
        'Не удалось открыть или выполнить оплату. Попробуйте еще раз.',
        'error'
      );
    },
  };

  if (useReturnUrl && typeof window !== 'undefined') {
    widgetOptions.return_url = `${window.location.origin}/payment-success?flow=payment&paymentReturn=1&subscriptionId=${subscriptionId}&externalFlow=1`;
  }

  try {
    const widget = await $yooKassaWidget.create(widgetOptions);
    const widgetRenderContainer = checkoutWidgetContainerRef.value;
    const widgetRenderContainerId = YOOKASSA_WIDGET_CONTAINER_ID;
    const isDocumentAvailable = typeof document !== 'undefined';
    const isRenderContainerMounted =
      !!widgetRenderContainer &&
      !!isDocumentAvailable &&
      document.getElementById(widgetRenderContainerId) !== null;

    if (!isRenderContainerMounted) {
      throw new Error('Контейнер YooKassa виджета не найден');
    }

    if (!useReturnUrl) {
      widget.on?.('success', () => {
        isCheckoutWidgetDialogOpen.value = false;
        void runStatusPolling(subscriptionId);
      });

      widget.on?.('fail', () => {
        useToast(
          'Оплата не завершена',
          'Проверьте данные карты и попробуйте снова.',
          'warning'
        );
      });
    }

    widgetInstance = widget;
    await widget.render(widgetRenderContainerId);
  } catch (error) {
    isCheckoutWidgetDialogOpen.value = false;
    await destroyWidget();
    throw error;
  }
}

async function startCheckout(): Promise<boolean> {
  if (!selectedPlanId.value) return false;
  processing.value = true;

  try {
    const plan = selectedPlan.value;
    if (!plan) return false;

    const billingPeriod = planBillingPeriods.value.get(plan.id) || 'month';
    const checkoutMode = resolveCheckoutModeForCurrentContext();
    const externalFlow = resolveExternalFlowFlag();
    const body = {
      planId: plan.id,
      billingPeriod,
      paymentMode: checkoutMode,
      externalFlow,
      appUrl: externalFlowAppUrl.value || undefined,
    };

    if (isNativeIos.value) {
      await openExternalSubscriptionFlow(plan.id, billingPeriod);
      return true;
    }

    ensureCheckoutIdempotencyKey(
      plan.id,
      billingPeriod,
      checkoutMode,
      externalFlow
    );
    const idempotencyKey = checkoutIdempotencyKey.value;
    if (!idempotencyKey) {
      throw new Error('Failed to prepare Idempotency-Key');
    }

    const response = await useAPI<StartCheckoutResponse>(
      '/api/subscriptions/start-checkout',
      {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body,
      }
    );

    const checkoutAction =
      response.checkoutAction ||
      (response.status === 'active' || response.toPay === 0
        ? 'activated'
        : 'payment');

    if (checkoutAction === 'noop') {
      pendingCheckoutSubscriptionId.value = null;
      await subscriptionStore.refreshSubscription();
      await refreshBillingAccessSnapshot();
      useToast('Этот план уже активен', 'Изменения не требуются.', 'info');
      return true;
    }

    if (checkoutAction === 'scheduled_downgrade') {
      pendingCheckoutSubscriptionId.value = null;
      await subscriptionStore.refreshSubscription();
      useToast(
        'Смена запланирована',
        'Новый тариф будет применён в конце текущего периода.',
        'info'
      );
      return true;
    }

    if (checkoutAction === 'activated') {
      pendingCheckoutSubscriptionId.value = null;
      await subscriptionStore.refreshSubscription();
      await refreshBillingAccessSnapshot();
      useToast(
        'Подписка активирована',
        `К оплате: ${response.toPay} ₽`,
        'success'
      );
      return true;
    }

    if (checkoutAction === 'trial_scheduled') {
      pendingCheckoutSubscriptionId.value = null;
      await subscriptionStore.refreshSubscription();
      await refreshBillingAccessSnapshot();
      useToast(
        'Платеж запланирован',
        response.nextChargeAt
          ? `Первое списание будет ${formatDate(response.nextChargeAt)}. Сегодня списаний не будет.`
          : 'Списание будет выполнено в конце пробного периода.',
        'success'
      );
      return true;
    }

    if (checkoutAction === 'bind_payment_method_required') {
      if (response.paymentMode === 'redirect' && response.paymentUrl) {
        pendingCheckoutSubscriptionId.value = null;
        await openExternalBrowser(response.paymentUrl);
        useToast(
          'Нужно привязать карту',
          'Завершите привязку и вернитесь в приложение.',
          'info'
        );
        return true;
      }

      throw new Error(
        'Некорректный ответ bind_payment_method_required: отсутствует paymentUrl'
      );
    }

    if (checkoutAction !== 'payment') {
      throw new Error('Некорректный checkoutAction в ответе сервера');
    }

    if (response.paymentMode === 'widget' && response.confirmationToken) {
      const useReturnUrl = resolveExternalFlowFlag();
      pendingCheckoutSubscriptionId.value = response.subscriptionId;
      await openYooKassaWidget(
        response.confirmationToken,
        response.subscriptionId,
        useReturnUrl
      );
      return true;
    }

    if (response.paymentMode === 'redirect' && response.paymentUrl) {
      pendingCheckoutSubscriptionId.value = response.subscriptionId;
      await openExternalBrowser(response.paymentUrl);
      return true;
    }

    throw new Error(
      'Некорректный ответ checkout: отсутствуют параметры оплаты'
    );
  } catch (error: any) {
    console.error('Checkout error:', error);
    // Тост уже показывает глобальный api.ts onResponseError с message из ответа сервера.
    // Не дублируем, иначе будут два уведомления.
    return false;
  } finally {
    processing.value = false;
  }
}

onMounted(async () => {
  // iOS: получаем storefrontCountryCode (StoreKit) и синхронизируем на backend.
  // Это определяет payment-flow (RU -> YooKassa, остальной мир -> Apple IAP).
  if (isNativeIos.value) {
    try {
      // На paywall запрашиваем storefront принудительно, чтобы не зависеть от старого кэша.
      const storefrontCountryCode = await getIosStorefrontCountryCode({
        forceRefresh: true,
      });
      await useAPI('/api/subscriptions/storefront', {
        method: 'POST',
        body: {
          storefrontCountryCode,
        },
      });
    } catch (error) {
      console.warn('[Subscription] Failed to sync iOS storefront:', error);
      // Без storefront по умолчанию включится Apple IAP (WW-flow), это безопаснее.
    }
  }

  if (!isNativeIos.value && !isNativeAndroid.value && !isCompactMobileWeb()) {
    // Предзагрузка скрипта ускоряет первый показ виджета.
    void $yooKassaWidget.ensureLoaded().catch((error) => {
      console.warn('[Subscription] YooKassa widget preload failed:', error);
    });
  }

  const isPaymentReturnFlow = resolvePaymentReturnFlag();
  const shouldForceSubscriptionRefresh =
    isPaymentReturnFlow || Capacitor.isNativePlatform();

  // После возврата из оплаты сразу обходим кэш, чтобы не показывать stale plan/status.
  await Promise.all([
    subscriptionStore.fetchPlans(),
    subscriptionStore.fetchCurrentSubscription(shouldForceSubscriptionRefresh),
  ]);

  // Для Apple IAP подтягиваем продукты и локализованные цены из StoreKit.
  if (isIosAppleIapFlow.value) {
    appleIapProductsLoadAttempted.value = true;
    await appleIap.loadProducts().catch((error) => {
      const message = resolveUserFacingErrorMessage(error);
      console.warn('[Subscription] Failed to load Apple IAP products:', {
        message,
        error,
      });
      appleIapPricesErrorMessage.value = message;
      useToast(
        'Не удалось загрузить цены App Store',
        message || 'Проверьте интернет и попробуйте снова.',
        'error'
      );
    });

    // MVP без ASN v2: делаем receipt-sync при заходе на экран подписки,
    // чтобы подтягивать продления/отмены/рефанды, пока пользователь не обновил приложение.
    try {
      const result = await appleIap.syncReceipt();
      if (result) {
        try {
          await subscriptionStore.refreshSubscription();
        } catch {
          // ignore
        }
        try {
          await refreshEntitlements();
        } catch {
          // ignore
        }
      }
    } catch (error) {
      console.warn('[Subscription] Apple receipt sync failed:', {
        message: resolveUserFacingErrorMessage(error),
        error,
      });
    }
  }

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

  // Если пришли с paywall, заранее выбираем нужный тариф.
  const rawPlan = route.query.plan;
  const requestedPlan = Array.isArray(rawPlan) ? rawPlan[0] : rawPlan;
  const hasPlanInQuery =
    typeof requestedPlan === 'string' && requestedPlan.trim().length > 0;

  if (typeof requestedPlan === 'string' && requestedPlan.trim().length > 0) {
    const normalized = requestedPlan.trim().toLowerCase();
    const matchedPlan = plans.value.find(
      (plan) => plan.id === normalized || plan.name === normalized
    );

    if (matchedPlan) {
      selectedPlanId.value = matchedPlan.id;
      const requestedPeriod = resolveRequestedPeriod();
      if (requestedPeriod && matchedPlan.name !== 'basic') {
        planBillingPeriods.value.set(matchedPlan.id, requestedPeriod);
      }
    }
  }

  // Если вернулись из bind-flow, повторяем checkout только если карта уже привязана.
  // Если пользователь нажал "Назад" в YooKassa и привязка не завершилась,
  // не запускаем повторный redirect, чтобы не получить бесконечный цикл.
  if (resolveBindReturnFlag()) {
    const selected = selectedPlan.value;
    const isPaidPlan = Boolean(
      selected && (selected.id === 'pro' || selected.id === 'premium')
    );

    const shouldResumeCheckoutAfterBind = hasPlanInQuery && isPaidPlan;
    const boundAfterReturn = await waitForBoundPaymentMethodOnBindReturn();

    if (shouldResumeCheckoutAfterBind && boundAfterReturn) {
      await startCheckout();
    } else if (shouldResumeCheckoutAfterBind && !boundAfterReturn) {
      useToast(
        'Привязка карты не завершена',
        'Вы можете повторить попытку, когда будете готовы.',
        'info'
      );
    } else if (boundAfterReturn) {
      useToast('Карта привязана', 'Способ оплаты обновлён.', 'success');
    } else {
      useToast(
        'Привязка карты не завершена',
        'Вы можете повторить попытку, когда будете готовы.',
        'info'
      );
    }

    await clearBindReturnQueryParams();
  }

  pendingCheckoutSubscriptionId.value = resolveSubscriptionIdFromQuery();

  if (isPaymentReturnFlow) {
    if (pendingCheckoutSubscriptionId.value !== null) {
      await runStatusPolling(pendingCheckoutSubscriptionId.value);
    } else {
      await subscriptionStore.fetchCurrentSubscription(true);
      await refreshBillingAccessSnapshot();
    }

    await clearPaymentReturnQueryParams();
  }

  if (typeof window !== 'undefined' && !paymentReturnListener) {
    paymentReturnListener = (event: Event) => {
      const subscriptionIdFromEvent =
        resolveSubscriptionIdFromPaymentReturnEvent(event);

      if (subscriptionIdFromEvent !== null) {
        pendingCheckoutSubscriptionId.value = subscriptionIdFromEvent;
      }

      void runStatusPolling(
        subscriptionIdFromEvent ?? pendingCheckoutSubscriptionId.value
      );
    };
    window.addEventListener('mentala:payment-return', paymentReturnListener);
  }
});

onBeforeUnmount(async () => {
  if (typeof window !== 'undefined' && paymentReturnListener) {
    window.removeEventListener('mentala:payment-return', paymentReturnListener);
    paymentReturnListener = null;
  }
  isCheckoutWidgetDialogOpen.value = false;
  await destroyWidget();
});
</script>
