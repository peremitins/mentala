<template>
  <Dialog :open="open" @update:open="onOpenChange">
    <DialogContent
      overlay-class="z-[190] bg-black/70"
      class="z-[200] glass-deep border-white/15 text-foreground sm:max-w-md"
    >
      <DialogHeader class="space-y-2">
        <div
          class="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs"
        >
          <span aria-hidden="true" class="text-sm leading-none">{{
            badgeEmoji
          }}</span>
          <span>{{ badgeLabel }}</span>
        </div>
        <DialogTitle class="sr-only">Ограничение тарифа</DialogTitle>
        <h2 class="text-center text-sm font-semibold text-foreground">
          {{ paywallDescription }}
        </h2>
      </DialogHeader>

      <div class="mt-3 flex gap-2">
        <Button class="flex-1" @click="goToSubscription">
          {{ ctaText }}
        </Button>
        <Button variant="outline" class="flex-1" @click="onOpenChange(false)">
          Позже
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { navigateTo } from '#app';
import { Button } from '@/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';

type PlanId = 'basic' | 'pro' | 'premium';
type LockIcon = 'pro' | 'premium';
type PaywallTargetPlan = 'pro' | 'premium';

type FeaturePaywall = {
  title: string;
  description: string;
  ctaText: string;
  targetPlan: PaywallTargetPlan;
  lockIcon: LockIcon;
};

function normalizePaywallText(text: string, requiredPlan: PlanId): string {
  if (!text) return text;

  if (requiredPlan === 'pro') {
    return (
      text
        .replace(
          /в\s+PRO(?!\s+и\s+Premium|\s+или\s+Premium)\b/gi,
          'в PRO и Premium'
        )
        .replace(/только\s+PRO\b/gi, 'PRO и Premium')
        .replace(/на\s+PRO(?!\s+и\s+Premium)\b/gi, 'на PRO и Premium')
        .replace(/PRO\s+и\s+выше/gi, 'PRO и Premium')
        .replace(/Подключи\s+PRO\s+и\s+Premium/gi, 'Подключи PRO или Premium')
        .replace(
          /Подключи\s+PRO(?!\s+или\s+Premium|\s+и\s+Premium)\b/gi,
          'Подключи PRO или Premium'
        )
        .replace(/Перейти\s+на\s+PRO\b/gi, 'Перейти на тариф')
        .replace(/Выбрать\s+PRO\b/gi, 'Выбрать тариф')
        .replace(/Открыть\s+PRO\b/gi, 'Выбрать тариф')
        .replace(/расширенных тарифах/gi, 'PRO и Premium')
        .replace(/платных тарифах/gi, 'PRO и Premium')
        .replace(/по подписке/gi, 'в PRO и Premium')
        .replace(/расширенный тариф/gi, 'PRO')
        .replace(/Открыть доступ/gi, 'Выбрать тариф')
        // Защитная дедупликация, если текст уже пришёл в расширенном виде.
        .replace(/(PRO\s+и\s+Premium)(\s+и\s+Premium)+/gi, '$1')
        .replace(/(PRO\s+или\s+Premium)(\s+или\s+Premium)+/gi, '$1')
    );
  }

  if (requiredPlan === 'premium') {
    return text
      .replace(/PRO\s*и\s*Premium/gi, 'Premium')
      .replace(/PRO\s*или\s*Premium/gi, 'Premium');
  }

  return text;
}

const props = withDefaults(
  defineProps<{
    open: boolean;
    featureKey?: string | null;
    requiredPlan?: PlanId | null;
    paywall?: FeaturePaywall | null;
  }>(),
  {
    featureKey: null,
    requiredPlan: null,
    paywall: null,
  }
);

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const targetPlan = computed<PaywallTargetPlan>(() => {
  if (props.paywall?.targetPlan) {
    return props.paywall.targetPlan;
  }
  return props.requiredPlan === 'premium' ? 'premium' : 'pro';
});

const requiredPlanResolved = computed<PlanId>(() => {
  if (
    props.requiredPlan === 'basic' ||
    props.requiredPlan === 'pro' ||
    props.requiredPlan === 'premium'
  ) {
    return props.requiredPlan;
  }
  return targetPlan.value === 'premium' ? 'premium' : 'pro';
});

const iconType = computed<LockIcon>(() => {
  if (props.paywall?.lockIcon) {
    return props.paywall.lockIcon;
  }
  return targetPlan.value === 'premium' ? 'premium' : 'pro';
});

const badgeLabel = computed(() => {
  if (requiredPlanResolved.value === 'premium') {
    return 'Premium';
  }
  if (requiredPlanResolved.value === 'pro') {
    return 'Доступно в PRO и Premium';
  }
  return iconType.value === 'premium' ? 'Premium' : 'Доступно в PRO и Premium';
});

const badgeEmoji = computed(() => {
  if (requiredPlanResolved.value === 'premium') {
    return '💎';
  }
  return '⭐';
});

const paywallDescription = computed(() => {
  if (props.paywall?.description) {
    return normalizePaywallText(
      props.paywall.description,
      requiredPlanResolved.value
    );
  }
  return 'Подключи подходящий тариф, чтобы открыть эту возможность.';
});

const ctaText = computed(() => {
  if (props.paywall?.ctaText && requiredPlanResolved.value === 'premium') {
    return normalizePaywallText(
      props.paywall.ctaText,
      requiredPlanResolved.value
    );
  }
  return 'Выбрать тариф';
});

function onOpenChange(value: boolean) {
  emit('update:open', value);
}

async function goToSubscription() {
  onOpenChange(false);
  await navigateTo({
    path: '/subscription',
    query: {
      plan: targetPlan.value,
      feature: props.featureKey || undefined,
    },
  });
}
</script>
