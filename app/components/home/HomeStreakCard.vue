<template>
  <NuxtLink
    to="/streak"
    class="glass-deep flex items-center justify-between gap-3 p-4 animate-slide-up transition hover:border-white/20 hover:bg-white/[0.08]"
    :aria-label="ariaLabel"
  >
    <div class="flex min-w-0 items-center gap-3">
      <div
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-amber-100"
        :class="
          isPaused
            ? 'border-sky-200/25 bg-sky-300/15'
            : 'border-amber-200/25 bg-amber-300/15'
        "
        aria-hidden="true"
      >
        <IconPauseCircle v-if="isPaused" class="h-5 w-5" />
        <IconFlame v-else class="h-5 w-5" />
      </div>
      <div class="min-w-0">
        <p class="truncate text-sm font-semibold text-foreground">
          {{ title }}
        </p>
        <p class="truncate text-xs text-foreground/60">
          {{ caption }}
        </p>
      </div>
    </div>

    <div class="flex shrink-0 items-center gap-2">
      <div class="flex items-center gap-1.5" aria-label="Прогресс недели">
        <span
          v-for="(day, index) in normalizedWeekDetails"
          :key="`${day.status}-${index}`"
          class="h-2 w-2 rounded-full transition"
          :class="weekDotClass(day)"
        />
      </div>
      <IconArrowRight class="h-4 w-4 text-foreground/45" aria-hidden="true" />
    </div>
  </NuxtLink>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import IconArrowRight from '~icons/lucide/arrow-right';
import IconFlame from '~icons/lucide/flame';
import IconPauseCircle from '~icons/lucide/pause-circle';
import type { StreakDayDto, StreakSummaryDto } from '@/shared/dto/retention';

const props = defineProps<{
  current: number;
  best: number;
  week: boolean[];
  status?: StreakSummaryDto['status'];
  repair?: StreakSummaryDto['repair'];
  pausedSince?: string | null;
  notice?: StreakSummaryDto['notice'];
  weekDetails?: StreakDayDto[];
}>();

const isPaused = computed(() => props.status === 'paused');

const title = computed(() => {
  if (isPaused.value) return `Серия ${props.current} на паузе`;
  return props.current > 0
    ? `Дней подряд - ${props.current}`
    : 'Сегодня можно начать';
});

const caption = computed(() => {
  if (isPaused.value) return `Лучшая серия: ${props.best}`;
  return `Лучшая серия: ${props.best}`;
});

const ariaLabel = computed(() =>
  isPaused.value
    ? `Серия ${props.current} на паузе. Открыть историю серии`
    : `Серия ${props.current} дней. Открыть историю серии`
);

const normalizedWeek = computed(() => {
  const week = props.week.slice(-7);
  return week.length === 7
    ? week
    : [...Array.from({ length: 7 - week.length }, () => false), ...week];
});

const normalizedWeekDetails = computed<StreakDayDto[]>(() => {
  const details = props.weekDetails?.slice(-7);
  if (details?.length === 7) return details;
  return normalizedWeek.value.map((active) => ({
    active,
    date: '',
    status: active ? 'active' : 'missed',
  }));
});

function weekDotClass(day: StreakDayDto): string {
  if (day.status === 'paused') return 'bg-sky-300';
  if (day.active || day.status === 'repaired') return 'bg-emerald-300';
  if (day.status === 'today') return 'bg-white/28 ring-1 ring-white/25';
  return 'bg-white/20';
}
</script>
