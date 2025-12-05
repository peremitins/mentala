<script setup lang="ts">
import NotificationTextsEditorPage from '@/app/components/notifications/NotificationTextsEditorPage.vue';

const route = useRoute();
const kind = computed(() => route.params.kind as 'habits' | 'therapy');
const entityKey = computed(() => route.params.entityKey as string);
</script>

<template>
  <div class="h-full flex flex-col">
    <NotificationTextsEditorPage :kind="kind" :entity-key="entityKey" />
  </div>
</template>
