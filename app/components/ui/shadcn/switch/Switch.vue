<template>
  <SwitchRoot
    v-model:checked="isChecked"
    :disabled="disabled"
    :class="rootClasses"
    v-bind="$attrs"
  >
    <SwitchThumb :class="thumbClasses" />
  </SwitchRoot>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { computed } from 'vue';
import { SwitchRoot, SwitchThumb } from 'radix-vue';
import { cn } from '@/app/lib/utils';

defineOptions({
  inheritAttrs: false,
});

interface Props {
  modelValue?: boolean;
  checked?: boolean;
  disabled?: boolean;
  class?: HTMLAttributes['class'];
  thumbClass?: HTMLAttributes['class'];
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'update:checked', value: boolean): void;
}>();

// Используем checked если передан, иначе modelValue
const isChecked = computed({
  get: () => props.checked ?? props.modelValue ?? false,
  set: (value: boolean) => {
    emit('update:modelValue', value);
    emit('update:checked', value);
  },
});

const rootClasses = computed(() =>
  cn(
    'peer inline-flex h-6 w-12 shrink-0 cursor-pointer items-center rounded-full border border-primary bg-transparent px-1 shadow-sm transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:cursor-not-allowed disabled:opacity-50',
    'data-[state=checked]:bg-primary/20',
    props.class
  )
);

const thumbClasses = computed(() =>
  cn(
    'pointer-events-none block h-4 w-4 rounded-full border border-primary bg-transparent shadow-lg ring-0 transition-transform',
    'translate-x-0 data-[state=checked]:translate-x-6 data-[state=checked]:bg-primary',
    props.thumbClass
  )
);
</script>
