<template>
  <div
    v-if="!shouldHideIosReviewBillingUi"
    class="h-dvh overflow-y-auto pb-[100px] space-y-2"
  >
    <PageHeader
      title="Пригласи друга"
      :show-back-button="true"
      @go-back="goBack"
    />

    <ReferralSharePanel />
  </div>
</template>

<script setup lang="ts">
import { ref, watchEffect } from 'vue';
import { useIosReviewBillingUi } from '@/app/composables/useIosReviewBillingUi';
import ReferralSharePanel from '@/app/components/subscription/ReferralSharePanel.vue';

const { shouldHideIosReviewBillingUi } = useIosReviewBillingUi();
const reviewRedirectStarted = ref(false);

// Не даём review-аккаунту попасть на referral-экран в native iOS.
watchEffect(() => {
  if (
    import.meta.server ||
    reviewRedirectStarted.value ||
    !shouldHideIosReviewBillingUi.value
  ) {
    return;
  }

  reviewRedirectStarted.value = true;
  void navigateTo('/settings', { replace: true });
});

function goBack() {
  navigateTo('/settings');
}
</script>
