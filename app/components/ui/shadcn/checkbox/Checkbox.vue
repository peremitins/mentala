<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { computed } from 'vue';
import { CheckboxRoot, CheckboxIndicator } from 'radix-vue';
import { CheckIcon } from '@radix-icons/vue';
import { cn } from '@/app/lib/utils';

defineOptions({
  inheritAttrs: false,
});

interface Props {
  modelValue?: boolean;
  checked?: boolean;
  disabled?: boolean;
  class?: HTMLAttributes['class'];
  id?: string;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'update:checked', value: boolean): void;
}>();

// Используем checked если передан, иначе modelValue
const isChecked = computed(() => props.checked ?? props.modelValue ?? false);

function handleCheckedChange(checked: boolean) {
  emit('update:modelValue', checked);
  emit('update:checked', checked);
}

const rootClasses = computed(() =>
  cn(
    'peer h-4 w-4 shrink-0 rounded-sm border border-primary bg-transparent cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
    'data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:border-primary',
    'transition-colors duration-200 ease-in-out',
    props.class
  )
);

const indicatorClasses = computed(() =>
  cn(
    'flex items-center justify-center text-current',
    'opacity-0 scale-0 transition-all duration-200 ease-in-out',
    'data-[state=checked]:opacity-100 data-[state=checked]:scale-100'
  )
);
</script>

<template>
  <CheckboxRoot
    :checked="isChecked"
    @update:checked="handleCheckedChange"
    :disabled="disabled"
    :id="id"
    :class="rootClasses"
    v-bind="$attrs"
  >
    <CheckboxIndicator :class="indicatorClasses">
      <CheckIcon class="h-3.5 w-3.5" />
    </CheckboxIndicator>
  </CheckboxRoot>
</template>
