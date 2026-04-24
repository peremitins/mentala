<template>
  <span aria-hidden="true" :class="indicatorClass">
    <span class="absolute inset-0 animate-ping rounded-full bg-primary-ui/70" />
    <span class="relative rounded-full bg-primary-ui" :class="dotClass" />
  </span>
</template>

<script setup lang="ts">
import { computed, type HTMLAttributes } from 'vue';
import { cn } from '@/app/lib/utils';

const props = withDefaults(
  defineProps<{
    compact?: boolean;
    class?: HTMLAttributes['class'];
  }>(),
  {
    compact: false,
  }
);

const dotClass = computed(() => (props.compact ? 'size-1.5' : 'size-2'));

const indicatorClass = computed(() =>
  cn('relative inline-flex shrink-0', dotClass.value, props.class)
);
</script>
