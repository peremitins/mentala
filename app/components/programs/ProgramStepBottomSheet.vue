<template>
  <BottomSheet v-model:open="openModel">
    <div v-if="props.step" class="space-y-4 p-5 pt-2">
      <div class="space-y-1">
        <p
          class="text-[11px] font-semibold uppercase tracking-wide text-foreground/55"
        >
          {{ statusLabel }}
        </p>
        <DialogTitle class="text-xl font-semibold text-foreground">
          {{ props.step.title }}
        </DialogTitle>
        <p class="text-sm text-foreground/70">
          {{ props.step.subtitle || 'Короткая практика программы.' }}
        </p>
      </div>

      <DialogDescription
        v-if="props.step.status === 'completed'"
        class="rounded-2xl border border-emerald-200/20 bg-emerald-300/10 px-3 py-2 text-sm font-medium text-emerald-100"
      >
        Пройдено
      </DialogDescription>
      <DialogDescription
        v-else-if="props.step.status === 'available'"
        class="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground/65"
      >
        Следующий шаг откроется после текущего. Любую свободную практику можно
        открыть во вкладке «Практики».
      </DialogDescription>
      <div
        v-else-if="props.step.status === 'locked'"
        class="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground/65"
      >
        Этот шаг откроется позже. Уже доступные практики остаются во вкладке
        «Практики».
      </div>

      <div class="grid grid-cols-1 gap-2">
        <button
          v-if="canStart"
          type="button"
          class="relative inline-flex min-h-11 items-center justify-center rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background transition hover:bg-foreground/90 active:scale-[0.98]"
          @click="props.locked ? emit('paywall') : emitStart()"
        >
          <span
            v-if="props.locked"
            class="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/25 bg-black/70 text-xs leading-none"
            aria-hidden="true"
            >⭐</span
          >
          {{ primaryLabel }}
        </button>
        <button
          type="button"
          class="inline-flex min-h-11 items-center justify-center rounded-full border border-white/15 bg-white/5 px-5 py-2 text-sm font-medium text-foreground transition hover:bg-white/10"
          @click="openModel = false"
        >
          Закрыть
        </button>
      </div>
    </div>
  </BottomSheet>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { DialogDescription, DialogTitle } from 'radix-vue';
import BottomSheet from '@/app/components/ui/BottomSheet.vue';
import { useHaptics } from '@/app/composables/useHaptics';
import type { ProgramStepDto } from '@/shared/dto/retention';

const props = defineProps<{
  open: boolean;
  step: ProgramStepDto | null;
  locked?: boolean;
  inProgress?: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void;
  (event: 'start', payload: { step: ProgramStepDto; replay: boolean }): void;
  (event: 'paywall'): void;
}>();

const openModel = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value),
});
const { triggerLight, triggerMedium } = useHaptics();

const canStart = computed(
  () => props.step?.status === 'completed' || props.step?.status === 'active'
);

const primaryLabel = computed(() => {
  if (props.step?.status === 'completed') return 'Повторить';
  return props.inProgress ? 'Продолжить' : 'Начать';
});

const statusLabel = computed(() => {
  if (!props.step) return '';
  if (props.step.status === 'completed')
    return `Шаг ${props.step.step} · пройден`;
  if (props.step.status === 'active') return `Шаг ${props.step.step} · сегодня`;
  if (props.step.status === 'available')
    return `Шаг ${props.step.step} · дальше`;
  return `Шаг ${props.step.step}`;
});

function emitStart() {
  if (!props.step || !canStart.value) return;
  if (props.step.status === 'completed') {
    void triggerLight();
  } else {
    void triggerMedium();
  }
  emit('start', {
    step: props.step,
    replay: props.step.status === 'completed',
  });
}
</script>
