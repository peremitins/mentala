<template>
  <div>
    <div v-if="state === 'loading'" class="opacity-75">Loading…</div>
    <div v-else-if="state === 'empty'" class="opacity-75">Nothing here yet</div>
    <div v-else-if="state === 'error'" class="text-red-400">Something went wrong</div>
    <div v-else>
      <slot>Content</slot>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{ state?: 'idle' | 'loading' | 'empty' | 'error' }>(), {
  state: 'idle',
})
</script>
