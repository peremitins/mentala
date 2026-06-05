<template>
  <div
    class="relative h-full overflow-y-auto xs:space-y-3 space-y-1 pb-[110px] rounded-lg"
  >
    <PageHeader title="Серия" show-back-button @go-back="goBack" />

    <section
      v-if="loading && !history"
      class="glass-deep h-56 animate-pulse"
      aria-label="Загрузка серии"
    />

    <section
      v-else-if="loadError"
      class="glass-deep flex flex-col items-center gap-3 p-6 text-center"
    >
      <IconFlame class="h-8 w-8 text-amber-100" aria-hidden="true" />
      <p class="text-sm text-foreground/80">Не удалось загрузить серию.</p>
      <Button type="button" class="rounded-full" @click="loadStreak">
        Попробовать снова
      </Button>
    </section>

    <template v-else-if="history">
      <section class="glass-deep space-y-4 p-4">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0 space-y-1">
            <p
              class="text-xs font-semibold uppercase tracking-[0.16em] text-foreground/45"
            >
              {{ statusEyebrow }}
            </p>
            <h1 class="text-3xl font-bold leading-tight text-foreground">
              {{ summaryTitle }}
            </h1>
          </div>
          <div
            class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border"
            :class="
              isPaused
                ? 'border-sky-200/25 bg-sky-300/15 text-sky-100'
                : 'border-amber-200/25 bg-amber-300/15 text-amber-100'
            "
            aria-hidden="true"
          >
            <IconPauseCircle v-if="isPaused" class="h-6 w-6" />
            <IconFlame v-else class="h-6 w-6" />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div class="rounded-lg border border-white/10 bg-white/[0.04] p-3">
            <p class="text-[11px] text-foreground/48">Сейчас</p>
            <p class="text-xl font-semibold text-foreground">
              {{ history.summary.current }}
            </p>
          </div>
          <div class="rounded-lg border border-white/10 bg-white/[0.04] p-3">
            <p class="text-[11px] text-foreground/48">Лучшее</p>
            <p class="text-xl font-semibold text-foreground">
              {{ history.summary.best }}
            </p>
          </div>
        </div>

        <div
          v-if="history.summary.notice"
          class="rounded-lg border border-amber-200/18 bg-amber-200/10 p-3"
        >
          <p class="text-sm font-semibold text-foreground">
            {{ history.summary.notice.title }}
          </p>
          <p class="mt-1 text-xs leading-relaxed text-foreground/68">
            {{ history.summary.notice.text }}
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <Button
            v-if="isPaused"
            type="button"
            class="rounded-full"
            :disabled="actionPending"
            @click="resume"
          >
            <IconPlay class="h-4 w-4" />
            Продолжить
          </Button>
          <Button
            v-else
            type="button"
            variant="outline"
            class="rounded-full border-white/15 bg-white/[0.03]"
            :disabled="actionPending"
            @click="pause"
          >
            <IconPause class="h-4 w-4" />
            Поставить на паузу
          </Button>
        </div>
      </section>

      <Tabs default-value="calendar" class="space-y-3">
        <TabsList
          class="glass-deep grid w-full grid-cols-2 rounded-lg bg-white/[0.06] p-1"
        >
          <TabsTrigger value="calendar">Календарь</TabsTrigger>
          <TabsTrigger value="events">События</TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" class="glass-deep space-y-3 p-4">
          <div class="grid grid-cols-7 gap-1.5">
            <div
              v-for="day in history.calendarDays"
              :key="day.date"
              class="flex aspect-square min-h-9 items-center justify-center rounded-md border text-[11px] font-semibold"
              :class="dayClass(day)"
              :title="`${formatShortDate(day.date)}: ${dayLabel(day)}`"
            >
              {{ dayNumber(day.date) }}
            </div>
          </div>

          <div class="flex flex-wrap gap-2 text-[11px] text-foreground/60">
            <span
              v-for="item in legend"
              :key="item.label"
              class="inline-flex items-center gap-1.5"
            >
              <span class="h-2 w-2 rounded-full" :class="item.dot" />
              {{ item.label }}
            </span>
          </div>
        </TabsContent>

        <TabsContent value="events" class="glass-deep p-4">
          <div v-if="history.events.length === 0" class="py-8 text-center">
            <p class="text-sm text-foreground/62">
              События серии появятся после первых активных дней.
            </p>
          </div>
          <ol v-else class="space-y-3">
            <li
              v-for="event in history.events"
              :key="event.id"
              class="flex gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-3"
            >
              <div
                class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                :class="eventIconClass(event.type)"
                aria-hidden="true"
              >
                <component :is="eventIcon(event.type)" class="h-4 w-4" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold text-foreground">
                  {{ eventTitle(event.type) }}
                </p>
                <p class="text-xs text-foreground/58">
                  {{ formatLongDate(event.eventDate) }}
                </p>
              </div>
            </li>
          </ol>
        </TabsContent>
      </Tabs>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import IconFlame from '~icons/lucide/flame';
import IconPause from '~icons/lucide/pause';
import IconPauseCircle from '~icons/lucide/pause-circle';
import IconPlay from '~icons/lucide/play';
import IconRefreshCw from '~icons/lucide/refresh-cw';
import IconShieldCheck from '~icons/lucide/shield-check';
import PageHeader from '@/app/components/PageHeader.vue';
import { Button } from '@/app/components/ui/shadcn/button';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/app/components/ui/shadcn/tabs';
import { useAPI } from '@/app/composables/useAPI';
import type {
  StreakDayDto,
  StreakEventType,
  StreakHistoryResponseDto,
  StreakSummaryDto,
} from '@/shared/dto/retention';

const history = ref<StreakHistoryResponseDto | null>(null);
const loading = ref(true);
const loadError = ref(false);
const actionPending = ref(false);

const isPaused = computed(() => history.value?.summary.status === 'paused');
const statusEyebrow = computed(() =>
  isPaused.value ? 'Пауза без потери прогресса' : 'Регулярность без давления'
);
const summaryTitle = computed(() => {
  const current = history.value?.summary.current ?? 0;
  if (isPaused.value) return `${current} на паузе`;
  return current > 0 ? `Дней подряд - ${current}` : 'Можно начать сегодня';
});

const legend = computed(() => [
  { label: 'Активность', dot: 'bg-emerald-300' },
  { label: 'Пауза', dot: 'bg-sky-300' },
  { label: 'Пропуск', dot: 'bg-white/25' },
]);

function goBack() {
  void navigateTo('/');
}

async function loadStreak() {
  loadError.value = false;
  loading.value = true;
  try {
    history.value = await useAPI<StreakHistoryResponseDto>('/api/streak', {
      suppressErrorToast: true,
    });
  } catch (error) {
    console.error('[Streak] Не удалось загрузить историю:', error);
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

async function runAction(endpoint: '/api/streak/pause' | '/api/streak/resume') {
  if (actionPending.value) return;
  actionPending.value = true;
  try {
    const summary = await useAPI<StreakSummaryDto>(endpoint, {
      method: 'POST',
      suppressErrorToast: true,
    });
    if (history.value) {
      history.value = { ...history.value, summary };
    }
    await loadStreak();
  } catch (error) {
    console.error('[Streak] Не удалось изменить статус серии:', error);
  } finally {
    actionPending.value = false;
  }
}

function pause() {
  void runAction('/api/streak/pause');
}

function resume() {
  void runAction('/api/streak/resume');
}

function dayNumber(date: string): string {
  return date.slice(-2).replace(/^0/, '');
}

function formatShortDate(date: string): string {
  const parsed = parseDateKey(date);
  if (!parsed) return date;
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
  }).format(parsed);
}

function formatLongDate(date: string): string {
  const parsed = parseDateKey(date);
  if (!parsed) return date;
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parsed);
}

function parseDateKey(date: string): Date | null {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

function dayClass(day: StreakDayDto): string {
  if (day.status === 'today' && day.active) {
    return 'border-emerald-200/40 bg-emerald-300/25 text-emerald-50';
  }
  if (day.status === 'today') {
    return 'border-white/18 bg-white/[0.05] text-foreground/75';
  }
  if (day.status === 'active') {
    return 'border-emerald-200/24 bg-emerald-300/18 text-emerald-50';
  }
  if (day.status === 'repaired') {
    return 'border-emerald-200/24 bg-emerald-300/18 text-emerald-50';
  }
  if (day.status === 'paused') {
    return 'border-sky-200/24 bg-sky-300/16 text-sky-50';
  }
  return 'border-white/8 bg-white/[0.025] text-foreground/38';
}

function dayLabel(day: StreakDayDto): string {
  if (day.status === 'today')
    return day.active ? 'сегодня засчитано' : 'сегодня';
  if (day.status === 'active') return 'активность';
  if (day.status === 'repaired') return 'активность';
  if (day.status === 'paused') return 'пауза';
  return 'пропуск';
}

function eventTitle(type: StreakEventType): string {
  if (type === 'started') return 'Серия началась';
  if (type === 'extended') return 'Серия продолжилась';
  if (type === 'repaired') return 'Серия сохранена';
  if (type === 'paused_auto') return 'Автоматическая пауза';
  if (type === 'paused_manual') return 'Пауза включена';
  return 'Пауза снята';
}

function eventIcon(type: StreakEventType) {
  if (type === 'repaired') return IconShieldCheck;
  if (type === 'paused_auto' || type === 'paused_manual')
    return IconPauseCircle;
  if (type === 'resumed') return IconPlay;
  if (type === 'extended') return IconRefreshCw;
  return IconFlame;
}

function eventIconClass(type: StreakEventType): string {
  if (type === 'repaired') return 'bg-amber-300/16 text-amber-100';
  if (type === 'paused_auto' || type === 'paused_manual') {
    return 'bg-sky-300/16 text-sky-100';
  }
  if (type === 'resumed') return 'bg-emerald-300/16 text-emerald-100';
  return 'bg-white/[0.07] text-foreground/78';
}

onMounted(() => {
  void loadStreak();
});
</script>
