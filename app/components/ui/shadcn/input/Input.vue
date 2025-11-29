<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { computed, ref, nextTick } from 'vue';
import { cn } from '@/app/lib/utils';
import { Cross2Icon } from '@radix-icons/vue';

defineOptions({
  inheritAttrs: false,
});

interface Props {
  modelValue?: string | number;
  showClearButton?: boolean;
  class?: HTMLAttributes['class'];
  disabled?: boolean;
  type?: string;
  placeholder?: string;
  maxlength?: number | string;
}

const props = withDefaults(defineProps<Props>(), {
  showClearButton: true,
  type: 'text',
  disabled: false,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'keydown', event: KeyboardEvent): void;
  (e: 'focus', event: FocusEvent): void;
  (e: 'blur', event: FocusEvent): void;
}>();

const inputRef = ref<HTMLInputElement | null>(null);

const displayValue = computed(() => {
  return props.modelValue ?? '';
});

const hasValue = computed(() => {
  const value = props.modelValue;
  if (value === null || value === undefined) return false;
  return String(value).length > 0;
});

const showClear = computed(() => {
  return props.showClearButton && hasValue.value && !props.disabled;
});

function handleInput(event: Event) {
  const target = event.target as HTMLInputElement;
  emit('update:modelValue', target.value);
}

function handleClear() {
  emit('update:modelValue', '');
  // Фокусируемся обратно на input после очистки
  nextTick(() => {
    inputRef.value?.focus();
  });
}

function handleKeydown(event: KeyboardEvent) {
  emit('keydown', event);
}

function handleFocus(event: FocusEvent) {
  emit('focus', event);
}

function handleBlur(event: FocusEvent) {
  emit('blur', event);
}

// Экспортируем ref для внешнего использования (например, для фокуса)
defineExpose({
  focus: () => inputRef.value?.focus(),
  blur: () => inputRef.value?.blur(),
  input: inputRef,
});
</script>

<template>
  <div class="relative w-full">
    <input
      ref="inputRef"
      :value="displayValue"
      :type="type"
      :disabled="disabled"
      :placeholder="placeholder"
      :maxlength="maxlength"
      :class="
        cn(
          'flex h-10 w-full rounded-2xl border-2 border-border bg-card px-3  text-sm',
          'ring-offset-background ',
          'placeholder:text-muted-foreground',
          'focus-visible:outline-none focus:border-primary ',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'transition-colors',
          showClear && hasValue ? 'pr-9' : '',
          props.class
        )
      "
      v-bind="$attrs"
      @input="handleInput"
      @keydown="handleKeydown"
      @focus="handleFocus"
      @blur="handleBlur"
    />
    <button
      v-if="showClear"
      type="button"
      :class="
        cn(
          'absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5',
          'opacity-70 ring-offset-background transition-opacity',
          'hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          'disabled:pointer-events-none',
          'text-muted-foreground hover:text-foreground'
        )
      "
      :disabled="disabled"
      @click.stop="handleClear"
    >
      <Cross2Icon class="h-4 w-4" />
      <span class="sr-only">Очистить</span>
    </button>
  </div>
</template>
