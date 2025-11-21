<script setup lang="ts">
import NotificationSettingsPage from '@/app/components/notifications/NotificationSettingsPage.vue';

const route = useRoute();
const entityKey = route.params.id as string;
</script>

<template>
  <div class="h-full flex flex-col">
    <NotificationSettingsPage mentai-mode="habits" :entity-key="entityKey" />
  </div>
</template>
