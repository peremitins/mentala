<script setup lang="ts">
import type { AlertDialogDescriptionProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { AlertDialogDescription } from 'reka-ui';
import { cn } from '@/app/lib/utils';

const props = defineProps<
  AlertDialogDescriptionProps & { class?: HTMLAttributes['class'] }
>();
</script>

<template>
  <AlertDialogDescription
    v-bind="props"
    :class="cn('text-sm text-foreground', props.class)"
  >
    <slot />
  </AlertDialogDescription>
</template>
