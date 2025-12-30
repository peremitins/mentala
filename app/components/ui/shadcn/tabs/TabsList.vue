<script setup lang="ts">
import type { TabsListProps } from 'radix-vue';
import type { HTMLAttributes } from 'vue';
import { cn } from '@/app/lib/utils';
import { TabsList } from 'radix-vue';
import { computed } from 'vue';

const props = defineProps<
  TabsListProps & { class?: HTMLAttributes['class'] }
>();

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props;

  return delegated;
});
</script>

<template>
  <TabsList
    v-bind="delegatedProps"
    :class="
      cn(
        'inline-flex items-center justify-center rounded-sm bg-muted w-full h-10 p-1 text-muted-foreground glass-deep',
        props.class
      )
    "
  >
    <slot />
  </TabsList>
</template>
