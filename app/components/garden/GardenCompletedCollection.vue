<template>
  <section v-if="plants.length > 0" class="glass-deep p-4 space-y-3">
    <header class="flex items-center justify-between">
      <h3 class="text-sm font-semibold text-foreground">Коллекция</h3>
      <span class="text-[11px] text-foreground/55">
        {{ plants.length }} {{ pluralize(plants.length) }}
      </span>
    </header>
    <ul class="space-y-2">
      <li
        v-for="plant in plants"
        :key="plant.programSlug"
        class="relative rounded-2xl border border-white/10 bg-white/5 p-3"
      >
        <!-- Бейдж статуса в правом верхнем углу — заполняет верхнюю зону
             карточки и сразу читается как итог. -->
        <span
          v-if="locked"
          class="absolute right-2.5 top-2.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/25 bg-black/70 text-xs leading-none"
          aria-hidden="true"
          >⭐</span
        >
        <span
          v-else
          class="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200"
        >
          <IconCheck class="h-3 w-3" />
          Завершён
        </span>

        <div class="flex items-start gap-3">
          <img
            :src="getPlantImageSrcSafe(plant.stateIndex, plant.plantSetSlug)"
            :alt="plant.title"
            class="h-12 w-12 shrink-0 rounded-2xl bg-white/[0.04] object-contain p-0.5"
            loading="eager"
            decoding="async"
            @error="onPlantImageError"
          />
          <div class="min-w-0 flex-1 pr-16">
            <p class="text-sm font-semibold text-foreground">
              {{ plant.title }}
            </p>
            <p
              v-if="plant.completedAt"
              class="mt-0.5 text-[11px] text-foreground/50"
            >
              {{ formatDate(plant.completedAt) }}
            </p>
            <!-- Краткий лор сада — заполняет свободное место и даёт контекст
                 «о чём был путь», не только сухой факт завершения. -->
            <p
              v-if="plant.summaryText"
              class="mt-1.5 line-clamp-2 text-xs leading-relaxed text-foreground/60"
            >
              {{ plant.summaryText }}
            </p>
          </div>
        </div>

        <!-- Две явные кнопки вместо клика по всей карточке: для завершённого
             сада обе ветки (вернуться к отчёту / перепройти путь) равноценны,
             и явность важнее компактности. Стиль одинаковый — ни одну не
             выделяем как основную. -->
        <div class="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            class="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-foreground/85 transition hover:border-white/20 hover:bg-white/10 active:scale-[0.98]"
            :aria-label="`Открыть отчёт по саду «${plant.title}»`"
            @click="emit('open-report', plant)"
          >
            <IconScroll class="h-3.5 w-3.5" aria-hidden="true" />
            Отчёт
          </button>
          <button
            type="button"
            class="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-foreground/85 transition hover:border-white/20 hover:bg-white/10 active:scale-[0.98]"
            :aria-label="`Открыть карту пути сада «${plant.title}»`"
            @click="emit('open-map', plant)"
          >
            <IconMap class="h-3.5 w-3.5" aria-hidden="true" />
            Карта пути
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import IconCheck from '~icons/lucide/check';
import IconScroll from '~icons/lucide/scroll-text';
import IconMap from '~icons/lucide/map';
import { getRetentionPlantImageSrc } from '@/app/utils/retentionPlant';
import type { GardenPlantItemDto } from '@/shared/dto/garden';

defineProps<{
  plants: GardenPlantItemDto[];
  locked?: boolean;
}>();

const emit = defineEmits<{
  (e: 'open-report', plant: GardenPlantItemDto): void;
  (e: 'open-map', plant: GardenPlantItemDto): void;
}>();

function pluralize(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return 'сад';
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100))
    return 'сада';
  return 'садов';
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

function getPlantImageSrcSafe(stateIndex: number, plantSetSlug?: string) {
  // stateIndex в user_plants хранится 1..15 (финальная стадия = 15),
  // а helper getRetentionPlantImageSrc работает в 0-based индексации.
  // Clamp до 14 защищает от out-of-bounds на старых записях с stateIndex=16.
  const safeIndex = Math.max(0, Math.min(14, stateIndex - 1));
  return getRetentionPlantImageSrc(safeIndex, plantSetSlug);
}

function onPlantImageError(event: Event) {
  // Не паникуем — пользователь увидит сломанную картинку, текст карточки всё равно есть.
  const img = event.target as HTMLImageElement | null;
  if (img) img.style.visibility = 'hidden';
}
</script>
