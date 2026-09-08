<template>
  <div class="space-y-3">
    <label v-if="label" class="text-sm font-medium text-foreground flex">
      {{ label }}
    </label>
    <ToggleGroup
      :model-value="String(modelValue ?? '')"
      type="single"
      :disabled="disabled"
      :class="toggleGroupClasses"
      @update:model-value="handleUpdate"
    >
      <ToggleGroupItem
        v-for="option in options"
        :key="String(option.value)"
        :value="String(option.value)"
        :disabled="option.disabled || disabled"
        :class="cn(getItemClasses(option.value).class, itemClass)"
        :style="getItemClasses(option.value).style"
      >
        {{ option.label }}
      </ToggleGroupItem>
    </ToggleGroup>
    <p v-if="description" class="text-xs text-white">
      {{ description }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { cva } from 'class-variance-authority';
import { ToggleGroup, ToggleGroupItem } from '@/app/components/ui/toggle-group';
import { cn } from '@/app/lib/utils';
// border-primary bg-button-active-soft text-surface-raised-foreground
const toggleItemVariants = cva(
  // Базовые стили
  [
    'inline-flex items-center justify-center rounded-lg border',
    'font-medium transition-colors whitespace-nowrap',
    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
    'disabled:pointer-events-none disabled:opacity-50',
    // Стили для активного состояния (через data-атрибуты Radix)
    'data-[state=on]:border-primary-ui data-[state=on]:bg-primary-ui ',
    'data-[state=on]:bg-primary-ui/20 data-[state=on]:shadow-sm data-[state=on]:text-foreground  ',
    // Стили для неактивного состояния
    'data-[state=off]:border-border data-[state=off]:bg-card ',
    'data-[state=off]:hover:bg-transparent',
    'data-[state=off]:hover:border-primary-ui data-[state=off]:hover:text-foreground ',
    'data-[state=off]:text-surface-inactive-foreground ',
  ],
  {
    variants: {
      size: {
        sm: 'px-3 py-1.5 text-xs',
        md: 'px-4 py-2 text-sm',
        lg: 'px-5 py-2.5 text-base',
      },
      variant: {
        default: '',
        outline:
          'data-[state=off]:border-border data-[state=off]:bg-transparent',
        ghost:
          'data-[state=off]:border-transparent data-[state=off]:bg-transparent',
      },
      layout: {
        flex: '',
        grid: '',
      },
      fullWidth: {
        true: 'w-full',
        false: '',
      },
    },
    compoundVariants: [
      // Для flex layout добавляем flex-1 если не fullWidth
      {
        layout: 'flex',
        fullWidth: false,
        class: 'flex-1',
      },
      // Для grid layout кнопки всегда занимают всю ширину колонки
      {
        layout: 'grid',
        class: 'w-full',
      },
    ],
    defaultVariants: {
      size: 'md',
      variant: 'default',
      layout: 'flex',
      fullWidth: false,
    },
  }
);

export interface ToggleOption<T = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface Props<T = string> {
  modelValue: T | null | undefined;
  options: ToggleOption<T>[];
  label?: string;
  description?: string;
  disabled?: boolean;
  layout?: 'flex' | 'grid';
  gridCols?: 1 | 2 | 3 | 4 | 5;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'outline' | 'ghost';
  fullWidth?: boolean;
  wrap?: boolean;
  itemMaxWidth?:
    | 'sm'
    | 'md'
    | 'lg'
    | 'xl'
    | '2xl'
    | 'full'
    | 'none'
    | number
    | string;
  class?: string;
  itemClass?: string;
}

const props = withDefaults(defineProps<Props>(), {
  layout: 'flex',
  gridCols: 5,
  size: 'md',
  variant: 'default',
  fullWidth: false,
  wrap: true,
  disabled: false,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const toggleGroupClasses = computed(() => {
  const baseClasses = [];

  if (props.layout === 'grid') {
    const colsMap: Record<number, string> = {
      1: 'grid-cols-1',
      2: 'grid-cols-1 xxs:grid-cols-2',
      3: 'grid-cols-1 xxs:grid-cols-2 sm:grid-cols-3',
      4: 'grid-cols-1 xxs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
      5: 'grid-cols-1 xxs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 lg:grid-cols-5',
    };
    const gridColsClass = colsMap[props.gridCols];
    if (gridColsClass) {
      baseClasses.push('grid', gridColsClass, 'gap-2');
    }
  } else {
    baseClasses.push('flex');
    if (props.wrap) {
      baseClasses.push('flex-wrap');
    }
    // Для flex layout используем gap-3 (как в оригинале)
    baseClasses.push('gap-3');
  }

  if (props.fullWidth) {
    baseClasses.push('w-full');
  }

  return cn(baseClasses, props.class);
});

function getItemClasses(_value: string | number) {
  // Получаем класс или стиль для max-width
  let maxWidthClass = '';
  let maxWidthStyle: { maxWidth: string } | undefined = undefined;

  if (props.itemMaxWidth && props.itemMaxWidth !== 'none') {
    // Если это предустановленное значение (sm, md, lg и т.д.)
    if (
      typeof props.itemMaxWidth === 'string' &&
      ['sm', 'md', 'lg', 'xl', '2xl', 'full'].includes(props.itemMaxWidth)
    ) {
      const maxWidthMap: Record<string, string> = {
        sm: 'max-w-sm',
        md: 'max-w-md',
        lg: 'max-w-lg',
        xl: 'max-w-xl',
        '2xl': 'max-w-2xl',
        full: 'max-w-full',
      };
      maxWidthClass = maxWidthMap[props.itemMaxWidth] || '';
    } else {
      // Если это число или строка с пикселями
      const maxWidthValue =
        typeof props.itemMaxWidth === 'number'
          ? `${props.itemMaxWidth}px`
          : props.itemMaxWidth;
      maxWidthStyle = { maxWidth: maxWidthValue };
    }
  }

  return {
    class: cn(
      toggleItemVariants({
        size: props.size,
        variant: props.variant,
        layout: props.layout,
        fullWidth: props.fullWidth,
      }),
      maxWidthClass
    ),
    style: maxWidthStyle,
  };
}

function handleUpdate(value: string | string[] | null) {
  // ToggleGroup с type="single" возвращает string | null
  // но типы Radix могут быть string | string[]
  if (value && typeof value === 'string') {
    emit('update:modelValue', value);
  }
}
</script>
