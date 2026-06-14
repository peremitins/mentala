<template>
  <Dialog :open="open" @update:open="onOpenChange">
    <DialogContent
      overlay-class="z-[190] bg-black/70"
      class="z-[200] glass-deep border-white/15 text-foreground sm:max-w-sm"
    >
      <DialogTitle class="sr-only">Оценить приложение</DialogTitle>

      <div class="flex flex-col items-center gap-4 py-2 text-center">
        <div class="text-3xl leading-none select-none">⭐⭐⭐⭐⭐</div>

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
import { watch } from 'vue';
import { useRoute } from 'vue-router';
import { Button } from '@/app/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/app/components/ui/dialog';
import { useAppReviewPrompt } from '@/app/composables/useAppReviewPrompt';
import { useIsDev } from '@/app/composables/useIsDev';
import { useAppLockStore } from '@/app/stores/appLock';

const {
  open,
  onConfirm,
  onDismiss,
  forceShow,
  resetForTesting,
  primeForTesting,
  checkAndShow,
} = useAppReviewPrompt();

function onOpenChange(value: boolean) {
  if (!value) {
    void onDismiss();
  }
}

// Dev-триггер модалки через URL — чтобы вызывать её на мобильном (Android в
// браузере), где нет доступной консоли. Достаточно открыть ссылку с параметром:
//   ?reviewPrompt=show   — показать сразу, минуя все условия (тест UI + редиректа)
//   ?reviewPrompt=prime  — выставить пороги и показать через реальный isEligible()
//   ?reviewPrompt=check  — запустить обычную проверку показа
//   ?reviewPrompt=reset  — сбросить состояние review-prompt
// Работает только при isDev (в проде параметр игнорируется).
//
// ВАЖНО: команду нельзя выполнять сразу на mount. После перезагрузки первым
// показывается экран блокировки (ввод PIN). Если открыть модалку в этот момент,
// она окажется ПОД lock-экраном, а тап по полю ввода кода прочитается Dialog'ом
// как «клик снаружи» → модалка закроется (и статус станет 'dismissed'). Поэтому
// команду откладываем и выполняем только когда контент стал видимым
// (canShowPrivateContent === true: блокировка/настройка/privacy-overlay сняты).
const isDev = useIsDev();
const route = useRoute();
const appLock = useAppLockStore();

let pendingDebugCommand: string | null = null;

async function flushReviewPromptDebugCommand(): Promise<void> {
  if (!isDev.value || !pendingDebugCommand) return;
  // Ждём снятия экрана блокировки — иначе модалка откроется под ним.
  if (!appLock.canShowPrivateContent) return;

  const command = pendingDebugCommand;
  pendingDebugCommand = null;

  switch (command) {
    case 'show':
      forceShow();
      break;
    case 'prime':
      await primeForTesting();
      await checkAndShow();
      break;
    case 'check':
      await checkAndShow();
      break;
    case 'reset':
      await resetForTesting();
      break;
    default:
      break;
  }
}

// 1) Считываем команду из URL (в т.ч. при клиентской смене query).
watch(
  () => route.query.reviewPrompt,
  (value) => {
    if (!isDev.value) return;
    const command = Array.isArray(value) ? value[0] : value;
    pendingDebugCommand = command ? String(command).toLowerCase() : null;
    void flushReviewPromptDebugCommand();
  },
  { immediate: true }
);

// 2) Как только экран блокировки снят и контент виден — выполняем команду.
watch(
  () => appLock.canShowPrivateContent,
  (canShow) => {
    if (canShow) void flushReviewPromptDebugCommand();
  },
  { immediate: true }
);
</script>
