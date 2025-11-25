<script setup lang="ts">
import { AlertDialogRoot } from 'reka-ui';

const props = defineProps<{
  open?: boolean;
}>();

const emits = defineEmits<{
  (e: 'update:open', value: boolean): void;
}>();
</script>

<template>
  <AlertDialogRoot :open="props.open" @update:open="(value) => emits('update:open', value)">
    <slot />
  </AlertDialogRoot>
</template>
