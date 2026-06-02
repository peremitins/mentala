<template>
  <section v-if="silhouettes.length > 0" class="glass-deep p-4 space-y-3">
    <h3 class="text-sm font-semibold text-foreground">Что ждёт впереди</h3>
    <ul class="space-y-2">
      <li v-for="silhouette in silhouettes" :key="silhouette.programSlug">
        <button
          type="button"
          class="relative w-full rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-3 text-left transition hover:border-white/25 hover:bg-white/[0.05] active:scale-[0.99]"
          :aria-label="`Подробнее о саде «${silhouette.title}»`"
          @click="emit('select', silhouette)"
        >
          <div class="flex items-start gap-2.5">
            <span
              class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-foreground/55"
              aria-hidden="true"
            >
              <IconLock class="h-3.5 w-3.5" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-semibold text-foreground/70">
                {{ silhouette.title }}
              </p>
              <p
                v-if="silhouette.subtitle"
                class="mt-0.5 line-clamp-2 text-xs text-foreground/55"
              >
                {{ silhouette.subtitle }}
              </p>
            </div>
          </div>
        </button>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import IconLock from '~icons/lucide/lock';
import type { GardenLockedSilhouetteDto } from '@/shared/dto/garden';

/**
 * Силуэты будущих Садов. Тон-оф-войс — anticipation, не «у тебя нет, ты
 * неполноценен» (см. retention/retention_long_term_strategy.md):
 *  - ✅ «Откроется, когда ты завершишь ещё 3 сада»
 *  - ❌ «У тебя пока нет этого растения»
 *
 * Карточка кликабельна — тап открывает GardenLockedProgramModal с описанием и
 * условием разблокировки. Все закрытые Сады выглядят одинаково: единый тон
 * «откроется последовательно», без различия «готов / в разработке».
 */
defineProps<{
  silhouettes: GardenLockedSilhouetteDto[];
}>();

const emit = defineEmits<{
  (e: 'select', silhouette: GardenLockedSilhouetteDto): void;
}>();
</script>
