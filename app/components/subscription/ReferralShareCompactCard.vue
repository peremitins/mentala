<template>
  <ReferralSummaryCard
    v-if="visible && (loading || summary)"
    :loading="loading"
    :summary="summary"
    :interactive="true"
    :show-chevron="true"
    @open="openDetails"
    @copy="handleCopyCode"
    @share="handleShareCode"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ReferralSummaryCard from '@/app/components/subscription/ReferralSummaryCard.vue';
import { useReferralSummary } from '@/app/composables/useReferralSummary';

const props = withDefaults(
  defineProps<{
    refreshKey?: number;
    visible?: boolean;
  }>(),
  {
    visible: true,
  }
);

const visible = computed(() => props.visible);
const refreshKey = computed(() => props.refreshKey);

const { loading, summary, handleCopyCode, handleShareCode } =
  useReferralSummary({
    visible,
    refreshKey,
  });

function openDetails() {
  void navigateTo('/settings/referral');
}
</script>
