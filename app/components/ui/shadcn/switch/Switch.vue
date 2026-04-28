<template>
  <SwitchRoot
    v-model:checked="isChecked"
    :disabled="disabled || loading"
    :class="rootClasses"
    v-bind="$attrs"
  >
    <SwitchThumb :class="thumbClasses">
      <!-- Лоадер во время запроса -->
      <IconLoader2
        v-if="loading"
        class="h-2.5 w-2.5 shrink-0 text-neutral-500 animate-spin"
        aria-hidden="true"
      />
      <!-- Галочка во включённом состоянии (сразу после завершения запроса, без задержки) -->
      <span
        v-else-if="isChecked"
        class="flex h-full w-full items-center justify-center text-primary text-[10px] font-bold leading-none"
        aria-hidden="true"
      >
        ✓
      </span>
    </SwitchThumb>
  </SwitchRoot>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { computed } from 'vue';
import { SwitchRoot, SwitchThumb } from 'radix-vue';
import { cn } from '@/app/lib/utils';
import IconLoader2 from '~icons/lucide/loader-2';

defineOptions({
  inheritAttrs: false,
});

interface Props {
  modelValue?: boolean;
  checked?: boolean;
  disabled?: boolean;
  /** Показывать спиннер на кругляше (переключатель заблокирован) */
  loading?: boolean;
  class?: HTMLAttributes['class'];
  thumbClass?: HTMLAttributes['class'];
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  loading: false,
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
    'peer inline-flex h-6 w-12 shrink-0 cursor-pointer items-center rounded-full border border-primary-ui bg-transparent px-1 shadow-sm transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:cursor-not-allowed disabled:opacity-50',
    'data-[state=checked]:bg-primary-ui/30 data-[state=checked]:border-primary-ui/50',
    props.loading && 'cursor-wait',
    props.class
  )
);

const thumbClasses = computed(() =>
  cn(
    'pointer-events-none flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-primary-ui bg-transparent shadow-lg ring-0 transition-transform',
    'translate-x-0 data-[state=checked]:translate-x-6 data-[state=checked]:bg-primary-ui data-[state=checked]:border-primary-ui',
    // При загрузке кругляш всегда с фоном, чтобы лоадер был виден и слева (выкл), и справа (вкл)
    props.loading && 'bg-primary-ui border-primary-ui',
    props.thumbClass
  )
);
</script>
