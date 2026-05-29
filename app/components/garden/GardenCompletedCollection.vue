<template>
  <section v-if="plants.length > 0" class="glass-deep p-4 space-y-3">
    <header class="flex items-center justify-between">
      <h3 class="text-sm font-semibold text-foreground">Коллекция</h3>
      <span class="text-[11px] text-foreground/55">
        {{ plants.length }} {{ pluralize(plants.length) }}
      </span>
    </header>
    <ul class="grid grid-cols-2 gap-2">
      <li v-for="plant in plants" :key="plant.programSlug">
        <button
          type="button"
          class="relative w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-left transition hover:border-white/20 hover:bg-white/10 active:scale-[0.98]"
          :aria-label="`Открыть карточку растения «${plant.title}»`"
          @click="emit('select', plant)"
        >
          <span
            v-if="locked"
            class="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/25 bg-black/70 text-xs leading-none"
            aria-hidden="true"
          >⭐</span>
          <div class="flex items-center gap-2.5">
            <img
              :src="getPlantImageSrcSafe(plant.stateIndex, plant.plantSetSlug)"
              :alt="plant.title"
              class="h-10 w-10 shrink-0 rounded-2xl object-contain"
              loading="lazy"
              decoding="async"
              @error="onPlantImageError"
            />
            <div class="min-w-0">
              <p class="truncate text-sm font-semibold text-foreground">
                {{ plant.title }}
              </p>
              <p
                v-if="plant.completedAt"
                class="truncate text-[11px] text-foreground/55"
              >
                {{ formatDate(plant.completedAt) }}
              </p>
            </div>
          </div>
        </button>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { getRetentionPlantImageSrc } from '@/app/utils/retentionPlant';
import type { GardenPlantItemDto } from '@/shared/dto/garden';

defineProps<{
  plants: GardenPlantItemDto[];
  locked?: boolean;
}>();

const emit = defineEmits<{ (e: 'select', plant: GardenPlantItemDto): void }>();

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
