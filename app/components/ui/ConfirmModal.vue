<template>
  <AlertDialog v-model:open="open">
    <AlertDialogTrigger as-child>
      <slot name="trigger" />
    </AlertDialogTrigger>
    <AlertDialogContent class="bg-popover">
      <AlertDialogHeader>
        <AlertDialogTitle>{{ title }}</AlertDialogTitle>
        <AlertDialogDescription v-if="subtitle">
          {{ subtitle }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ cancelLabel }}</AlertDialogCancel>
        <AlertDialogAction @click="handleConfirm">{{
          confirmLabel
        }}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import AlertDialog from '@/app/components/ui/shadcn/alert-dialog/AlertDialog.vue';
import AlertDialogTrigger from '@/app/components/ui/shadcn/alert-dialog/AlertDialogTrigger.vue';
import AlertDialogContent from '@/app/components/ui/shadcn/alert-dialog/AlertDialogContent.vue';
import AlertDialogHeader from '@/app/components/ui/shadcn/alert-dialog/AlertDialogHeader.vue';
import AlertDialogTitle from '@/app/components/ui/shadcn/alert-dialog/AlertDialogTitle.vue';
import AlertDialogDescription from '@/app/components/ui/shadcn/alert-dialog/AlertDialogDescription.vue';
import AlertDialogFooter from '@/app/components/ui/shadcn/alert-dialog/AlertDialogFooter.vue';
import AlertDialogAction from '@/app/components/ui/shadcn/alert-dialog/AlertDialogAction.vue';
import AlertDialogCancel from '@/app/components/ui/shadcn/alert-dialog/AlertDialogCancel.vue';

const props = withDefaults(
  defineProps<{
    title?: string;
    subtitle?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    defaultOpen?: boolean;
  }>(),
  {
    title: 'Вы уверены?',
    subtitle: '',
    confirmLabel: 'Да',
    cancelLabel: 'Отмена',
    defaultOpen: false,
  }
);

const emit = defineEmits<{ (e: 'confirm'): void }>();
const open = ref(props.defaultOpen);

function close() {
  open.value = false;
}

async function handleConfirm() {
  emit('confirm');
  close();
}

defineExpose({
  open: () => {
    open.value = true;
  },
  close,
});
</script>
