<script setup lang="ts">
import type { TabsTriggerProps } from 'radix-vue';
import type { HTMLAttributes } from 'vue';
import { cn } from '@/app/lib/utils';
import { TabsTrigger, useForwardProps } from 'radix-vue';
import { computed } from 'vue';

const props = defineProps<
  TabsTriggerProps & { class?: HTMLAttributes['class'] }
>();

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props;

  return delegated;
});

const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <TabsTrigger
    v-bind="forwardedProps"
    :class="
      cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-lg w-full h-full px-3 py-1 text-sm text-white font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-primary/20 data-[state=active]:text-foreground data-[state=active]:shadow',
        props.class
      )
    "
  >
    <span class="truncate">
      <slot />
    </span>
  </TabsTrigger>
</template>
