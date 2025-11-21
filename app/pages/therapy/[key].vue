<script setup lang="ts">
import NotificationSettingsPage from '@/app/components/notifications/NotificationSettingsPage.vue';

const route = useRoute();
const entityKey = route.params.key as string;
</script>

<template>
  <div class="h-full flex flex-col">
    <NotificationSettingsPage mentai-mode="therapy" :entity-key="entityKey" />
  </div>
</template>
