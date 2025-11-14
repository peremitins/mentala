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
        'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
        props.class
      )
    "
    v-bind="delegatedProps"
  >
    <slot />
  </ToggleGroupItem>
</template>

