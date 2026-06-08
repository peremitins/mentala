<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent
      overlay-class="z-[190] bg-black/70"
      class="z-[200] glass-deep border-white/15 text-foreground sm:max-w-md"
    >
      <DialogHeader class="space-y-3">
        <div
          class="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs"
        >
          <span aria-hidden="true" class="text-sm leading-none">⭐</span>
          <span>Полный доступ</span>
        </div>
        <DialogTitle class="text-lg font-semibold text-foreground">
          Сохраните полный доступ
        </DialogTitle>
        <DialogDescription class="text-sm leading-relaxed text-foreground/75">
          Привяжите карту, чтобы доступ ко всем практикам, медитациям и
          ИИ-сессиям не прерывался после пробного периода. Оставшиеся бесплатные
          дни сохранятся полностью, оплату спишем только когда они закончатся.
          Если передумаете, отменить можно в любой момент.
        </DialogDescription>
      </DialogHeader>

      <div class="mt-4 space-y-3">
        <Button class="w-full" @click="handleConfirm">
          Оформить подписку
        </Button>
        <button
          type="button"
          class="block w-full text-center text-sm font-medium text-foreground/55 underline-offset-4 transition hover:text-foreground/80 hover:underline"
          @click="handleDismiss"
        >
          Не сейчас
        </button>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { Button } from '@/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';

defineProps<{
  open: boolean;
  milestone: number;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  confirm: [];
  dismiss: [];
}>();

function handleConfirm() {
  emit('confirm');
}

function handleDismiss() {
  emit('dismiss');
}

// Закрытие по overlay/ESC трактуем как «Не сейчас», чтобы навигация
// пользователя всё равно продолжилась.
function handleOpenChange(value: boolean) {
  emit('update:open', value);
  if (!value) {
    emit('dismiss');
  }
}
</script>
