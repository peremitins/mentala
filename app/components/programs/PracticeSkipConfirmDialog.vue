<template>
  <Dialog :open="open" @update:open="onOpenChange">
    <DialogContent
      class="glass-deep border border-border bg-card text-card-foreground"
    >
      <DialogHeader class="space-y-2">
        <div
          class="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-emerald-100/25 bg-emerald-100/[0.06] text-emerald-100"
          aria-hidden="true"
        >
          <IconWind class="h-6 w-6" />
        </div>
        <DialogTitle class="text-center text-lg font-semibold">
          {{ title }}
        </DialogTitle>
        <DialogDescription
          as="div"
          class="space-y-2 text-center text-sm leading-relaxed text-foreground/80"
        >
          <p>{{ body }}</p>
        </DialogDescription>
      </DialogHeader>

      <div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button type="button" variant="ghost" class="w-full" @click="onStay">
          Остаться
        </Button>
        <Button type="button" class="w-full" @click="onConfirm">
          Пропустить
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import IconWind from '~icons/lucide/wind';
import { Button } from '@/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import type { ProgramStepActionStateDto } from '@/shared/dto/retention';

/**
 * Мягкое подтверждение пропуска практики (медитация / дыхание / quick-help).
 *
 * Жёсткого гейта «дослушай до конца» в roadmap нет: кнопка перехода у практик
 * всегда активна. Если пользователь жмёт «Дальше», не завершив практику честно,
 * раннер шага ([step].vue) открывает эту модалку. «Остаться» возвращает к
 * практике, «Пропустить» засчитывает шаг (с output.skipped) и идёт дальше.
 *
 * Тон-оф-войс §2.4: без guilt-формулировок и без «обязательно». Мягкое
 * напоминание о ценности паузы — и сразу уважение к выбору пользователя.
 */

const props = defineProps<{
  open: boolean;
  /** Тип практики — чтобы подобрать формулировку (аудио vs дыхание). */
  practiceType?: ProgramStepActionStateDto['type'] | null;
}>();
const emit = defineEmits<{
  (e: 'update:open', open: boolean): void;
  (e: 'confirm'): void;
}>();

const isMeditation = computed(() => props.practiceType === 'meditation');

const title = computed(() =>
  isMeditation.value ? 'Пропустить медитацию?' : 'Пропустить практику?'
);

const body = computed(
  () => 'Если есть пара минут, эта пауза часто помогает больше, чем кажется.'
);

function onOpenChange(value: boolean) {
  emit('update:open', value);
}

function onStay() {
  emit('update:open', false);
}

function onConfirm() {
  emit('update:open', false);
  emit('confirm');
}
</script>
