<template>
  <BottomSheet v-model:open="openModel">
    <div v-if="props.step" class="space-y-4 p-5 pt-2">
      <div class="space-y-1">
        <p
          class="text-[11px] font-semibold uppercase tracking-wide text-foreground/55"
        >
          Шаг {{ props.step.step }} · откроется позже
        </p>
        <DialogTitle class="text-xl font-semibold text-foreground">
          {{ props.step.title }}
        </DialogTitle>
        <DialogDescription as="p" class="text-sm text-foreground/70">
          {{
            props.step.subtitle ||
            'Шаг откроется после прохождения текущего и обновления дневного лимита.'
          }}
        </DialogDescription>
      </div>

      <!-- Альтернативы: свободные практики, которые работают всегда
           и не считаются в дневном лимите шагов. -->
      <section class="space-y-2">
        <p class="text-xs font-medium text-foreground/55">
          Пока шаг недоступен, можно:
        </p>
        <div class="grid grid-cols-1 gap-2">
          <button
            v-for="item in alternatives"
            :key="item.key"
            type="button"
            class="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-left transition active:scale-[0.99] hover:bg-white/8"
            @click="goTo(item.path)"
          >
            <span
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/5"
              aria-hidden="true"
            >
              <component :is="item.icon" class="h-4 w-4 text-foreground/80" />
            </span>
            <span class="min-w-0 flex-1 text-sm font-medium text-foreground">
              {{ item.title }}
            </span>
          </button>
        </div>
      </section>

      <button
        type="button"
        class="inline-flex w-full min-h-11 items-center justify-center rounded-full border border-white/15 bg-white/5 px-5 py-2 text-sm font-medium text-foreground transition hover:bg-white/10"
        @click="openModel = false"
      >
        Закрыть
      </button>
    </div>
  </BottomSheet>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { DialogDescription, DialogTitle } from 'radix-vue';
import IconWind from '~icons/lucide/wind';
import IconMusic from '~icons/lucide/music-2';
import IconNotebookPen from '~icons/lucide/notebook-pen';
import IconMessageCircle from '~icons/lucide/message-circle';
import BottomSheet from '@/app/components/ui/BottomSheet.vue';
import type { ProgramStepDto } from '@/shared/dto/retention';

/**
 * Bottom sheet для случая, когда пользователь тапнул на закрытый шаг карты
 * пути (status='available' или 'locked'). Показывает название и описание
 * шага + блок свободных практик, которые доступны прямо сейчас.
 *
 * Свободные практики не считаются в дневном лимите и могут давать капли.
 * См. retention/retention_long_term_strategy.md
 */

const props = defineProps<{
  open: boolean;
  step: ProgramStepDto | null;
}>();

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void;
}>();

const router = useRouter();

const openModel = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value),
});

const alternatives = [
  {
    key: 'breath',
    title: 'Дыхательная практика',
    path: '/breath-practices',
    icon: IconWind,
  },
  {
    key: 'meditation',
    title: 'Медитация',
    path: '/meditations',
    icon: IconMusic,
  },
  {
    key: 'gratitude',
    title: 'Запись в дневнике',
    path: '/practices/gratitude-diary',
    icon: IconNotebookPen,
  },
  {
    key: 'chat',
    title: 'Разговор с ассистентом',
    path: '/chat',
    icon: IconMessageCircle,
  },
];

function goTo(path: string) {
  emit('update:open', false);
  void router.push(path);
}
</script>
