<script setup lang="ts">
import NotificationSettingsPage from '@/app/components/notifications/NotificationSettingsPage.vue';

const route = useRoute();
const topicKey = route.params.key as string;
</script>

<template>
  <NotificationSettingsPage mentai-mode="therapy" :entity-key="topicKey" />
</template>
