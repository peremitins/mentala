<template>
  <div
    class="relative h-full xs:space-y-3 space-y-1 overflow-y-auto pb-[100px] rounded-lg"
  >
    <PageHeader
      :title="item?.shortTitle || 'Оценка'"
      show-back-button
      @go-back="goBack"
    />

    <section v-if="status === 'pending'" class="px-1 pt-3">
      <Skeleton type="practice-page" :count="1" />
    </section>

    <section
      v-else-if="error || !item"
      class="rounded-2xl border border-destructive/20 bg-destructive/5 p-5 text-sm text-destructive"
    >
      Не удалось открыть описание оценки.
    </section>

    <section v-else class="xs:space-y-3 space-y-1 px-1">
      <div class="glass-deep relative overflow-hidden rounded-lg xs:p-5 p-4">
        <div class="relative space-y-5">
          <div class="space-y-2">
            <p class="text-sm leading-relaxed text-foreground/70">
              {{ item.description }}
            </p>
          </div>

          <div class="grid grid-cols-3 gap-2 text-center">
            <div class="rounded-2xl border border-white/10 bg-white/[0.08] p-3">
              <p class="text-lg font-semibold text-foreground">
                {{ item.questionsCount || '—' }}
              </p>
              <p class="text-xs text-foreground/50">вопросов</p>
            </div>
            <div class="rounded-2xl border border-white/10 bg-white/[0.08] p-3">
              <p class="text-lg font-semibold text-foreground">
                {{ item.estimatedMinutes }}
              </p>
              <p class="text-xs text-foreground/50">минуты</p>
            </div>
            <div class="rounded-2xl border border-white/10 bg-white/[0.08] p-3">
              <p class="text-lg font-semibold text-foreground">
                {{ item.scoring.minScore }}-{{ item.scoring.maxScore }}
              </p>
              <p class="text-xs text-foreground/50">шкала</p>
            </div>
          </div>

          <button
            v-if="item.lastAttempt"
            type="button"
            class="group/result w-full rounded-2xl border border-white/12 bg-white/[0.08] p-4 text-left transition hover:border-white/24 hover:bg-white/[0.12] active:scale-[0.99]"
            :aria-label="lastResultButtonLabel"
            @click="openLastResult"
          >
            <span class="block">
              <span class="flex items-start justify-between gap-3">
                <span
                  class="block text-xs font-medium uppercase tracking-[0.12em] text-foreground/45"
                >
                  Последний результат
                </span>
                <span class="flex shrink-0 items-center gap-1">
                  <IconChevronRight
                    class="h-4 w-4 text-foreground/45 transition group-hover/result:translate-x-0.5 group-hover/result:text-foreground/70"
                    aria-hidden="true"
                  />
                </span>
              </span>
              <span class="mt-1 block text-sm font-semibold text-foreground">
                {{ item.lastAttempt.totalScore }} баллов ·
                {{ formattedLastAttemptDate }}
              </span>
              <span class="mt-2 flex min-w-0 items-center gap-2">
                <span
                  class="flex h-1.5 w-[64px] shrink-0 gap-0.5"
                  aria-hidden="true"
                >
                  <span
                    v-for="segment in lastResultBadge.scaleSegments"
                    :key="segment.id"
                    class="h-full flex-1 rounded-full"
                    :class="segment.className"
                  />
                </span>
                <span
                  class="min-w-0 truncate text-xs font-semibold leading-none"
                  :class="lastResultBadge.textClassName"
                >
                  {{ lastResultBadge.label }}
                </span>
              </span>
            </span>
          </button>

          <Button
            class="w-full active:scale-[0.98]"
            size="lg"
            :disabled="item.status !== 'active'"
            @click="handleStart"
          >
            {{ startLabel }}
          </Button>
        </div>
      </div>
    </section>

    <FeaturePaywallModal
      v-model:open="paywallOpen"
      :feature-key="ASSESSMENTS_FEATURE_KEY"
      :required-plan="assessmentsAccess.requiredPlan"
      :paywall="assessmentsAccess.paywall"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import IconChevronRight from '~icons/lucide/chevron-right';
import PageHeader from '@/app/components/PageHeader.vue';
import FeaturePaywallModal from '@/app/components/subscription/FeaturePaywallModal.vue';
import Skeleton from '@/app/components/ui/Skeleton.vue';
import { Button } from '@/app/components/ui/button';
import { useAPI } from '@/app/composables/useAPI';
import { useEntitlements } from '@/app/composables/useEntitlements';
import { getAssessmentResultBadge } from '@/app/lib/assessmentResultBadge';
import type { AssessmentDetailResponse } from '@/shared/dto/assessments';
import { ASSESSMENTS_FEATURE_KEY } from '@/shared/constants/assessments';

const route = useRoute();
const router = useRouter();
const { getFeatureAccess } = useEntitlements();

const slug = computed(() => String(route.params.slug || ''));
const paywallOpen = ref(false);
const assessmentsAccess = computed(() =>
  getFeatureAccess(ASSESSMENTS_FEATURE_KEY)
);

const { data, status, error } = await useAPI<AssessmentDetailResponse>(
  () => `/api/assessments/${slug.value}`,
  {
    useFetch: true,
    key: `assessment-detail-${slug.value}`,
  }
);

const item = computed(() => data.value?.item ?? null);

const startLabel = computed(() => {
  if (!item.value || item.value.status !== 'active') {
    return item.value?.lockedCopy.ctaText ?? 'Откроется позже';
  }
  return assessmentsAccess.value.available
    ? 'Пройти'
    : item.value.lockedCopy.ctaText;
});

const formattedLastAttemptDate = computed(() => {
  if (!item.value?.lastAttempt) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(item.value.lastAttempt.completedAt));
});

const lastResultBadge = computed(() =>
  getAssessmentResultBadge({
    bandId: item.value?.lastAttempt?.bandId ?? '',
    scoreDirection: item.value?.scoreDirection ?? 'custom',
    category: item.value?.category,
  })
);

const lastResultButtonLabel = computed(() => {
  if (!item.value?.lastAttempt) return 'Открыть последний результат';
  return `Открыть последний результат: ${item.value.lastAttempt.totalScore} баллов, ${lastResultBadge.value.label}`;
});

function goBack() {
  void router.push('/practices/assessments');
}

async function handleStart() {
  if (!item.value || item.value.status !== 'active') return;

  if (!assessmentsAccess.value.available) {
    paywallOpen.value = true;
    return;
  }

  await router.push(`/practices/assessments/${item.value.slug}/run`);
}

async function openLastResult() {
  if (!item.value?.lastAttempt) return;

  if (!assessmentsAccess.value.available) {
    paywallOpen.value = true;
    return;
  }

  await router.push(
    `/practices/assessments/${item.value.slug}/results/${item.value.lastAttempt.attemptId}`
  );
}
</script>
