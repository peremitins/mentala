<template>
  <div class="px-6 pt-6 text-lg font-semibold" :class="props.class">
    <slot />
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ class?: string }>()
</script>
