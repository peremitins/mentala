<template>
  <Dialog :open="open" @update:open="onOpenChange">
    <DialogContent
      class="glass-deep border border-border bg-card text-card-foreground"
    >
      <DialogHeader class="space-y-2">
        <div
          class="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-amber-100/25 bg-amber-100/[0.06] text-amber-100"
          aria-hidden="true"
        >
          <IconLeafyGreen class="h-6 w-6" />
        </div>
        <DialogTitle class="text-center text-lg font-semibold">
          На сегодня шаги закончились
        </DialogTitle>
        <DialogDescription
          as="div"
          class="space-y-2 text-center text-sm leading-relaxed text-foreground/80"
        >
          <p>
            Дальше небольшая пауза. Так навыки лучше усваиваются: постепенно,
            спокойно, шаг за шагом.
          </p>
          <p class="text-foreground/65">
            Следующие шаги откроются {{ resetLabel }}. А пока можно перейти к
            практикам или поговорить в ИИ-чате.
          </p>
        </DialogDescription>
      </DialogHeader>

      <div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button type="button" variant="ghost" class="w-full" @click="onClose">
          Хорошо
        </Button>
        <Button type="button" class="w-full" @click="goToPractices">
          К практикам
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import IconLeafyGreen from '~icons/lucide/leafy-green';
import { Button } from '@/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';

/**
 * Модалка-объяснение для случая, когда пользователь нажимает на «Начать шаг»
 * при достигнутом daily-лимите (2 шага в день, см. retention/retention_long_term_strategy.md).
 *
 * Заменяет toast'ы + сразу всплывающий `ProgramStepBottomSheet`: при лимите
 * пользователю не нужно видеть кнопку «Начать шаг» с последующей ошибкой —
 * сразу даём понятный exit-flow с альтернативой (свободные практики).
 *
 * Тон-оф-войс соблюдает правила §2.4: без guilt-формулировок, без «лимита»,
 * без «доступ закрыт». Подсветка позитивная (leafy green icon).
 */

defineProps<{
  open: boolean;
}>();
const emit = defineEmits<{ (e: 'update:open', open: boolean): void }>();

/**
 * Считаем время до следующего 00:00 локального времени — там сбрасывается
 * дневной лимит. Вычисляется в момент открытия диалога (reactive ref не нужен,
 * диалог показывается кратко, точность до минуты достаточна).
 */
const resetLabel = computed(() => {
  const now = new Date();
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  const diffMs = midnight.getTime() - now.getTime();
  if (diffMs <= 0) return 'в 00:00';
  const hours = Math.floor(diffMs / 3_600_000);
  const minutes = Math.floor((diffMs % 3_600_000) / 60_000);
  if (hours >= 1 && minutes > 0)
    return `в 00:00 (через ${hours} ч ${minutes} мин)`;
  if (hours >= 1) return `в 00:00 (через ${hours} ч)`;
  if (minutes > 0) return `в 00:00 (через ${minutes} мин)`;
  return 'в 00:00';
});

const router = useRouter();

function onOpenChange(value: boolean) {
  emit('update:open', value);
}

function onClose() {
  emit('update:open', false);
}

function goToPractices() {
  emit('update:open', false);
  void router.push('/practices');
}
</script>
