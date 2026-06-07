<template>
  <div
    class="relative h-full xs:space-y-3 space-y-1 overflow-y-auto pb-[112px]"
  >
    <PageHeader
      :title="item?.shortTitle || 'Опросник'"
      show-back-button
      @go-back="goBack"
    />

    <section v-if="status === 'pending'" class="px-1 pt-3">
      <Skeleton type="practice-page" :count="1" />
    </section>

    <section
      v-else-if="error || !item"
      class="mx-1 rounded-2xl border border-destructive/20 bg-destructive/5 p-5 text-sm text-destructive"
    >
      Не удалось открыть опросник. Попробуй вернуться и запустить его ещё раз.
    </section>

    <section v-else class="xs:space-y-3 space-y-1 px-1">
      <AssessmentRunner
        :slug="slug"
        :source="source"
        :linked-program-slug="linkedProgramSlug"
        :linked-program-attempt-id="linkedProgramAttemptId"
        :inline-result="false"
        @complete="onComplete"
        @prev="goBack"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import PageHeader from '@/app/components/PageHeader.vue';
import AssessmentRunner from '@/app/components/assessments/AssessmentRunner.vue';
import Skeleton from '@/app/components/ui/Skeleton.vue';
import { useAPI } from '@/app/composables/useAPI';
import type {
  AssessmentAttemptSource,
  AssessmentRunResponse,
} from '@/shared/dto/assessments';

const route = useRoute();
const router = useRouter();

const slug = computed(() => String(route.params.slug || ''));

const { data, status, error } = await useAPI<AssessmentRunResponse>(
  () => `/api/assessments/${slug.value}/run`,
  {
    useFetch: true,
    key: `assessment-run-${slug.value}`,
  }
);

const item = computed(() => data.value?.item ?? null);

const source = computed<AssessmentAttemptSource>(() => {
  const value = String(route.query.source || '');
  if (value === 'program_baseline' || value === 'program_final') return value;
  return 'practice_page';
});
const linkedProgramSlug = computed(() =>
  getNullableStringQuery('linkedProgramSlug')
);
const linkedProgramAttemptId = computed(() => {
  const raw = Number(route.query.linkedProgramAttemptId);
  return Number.isInteger(raw) && raw > 0 ? raw : null;
});

function getNullableStringQuery(key: string): string | null {
  const value = route.query[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function goBack() {
  const returnTo = getNullableStringQuery('returnTo');
  if (returnTo?.startsWith('/programs/')) {
    void router.push(returnTo);
    return;
  }
  if (item.value?.slug) {
    void router.push(`/practices/assessments/${item.value.slug}`);
    return;
  }
  void router.push('/practices/assessments');
}

async function onComplete(payload: { attemptId: number }) {
  await router.push(
    `/practices/assessments/${slug.value}/results/${payload.attemptId}`
  );
}
</script>
