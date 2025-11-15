<script setup lang="ts">
import NotificationSettingsPage from '@/app/components/notifications/NotificationSettingsPage.vue';

const route = useRoute();
const habitId = route.params.id as string;
</script>

<template>
  <NotificationSettingsPage mentai-mode="habits" :entity-key="habitId" />
</template>
