<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from '../../../../lib/utils';

defineOptions({
  inheritAttrs: false,
});

const props = defineProps<{
  class?: HTMLAttributes['class'];
}>();

const modelValue = defineModel<string>({ default: '' });

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement;
  modelValue.value = target.value;
}
</script>

<template>
  <input
    :value="modelValue"
    :class="
      cn(
        'flex h-11 w-full rounded-xl border border-white/20 bg-white/5 px-4 text-sm text-white placeholder:text-white/55',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
        'disabled:cursor-not-allowed disabled:opacity-60',
        props.class
      )
    "
    v-bind="$attrs"
    @input="handleInput"
  />
</template>
