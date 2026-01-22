<script setup lang="ts">
import type { ToggleGroupItemProps } from 'radix-vue';
import type { HTMLAttributes } from 'vue';
import { cn } from '@/app/lib/utils';
import { ToggleGroupItem } from 'radix-vue';
import { computed } from 'vue';

const props = defineProps<
  ToggleGroupItemProps & { class?: HTMLAttributes['class'] }
>();

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props;

  return delegated;
});
</script>

<template>
  <ToggleGroupItem
    :class="
      cn(
        'inline-flex items-center justify-center rounded-lg border font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        'disabled:pointer-events-none disabled:opacity-50',
        // Стили для активного состояния
        'data-[state=on]:border-primary-ui data-[state=on]:bg-transparent ',
        'data-[state=on]:bg-primary-ui/20 data-[state=on]:shadow-sm data-[state=on]:text-foreground  ',

        // Стили для неактивного состояния
        'data-[state=off]:border-border data-[state=off]:bg-transparent ',
        'data-[state=off]:hover:bg-transparent',
        'data-[state=off]:border-border/60 data-[state=off]:hover:border-primary-ui data-[state=off]:hover:text-foreground ',
        'data-[state=off]:text-surface-inactive-foreground ',
        props.class
      )
    "
    v-bind="delegatedProps"
  >
    <slot />
  </ToggleGroupItem>
</template>
