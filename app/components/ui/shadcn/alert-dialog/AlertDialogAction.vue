<script setup lang="ts">
import type { AlertDialogActionProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { AlertDialogAction } from 'reka-ui';
import { cn } from '@/app/lib/utils';

const props = defineProps<
  AlertDialogActionProps & { class?: HTMLAttributes['class'] }
>();
</script>

<template>
  <AlertDialogAction
    v-bind="props"
    :class="
      cn(
        'inline-flex h-9 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-medium text-white shadow transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
        props.class
      )
    "
  >
    <slot />
  </AlertDialogAction>
</template>
