<script setup lang="ts">
import type { AlertDialogOverlayProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { reactiveOmit } from '@vueuse/core';
import { AlertDialogOverlay } from 'reka-ui';
import { cn } from '@/app/lib/utils';

const props = defineProps<
  AlertDialogOverlayProps & { class?: HTMLAttributes['class'] }
>();

const delegatedProps = reactiveOmit(props, 'class');
</script>

<template>
  <AlertDialogOverlay
    v-bind="delegatedProps"
    :class="
      cn(
        'fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
        props.class
      )
    "
  >
    <slot />
  </AlertDialogOverlay>
</template>
