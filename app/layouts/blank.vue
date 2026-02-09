<template>
  <div :class="['min-h-dvh', { 'ios-safe-layout': isIos }]">
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { usePlatform } from '@/app/composables/usePlatform';

const { platform } = usePlatform();
const isIos = computed(() => platform.value === 'ios');
</script>
