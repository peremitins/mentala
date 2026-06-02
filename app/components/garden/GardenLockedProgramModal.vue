<template>
  <BottomSheet v-model:open="openModel">
    <div v-if="props.silhouette" class="space-y-4 p-5 pt-2">
      <div class="space-y-1">
        <p
          class="text-[11px] font-semibold uppercase tracking-wide text-foreground/55"
        >
          Откроется позже
        </p>
        <DialogTitle class="text-xl font-semibold text-foreground">
          {{ props.silhouette.title }}
        </DialogTitle>
        <DialogDescription
          v-if="props.silhouette.subtitle"
          as="p"
          class="text-sm leading-relaxed text-foreground/70"
        >
          {{ props.silhouette.subtitle }}
        </DialogDescription>
      </div>

      <!-- Условие открытия. Тон - последовательность, не дефицит и не
           «в разработке» (retention/retention_long_term_strategy.md): сад готов и
           ждёт своей очереди, откроется по мере прохождения предыдущих. -->
      <section class="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5">
        <p class="text-sm leading-relaxed text-foreground/80">
          {{ unlockText }}
        </p>
      </section>

      <button
        type="button"
        class="inline-flex w-full min-h-11 items-center justify-center rounded-full border border-white/15 bg-white/5 px-5 py-2 text-sm font-medium text-foreground transition hover:bg-white/10"
        @click="openModel = false"
      >
        Понятно
      </button>
    </div>
  </BottomSheet>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { DialogDescription, DialogTitle } from 'radix-vue';
import BottomSheet from '@/app/components/ui/BottomSheet.vue';
import type { GardenLockedSilhouetteDto } from '@/shared/dto/garden';

/**
 * Модалка закрытого Сада. Открывается тапом по карточке в
 * GardenLockedSilhouettes. Все закрытые сады показываются единообразно: сад
 * готов и откроется последовательно, когда ты пройдёшь предыдущие. Никакого
 * «в разработке» - у юзера должно быть ощущение, что путь уже ждёт впереди.
 */
const props = defineProps<{
  open: boolean;
  silhouette: GardenLockedSilhouetteDto | null;
}>();

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void;
}>();

const openModel = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value),
});

const unlockText = computed(() => {
  if (!props.silhouette) return '';
  const n = props.silhouette.remainingToUnlock;
  if (n <= 0) {
    return 'Этот сад откроется совсем скоро - он уже ждёт своей очереди.';
  }
  const gardens = n === 1 ? 'ещё один сад' : `ещё ${n} ${gardenPlural(n)}`;
  return `Этот сад откроется, когда ты завершишь ${gardens}. Всё по порядку - каждый пройденный путь готовит почву для следующего.`;
});

function gardenPlural(n: number): string {
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100))
    return 'сада';
  return 'садов';
}
</script>
