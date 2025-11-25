<script setup lang="ts">
import type { AlertDialogContentProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { reactiveOmit } from '@vueuse/core';
import { AlertDialogPortal, AlertDialogOverlay, AlertDialogContent } from 'reka-ui';
import { cn } from '@/app/lib/utils';

const props = defineProps<
  AlertDialogContentProps & { class?: HTMLAttributes['class'] }
>();

const delegatedProps = reactiveOmit(props, 'class');
</script>

<template>
  <AlertDialogPortal>
    <AlertDialogOverlay />
    <AlertDialogContent
      v-bind="delegatedProps"
      :class="
        cn(
          'fixed left-1/2 top-1/2 z-50 grid w-full max-w-sm -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 shadow-lg sm:rounded-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-0 data-[state=closed]:zoom-out-0',
          props.class
        )
      "
    >
      <slot />
    </AlertDialogContent>
  </AlertDialogPortal>
</template>
