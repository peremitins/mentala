<script setup lang="ts">
import type { ToggleGroupRootEmits, ToggleGroupRootProps } from 'radix-vue';
import type { HTMLAttributes } from 'vue';
import { cn } from '@/app/lib/utils';
import { ToggleGroupRoot, useForwardPropsEmits } from 'radix-vue';
import { computed } from 'vue';

const props = defineProps<
  ToggleGroupRootProps & { class?: HTMLAttributes['class'] }
>();
const emits = defineEmits<ToggleGroupRootEmits>();

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props;

  return delegated;
});

const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <ToggleGroupRoot :class="cn('flex gap-1', props.class)" v-bind="forwarded">
    <slot />
  </ToggleGroupRoot>
</template>

