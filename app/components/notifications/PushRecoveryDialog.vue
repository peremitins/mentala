<template>
  <Dialog :open="open" :modal="true" @update:open="emit('update:open', $event)">
    <DialogContent class="glass-deep max-w-sm">
      <DialogHeader>
        <DialogTitle>Включите уведомления</DialogTitle>
        <DialogDescription>
          Уведомления отключены — напоминания по выбранным темам не будут
          приходить. Включите их, чтобы Ментала могла поддерживать вас в течение
          дня.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" @click="emit('dismiss')"> Позже </Button>
        <Button class="mb-2" @click="emit('enable')">
          Включить уведомления
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/shadcn/dialog';
import { Button } from '@/app/components/ui/button';

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'enable'): void;
  (e: 'dismiss'): void;
}>();
</script>
