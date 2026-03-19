<template>
  <Dialog :open="open" :modal="true" @update:open="emit('update:open', $event)">
    <DialogContent class="glass-deep max-w-sm">
      <DialogHeader>
        <DialogTitle>Уведомления отключены</DialogTitle>
        <DialogDescription>
          Уведомления отключены в системных настройках. Разрешите их, чтобы
          получать напоминания.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" @click="emit('update:open', false)">
          Отмена
        </Button>
        <Button class="mb-2" @click="emit('open-settings')">
          Открыть настройки
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
  (e: 'open-settings'): void;
}>();
</script>
