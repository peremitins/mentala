<template>
  <section class="glass-deep rounded-xl border border-border/70 p-4 space-y-4">
    <div class="space-y-1">
      <h3 class="text-sm font-semibold text-foreground">Активные бонусы</h3>
    </div>

    <div v-if="loading" class="text-xs text-foreground/60">Загружаем…</div>

    <div v-else class="space-y-3">
      <div
        v-if="active?.activeAccessGrant"
        class="rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-1"
      >
        <p class="text-sm font-medium text-foreground">
          Доступ к
          {{
            active.activeAccessGrant.planId === 'premium' ? 'Premium' : 'PRO'
          }}
        </p>
        <p class="text-xs text-foreground/75">
          До {{ formatDate(active.activeAccessGrant.endsAt) }}
        </p>
        <p class="text-xs text-foreground/60">
          {{ active.activeAccessGrant.sourceLabel }}
        </p>
      </div>

      <div
        v-for="discount in active?.pendingDiscounts || []"
        :key="discount.id"
        class="rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-1"
      >
        <p class="text-sm font-medium text-foreground">
          Скидка {{ discount.percent }}% на ближайший платёж
        </p>
        <p class="text-xs text-foreground/60">{{ discount.sourceLabel }}</p>
      </div>

      <div
        v-if="!active?.activeAccessGrant && !active?.pendingDiscounts?.length"
        class="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-xs text-foreground/60"
      >
        Пока нет активных бонусов.
      </div>

      <div
        v-if="active?.effectiveBillingShiftDays"
        class="rounded-xl border border-sky-400/20 bg-sky-400/10 p-4 text-xs text-foreground/85"
      >
        Ближайшая платёжная граница уже сдвинута на
        {{ active.effectiveBillingShiftDays }} дн.
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';

const props = defineProps<{
  refreshKey?: number;
}>();

const loading = ref(false);
const active = ref<{
  activeAccessGrant: {
    id: number;
    planId: 'pro' | 'premium';
    endsAt: string;
    sourceLabel: string;
  } | null;
  pendingDiscounts: Array<{
    id: number;
    percent: number;
    expiresAt: string | null;
    sourceLabel: string;
  }>;
  effectiveBillingShiftDays: number;
} | null>(null);

function formatDate(value?: string | null) {
  if (!value) return 'без срока';

  return new Date(value).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

async function loadActiveBonuses() {
  loading.value = true;

  try {
    active.value = await useAPI<any>('/api/promo-codes/active', {
      method: 'GET',
    });
  } catch {
    active.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadActiveBonuses();
});

watch(
  () => props.refreshKey,
  () => {
    void loadActiveBonuses();
  }
);
</script>
