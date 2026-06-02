<template>
  <!-- Inline-индикатор bubbles по actions внутри одного шага.
       Раньше был отдельной секцией с glass-deep wrapper'ом и текстом
       «Выполнено N из M», но это дублировало progress bar в `ProgramStepHeader`
       (UX-фидбэк сессии 16). Сейчас компонент рендерится прямо внутри header'а
       как ряд кружков, без своей плашки. -->
  <ol class="flex items-center gap-1.5">
    <li
      v-for="(action, index) in actions"
      :key="action.id"
      class="relative flex h-6 w-6 items-center justify-center rounded-full border transition-all duration-200"
      :class="bubbleClass(action, index)"
      :aria-label="bubbleAriaLabel(action, index)"
    >
      <Transition name="indicator-check" mode="out-in">
        <IconCheck
          v-if="isActionDone(action)"
          key="check"
          class="h-3 w-3 text-background"
        />
        <span
          v-else-if="index === currentIndex"
          key="dot"
          class="h-1.5 w-1.5 rounded-full bg-foreground"
        />
        <span
          v-else
          key="empty"
          class="text-[10px] font-semibold text-foreground/40"
        >
          {{ index + 1 }}
        </span>
      </Transition>
    </li>
  </ol>
</template>

<script setup lang="ts">
import IconCheck from '~icons/lucide/check';
import type { ProgramStepActionStateDto } from '@/shared/dto/retention';

/**
 * Индикатор прогресса по actions внутри одного шага программы.
 *
 * Источник истины:
 *  - `action.status === 'completed'` — серверно подтверждённое завершение
 *    (после PATCH `/api/program-step-attempts/:id/actions/:id`).
 *  - `transientlyCompletedIds` — клиентский Set для случаев, когда practice
 *    завершилась (например, дыхание подошло к концу) до клика «Дальше»,
 *    то есть статус ещё не сохранён, но UI должен сразу показать галочку.
 *
 * См. retention/retention_long_term_strategy.md
 */

const props = defineProps<{
  actions: ProgramStepActionStateDto[];
  currentIndex: number;
  transientlyCompletedIds?: Set<string>;
}>();

function isActionDone(action: ProgramStepActionStateDto): boolean {
  return (
    action.status === 'completed' ||
    Boolean(props.transientlyCompletedIds?.has(action.id))
  );
}

function bubbleClass(action: ProgramStepActionStateDto, index: number) {
  if (isActionDone(action)) {
    return 'border-emerald-200/40 bg-emerald-300/80';
  }
  if (index === props.currentIndex) {
    return 'border-amber-200/60 bg-amber-300/15';
  }
  return 'border-white/15 bg-white/5';
}

function bubbleAriaLabel(
  action: ProgramStepActionStateDto,
  index: number
): string {
  if (isActionDone(action)) return `Шаг ${index + 1} выполнен`;
  if (index === props.currentIndex) return `Шаг ${index + 1} — текущий`;
  return `Шаг ${index + 1}`;
}
</script>

<style scoped>
.indicator-check-enter-active,
.indicator-check-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}
.indicator-check-enter-from {
  opacity: 0;
  transform: scale(0.6);
}
.indicator-check-leave-to {
  opacity: 0;
  transform: scale(0.8);
}
</style>
