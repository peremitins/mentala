<template>
  <div
    class="relative h-full xs:space-y-3 space-y-1 overflow-y-auto pb-[100px] rounded-lg"
  >
    <PageHeader title="Результат" show-back-button @go-back="goBack" />

    <section v-if="isLoading" class="xs:space-y-3 space-y-1 px-1">
      <Skeleton type="practice-page" :count="1" />
      <Skeleton type="list-item" :count="2" />
    </section>

    <section
      v-else-if="hasError || !resultItem || !definition || !band"
      class="mx-1 rounded-2xl border border-destructive/20 bg-destructive/5 p-5 text-sm text-destructive"
    >
      Не удалось открыть результат. Попробуй вернуться в раздел оценки
      состояния.
    </section>

    <section v-else class="xs:space-y-3 space-y-1 px-1">
      <AssessmentResultSummary
        :title="band.title"
        :short-text="band.shortText"
        :score="resultItem.totalScore"
        :category="definition.category"
        :comparison-text="comparison?.text"
        :safety-level="band.safetyLevel"
        :min-score="definition.scoring.minScore"
        :max-score="definition.scoring.maxScore"
        :score-direction="definition.scoreDirection"
        :bands="definition.resultBands"
        :active-band-id="band.id"
      />

      <article class="glass-deep rounded-lg p-5">
        <div class="space-y-4">
          <div class="space-y-2">
            <h2 class="text-base font-semibold text-foreground">
              Что это значит
            </h2>
            <p class="text-sm leading-relaxed text-foreground/70">
              {{ band.description }}
            </p>
          </div>
          <div
            class="space-y-1 rounded-2xl border border-white/10 bg-white/[0.08] p-4"
          >
            <p class="text-sm font-semibold text-foreground">Что дальше</p>
            <p class="text-sm leading-relaxed text-foreground/70">
              {{ band.recommendationText }}
            </p>
          </div>
          <p class="text-xs leading-relaxed text-foreground/48">
            Пройдено {{ formattedCompletedAt }}. Результат не является
            диагнозом, медицинским заключением или оценкой личности.
          </p>
        </div>
      </article>

      <AssessmentTrendChart
        :points="chartPoints"
        :score-direction="definition.scoreDirection"
        :min-score="definition.scoring.minScore"
        :max-score="definition.scoring.maxScore"
      />

      <div class="grid grid-cols-1 gap-2">
        <Button class="w-full active:scale-[0.98]" size="lg" @click="openNext">
          {{ band.nextAction.label }}
        </Button>
        <Button
          class="w-full active:scale-[0.98]"
          size="lg"
          @click="goToAssessments"
        >
          К оценке состояния
        </Button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import PageHeader from '@/app/components/PageHeader.vue';
import AssessmentResultSummary from '@/app/components/assessments/AssessmentResultSummary.vue';
import AssessmentTrendChart from '@/app/components/assessments/AssessmentTrendChart.vue';
import Skeleton from '@/app/components/ui/Skeleton.vue';
import { Button } from '@/app/components/ui/button';
import { useAPI } from '@/app/composables/useAPI';
import type {
  AssessmentChartResponse,
  AssessmentResultResponse,
  AssessmentRunResponse,
} from '@/shared/dto/assessments';

const route = useRoute();
const router = useRouter();

const slug = computed(() => String(route.params.slug || ''));
const attemptId = computed(() => Number(route.params.attemptId));

const resultRequest = await useAPI<AssessmentResultResponse>(
  () => `/api/assessments/${slug.value}/attempts/${attemptId.value}`,
  {
    useFetch: true,
    key: `assessment-result-${slug.value}-${attemptId.value}`,
  }
);
const definitionRequest = await useAPI<AssessmentRunResponse>(
  () => `/api/assessments/${slug.value}/run`,
  {
    useFetch: true,
    key: `assessment-result-definition-${slug.value}`,
  }
);
const chartRequest = await useAPI<AssessmentChartResponse>(
  () => `/api/assessments/${slug.value}/chart`,
  {
    useFetch: true,
    key: `assessment-chart-${slug.value}`,
  }
);

const resultItem = computed(() => resultRequest.data.value?.item ?? null);
const comparison = computed(() => resultRequest.data.value?.comparison ?? null);
const definition = computed(() => definitionRequest.data.value?.item ?? null);
const chartPoints = computed(() => chartRequest.data.value?.points ?? []);
const band = computed(() => {
  if (!definition.value || !resultItem.value) return null;
  return (
    definition.value.resultBands.find(
      (item: any) => item.id === resultItem.value?.bandId
    ) ?? null
  );
});

const isLoading = computed(
  () =>
    resultRequest.status.value === 'pending' ||
    definitionRequest.status.value === 'pending' ||
    chartRequest.status.value === 'pending'
);
const hasError = computed(
  () =>
    Boolean(resultRequest.error.value) ||
    Boolean(definitionRequest.error.value) ||
    Boolean(chartRequest.error.value)
);

const formattedCompletedAt = computed(() => {
  if (!resultItem.value) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(resultItem.value.completedAt));
});

async function openNext() {
  const action = band.value?.nextAction;
  if (!action) return;
  if (action.type === 'program') {
    await router.push(`/programs/${action.slug}/map`);
    return;
  }
  if (action.type === 'sos') {
    await router.push('/quick-help');
    return;
  }
  await router.push('/practices');
}

async function goToAssessments() {
  await router.push('/practices/assessments');
}

function goBack() {
  void router.push(`/practices/assessments/${slug.value}`);
}
</script>
