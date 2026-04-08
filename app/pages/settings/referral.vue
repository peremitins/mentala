<template>
  <div class="h-dvh overflow-y-auto pb-[100px] space-y-2">
    <PageHeader
      title="Пригласи друга"
      :show-back-button="true"
      @go-back="goBack"
    />

    <ReferralSharePanel />
  </div>
</template>

<script setup lang="ts">
import ReferralSharePanel from '@/app/components/subscription/ReferralSharePanel.vue';

function goBack() {
  navigateTo('/settings');
}
</script>
