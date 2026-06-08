<template>
  <Dialog :open="open" @update:open="onOpenChange">
    <DialogContent
      overlay-class="z-[190] bg-black/70"
      class="z-[200] glass-deep border-white/15 text-foreground sm:max-w-sm"
    >
      <DialogTitle class="sr-only">Оценить приложение</DialogTitle>

      <div class="flex flex-col items-center gap-4 py-2 text-center">
        <div class="text-5xl leading-none select-none">⭐</div>

        <div class="space-y-2">
          <h2 class="text-lg font-semibold text-foreground">
            Вам нравится Ментала?
          </h2>
          <p class="text-sm leading-relaxed text-foreground/70">
            Оставьте оценку в магазине. Это помогает нам развивать приложение и
            делать его полезнее для вас
          </p>
        </div>

        <div class="mt-1 flex w-full flex-col gap-2">
          <Button class="w-full" @click="onConfirm">
            Оценить приложение
          </Button>
          <button
            type="button"
            class="text-sm text-foreground/50 hover:text-foreground/70 transition-colors py-1"
            @click="onDismiss"
          >
            Позже
          </button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { Button } from '@/app/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/app/components/ui/dialog';
import { useAppReviewPrompt } from '@/app/composables/useAppReviewPrompt';

const { open, onConfirm, onDismiss } = useAppReviewPrompt();

function onOpenChange(value: boolean) {
  if (!value) {
    void onDismiss();
  }
}
</script>
