<template>
  <Dialog :open="open" @update:open="onOpenChange">
    <DialogContent
      overlay-class="z-[190] bg-black/65"
      class="z-[200] border-white/15 text-foreground sm:max-w-xl"
    >
      <DialogHeader class="space-y-1.5">
        <DialogTitle class="pr-8 text-base font-semibold">
          Как напоминания усиливают прогресс
        </DialogTitle>
      </DialogHeader>

      <div class="space-y-3 text-sm leading-relaxed text-foreground/90">
        <p>
          Научные исследования подтверждают: регулярные напоминания повышают
          вероятность выполнения выбранного поведения как при формировании
          полезных привычек, так и при отказе от вредных.
        </p>

        <p>
          В контролируемом исследовании (Journal of Medical Internet Research)
          группа с напоминаниями достигала целей в среднем в
          <span class="font-bold">7,5 раза чаще</span>, чем группа без
          напоминаний. Эффект был статистически значимым (<span
            class="font-semibold"
            >P &lt; .001</span
          >).
        </p>

        <p>
          Напоминания действуют как внешний триггер и помогают мозгу удерживать
          фокус на выбранной цели, постепенно превращая действия в устойчивые
          привычки.
        </p>

        <p>В контексте терапии они помогают:</p>
        <ul class="space-y-1 text-foreground/85">
          <li>• снижать вероятность срыва</li>
          <li>• поддерживать осознанность</li>
          <li>• возвращать внимание к выбранному направлению</li>
          <li>• усиливать закрепление новых поведенческих моделей</li>
        </ul>

        <p>
          Вы можете настроить частоту и тон напоминаний так, чтобы они
          поддерживали вас, а не создавали давление.
        </p>
      </div>

      <div
        class="mt-1 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <button
          type="button"
          class="inline-flex w-fit text-sm font-medium text-foreground/75 underline decoration-dotted underline-offset-4 transition hover:text-foreground"
          @click="openStudyInExternalBrowser"
        >
          Ссылка: pubmed.ncbi.nlm.nih.gov/29191800
        </button>

        <Button class="sm:min-w-28" @click="onOpenChange(false)">
          Понятно
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { Capacitor } from '@capacitor/core';
import { Button } from '@/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';

const SOURCE_URL = 'https://pubmed.ncbi.nlm.nih.gov/29191800/';

withDefaults(
  defineProps<{
    open: boolean;
  }>(),
  {
    open: false,
  }
);

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

function onOpenChange(value: boolean) {
  emit('update:open', value);
}

async function openStudyInExternalBrowser() {
  if (Capacitor.isNativePlatform()) {
    try {
      const { InAppBrowser } = await import('@capacitor/inappbrowser');
      await InAppBrowser.openInExternalBrowser({ url: SOURCE_URL });
      return;
    } catch (error) {
      // На native при ошибке плагина мягко падаем в web-fallback.
      console.warn(
        '[ReminderEffectModal] Failed to open external browser via InAppBrowser:',
        error
      );
    }
  }

  if (typeof window !== 'undefined' && typeof window.open === 'function') {
    window.open(SOURCE_URL, '_blank', 'noopener,noreferrer');
  }
}
</script>
