<template>
  <div
    class="rounded-xl border border-white/10 bg-white/5 dark:bg-black/20 shadow-sm"
    :class="props.class"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ class?: string }>()
</script>
