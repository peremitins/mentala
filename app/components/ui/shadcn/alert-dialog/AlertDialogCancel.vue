<script setup lang="ts">
import type { AlertDialogCancelProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { AlertDialogCancel } from 'reka-ui';
import { cn } from '@/app/lib/utils';

const props = defineProps<
  AlertDialogCancelProps & { class?: HTMLAttributes['class'] }
>();
</script>

<template>
  <AlertDialogCancel
    v-bind="props"
    :class="
      cn(
        'mt-2 sm:mt-0 inline-flex h-9 items-center justify-center rounded-md border border-gray-300 px-4 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200',
        props.class
      )
    "
  >
    <slot />
  </AlertDialogCancel>
</template>
