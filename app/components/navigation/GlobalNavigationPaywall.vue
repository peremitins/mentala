<template>
  <FeaturePaywallModal
    :open="store.open"
    :feature-key="store.featureKey"
    :required-plan="paywallAccess?.requiredPlan ?? null"
    :paywall="paywallAccess?.paywall ?? null"
    @update:open="handleOpenChange"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import FeaturePaywallModal from '@/app/components/subscription/FeaturePaywallModal.vue';
import { useEntitlements } from '@/app/composables/useEntitlements';
import { useAppNavigationStore } from '@/app/stores/appNavigation';

const store = useAppNavigationStore();
const { getFeatureAccess } = useEntitlements();

const paywallAccess = computed(() =>
  store.featureKey ? getFeatureAccess(store.featureKey) : null
);

function handleOpenChange(value: boolean) {
  if (value) {
    store.open = true;
    return;
  }

  store.clearPaywall();
}
</script>
