<script setup lang="ts">
import type { AlertDialogTitleProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { AlertDialogTitle } from 'reka-ui';
import { cn } from '@/app/lib/utils';

const props = defineProps<
  AlertDialogTitleProps & { class?: HTMLAttributes['class'] }
>();
</script>

<template>
  <AlertDialogTitle
    v-bind="props"
    :class="cn('text-lg font-semibold', props.class)"
  >
    <slot />
  </AlertDialogTitle>
</template>
