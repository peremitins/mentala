<template>
  <div class="px-6 pb-6" :class="props.class">
    <slot />
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ class?: string }>()
</script>
