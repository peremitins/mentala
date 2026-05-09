<template>
  <section
    id="access-code-panel"
    class="glass-deep rounded-xl border border-border/70 p-4 space-y-4"
  >
    <div class="space-y-1">
      <div class="flex items-center justify-between gap-3">
        <h3 class="text-sm font-semibold text-foreground">Промокод</h3>
      </div>
    </div>

    <div class="flex flex-col gap-3 sm:flex-row">
      <Input
        ref="inputRef"
        v-model="code"
        placeholder="Промокод или код друга"
        maxlength="64"
        class="h-11 bg-white/5 uppercase"
        @input="normalizeCode"
        @keydown.enter.prevent="handlePreview"
      />
      <Button
        variant="outline"
        class="sm:min-w-[136px]"
        :disabled="loading.preview || !normalizedCode"
        @click="handlePreview"
      >
        {{ loading.preview ? 'Проверяем…' : 'Проверить' }}
      </Button>
    </div>

    <p v-if="errorMessage" class="text-xs text-red-300">{{ errorMessage }}</p>

    <div
      v-if="preview"
      class="rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-3"
    >
      <div class="space-y-1">
        <p class="text-sm font-medium text-foreground">{{ preview.title }}</p>
        <p class="text-xs leading-relaxed text-foreground/75">
          {{ preview.description }}
        </p>
      </div>

      <div
        v-if="preview.warning"
        class="rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs text-foreground/85"
      >
        {{ preview.warning }}
      </div>

      <div class="flex items-center justify-between gap-3">
        <div class="text-xs text-foreground/70">{{ rewardSummary }}</div>
        <Button :disabled="loading.redeem" @click="handleRedeem">
          {{ redeemButtonLabel }}
        </Button>
      </div>
    </div>

    <div
      v-if="successMessage"
      class="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-foreground"
    >
      {{ successMessage }}
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRoute } from '#app';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/shadcn/input';

type PromoPreview = {
  kind: 'promo';
  campaignId: number;
  code: string;
  campaignType: 'free_access_days' | 'next_payment_percent_discount';
  title: string;
  description: string;
  warning: string | null;
  effect: {
    accessPlanId?: 'pro' | 'premium' | null;
    durationDays?: number | null;
    percent?: number | null;
  };
};

type ReferralPreview = {
  kind: 'referral';
  title: string;
  description: string;
  warning: string | null;
  reward: {
    inviteePercent: number;
    referrerPercent: number;
    inviteeRewardValidityDays: number;
    creditHoldDays: number;
  };
};

type AccessCodePreview = PromoPreview | ReferralPreview;

const emit = defineEmits<{
  changed: [];
}>();

const route = useRoute();
const inputRef = ref<InstanceType<typeof Input> | null>(null);
const code = ref('');
const preview = ref<AccessCodePreview | null>(null);
const successMessage = ref('');
const errorMessage = ref('');
const loading = ref({
  preview: false,
  redeem: false,
});

const normalizedCode = computed(() =>
  code.value.trim().toUpperCase().replace(/\s+/g, '')
);

const rewardSummary = computed(() => {
  const value = preview.value;
  if (!value) return '';

  if (value.kind === 'promo') {
    if (value.campaignType === 'free_access_days') {
      const planLabel =
        value.effect.accessPlanId === 'premium' ? 'Premium' : 'PRO';
      return `${value.effect.durationDays} дн. доступа к ${planLabel}`;
    }
    return `Скидка ${value.effect.percent}% на ближайший платёж`;
  }

  return `Скидка ${value.reward.inviteePercent}% на ваш следующий платёж`;
});

const redeemButtonLabel = computed(() => {
  if (loading.value.redeem) return 'Применяем…';
  return preview.value?.kind === 'referral' ? 'Активировать' : 'Применить';
});

function normalizeCode() {
  code.value = normalizedCode.value;
}

function extractErrorMessage(error: any) {
  return (
    error?.data?.statusMessage ||
    error?.data?.message ||
    error?.message ||
    'Не удалось обработать промокод'
  );
}

async function handlePreview() {
  if (!normalizedCode.value) return;

  loading.value.preview = true;
  errorMessage.value = '';
  successMessage.value = '';

  try {
    preview.value = await useAPI<AccessCodePreview>(
      '/api/access-codes/preview',
      {
        method: 'POST',
        body: {
          code: normalizedCode.value,
        },
      }
    );
  } catch (error: any) {
    preview.value = null;
    errorMessage.value = extractErrorMessage(error);
  } finally {
    loading.value.preview = false;
  }
}

async function handleRedeem() {
  if (!normalizedCode.value) return;

  loading.value.redeem = true;
  errorMessage.value = '';

  try {
    const response = await useAPI<{
      kind: 'promo' | 'referral';
      message: string;
    }>('/api/access-codes/redeem', {
      method: 'POST',
      body: {
        code: normalizedCode.value,
      },
    });

    successMessage.value = response.message || 'Код успешно применён.';
    const toastTitle =
      response.kind === 'referral' ? 'Код активирован' : 'Промокод применён';
    preview.value = null;
    code.value = '';
    useToast(toastTitle, successMessage.value);
    emit('changed');
  } catch (error: any) {
    errorMessage.value = extractErrorMessage(error);
  } finally {
    loading.value.redeem = false;
  }
}

onMounted(async () => {
  if (route.query.promo === '1') {
    await nextTick();
    const inputElement =
      inputRef.value?.$el?.querySelector?.('input') ||
      (inputRef.value as any)?.$el;
    inputElement?.focus?.();
  }
});
</script>
