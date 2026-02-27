<template>
  <div class="min-h-screen px-4 py-8">
    <div
      class="mx-auto max-w-xl rounded-2xl border border-border glass-deep p-6"
    >
      <p class="text-sm text-foreground">
        Перенаправляем на страницу подписки...
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();

const subscriptionLink = computed(() => {
  const rawSubscriptionId = route.query.subscriptionId;
  const subscriptionId = Array.isArray(rawSubscriptionId)
    ? rawSubscriptionId[0]
    : rawSubscriptionId;

  const rawExternalFlow = route.query.externalFlow;
  const externalFlow = Array.isArray(rawExternalFlow)
    ? rawExternalFlow[0]
    : rawExternalFlow;

  const query: Record<string, string> = {
    paymentReturn: '1',
  };

  if (subscriptionId) {
    query.subscriptionId = String(subscriptionId);
  }

  if (externalFlow === '1' || externalFlow === 'true') {
    query.externalFlow = '1';
  }

  return {
    path: '/subscription',
    query,
  };
});

onMounted(async () => {
  await navigateTo(subscriptionLink.value, { replace: true });
});
</script>
