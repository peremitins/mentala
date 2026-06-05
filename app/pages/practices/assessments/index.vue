<template>
  <div
    class="relative h-full xs:space-y-3 space-y-1 overflow-y-auto pb-[100px] rounded-lg"
  >
    <PageHeader title="Оценка состояния" show-back-button @go-back="goBack" />

    <section class="xs:space-y-3 space-y-1 px-1">
      <Skeleton v-if="status === 'pending'" type="list-item" :count="4" />

      <div
        v-else-if="error"
        class="rounded-2xl border border-destructive/20 bg-destructive/5 p-5 text-sm text-destructive"
      >
        Не удалось загрузить опросники. Попробуй открыть раздел ещё раз.
      </div>

      <div v-else class="grid grid-cols-1 xs:gap-3 gap-1">
        <AssessmentCard
          v-for="(item, index) in items"
          :key="item.slug"
          :item="item"
          :index="Number(index)"
          :locked="isLocked(item)"
          @open-detail="handleOpenDetail"
          @open-result="handleOpenResult"
        />
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
import PageHeader from '@/app/components/PageHeader.vue';
import AssessmentCard from '@/app/components/assessments/AssessmentCard.vue';
import FeaturePaywallModal from '@/app/components/subscription/FeaturePaywallModal.vue';
import Skeleton from '@/app/components/ui/Skeleton.vue';
import { useAPI } from '@/app/composables/useAPI';
import { useEntitlements } from '@/app/composables/useEntitlements';
import type {
  AssessmentListItem,
  AssessmentListResponse,
} from '@/shared/dto/assessments';
import { ASSESSMENTS_FEATURE_KEY } from '@/shared/constants/assessments';

const router = useRouter();
const { getFeatureAccess } = useEntitlements();

const paywallOpen = ref(false);
const assessmentsAccess = computed(() =>
  getFeatureAccess(ASSESSMENTS_FEATURE_KEY)
);

const { data, status, error } = await useAPI<AssessmentListResponse>(
  '/api/assessments',
  {
    useFetch: true,
    key: 'assessments-list',
  }
);

const items = computed(() => data.value?.items ?? []);

function goBack() {
  void router.push('/practices');
}

function isLocked(item: AssessmentListItem): boolean {
  return item.status === 'active' && !assessmentsAccess.value.available;
}

async function handleOpenDetail(item: AssessmentListItem) {
  await router.push(`/practices/assessments/${item.slug}`);
}

async function handleOpenResult(item: AssessmentListItem) {
  if (!item.lastAttempt) return;
  if (!assessmentsAccess.value.available) {
    paywallOpen.value = true;
    return;
  }
  await router.push(
    `/practices/assessments/${item.slug}/results/${item.lastAttempt.attemptId}`
  );
}
</script>
