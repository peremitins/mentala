<template>
  <div />
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router';

const route = useRoute();
const rawId = route.params.id;
const trackId = Array.isArray(rawId) ? rawId[0] : rawId;
const safeId = typeof trackId === 'string' ? trackId.trim() : '';

if (safeId) {
  const nextQuery = { ...route.query, trackId: safeId };
  // Редиректим на общий экран медитаций, чтобы не пересоздавать страницу.
  await navigateTo({ path: '/meditations', query: nextQuery }, { replace: true });
}
</script>
