<template>
  <div class="h-full overflow-y-auto rounded-lg">
    <div class="space-y-2 pb-[180px]">
      <PageHeader :show-back-button="true" title="" @go-back="handleBack">
        <template #custom>
          <h1 class="truncate text-xl font-bold text-foreground">
            {{ t('GRATITUDE_DIARY.TITLE') }}
          </h1>
        </template>
      </PageHeader>

      <section class="glass-deep overflow-hidden p-3">
        <div
          class="relative overflow-hidden rounded-[22px] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.16),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(244,114,182,0.14),transparent_38%),linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-3"
        >
          <div
            class="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0))]"
          />

          <div class="relative flex items-center gap-2.5">
            <div
              class="flex w-[68px] shrink-0 flex-col justify-end rounded-[18px] border border-white/10 bg-black/10 px-2 py-3"
            >
              <p class="text-4xl font-semibold leading-none text-white">
                {{ streak }}
              </p>
              <p
                class="mt-2 text-[9px] uppercase tracking-[0.24em] text-white/45"
              >
                {{ t('GRATITUDE_DIARY.STREAK_LABEL') }}
              </p>
            </div>

            <div class="min-w-0 flex-1">
              <div class="grid grid-cols-7 gap-1">
                <div
                  v-for="day in streakCalendarDays"
                  :key="day.key"
                  class="flex min-w-0 flex-col items-center gap-1"
                >
                  <component
                    :is="day.status === 'today' ? 'button' : 'div'"
                    :type="day.status === 'today' ? 'button' : undefined"
                    :aria-label="
                      day.status === 'today'
                        ? t('GRATITUDE_DIARY.STREAK_ADD_TODAY_ARIA')
                        : undefined
                    "
                    :class="streakDayCircleClass(day)"
                    @click="
                      day.status === 'today' ? openCreateEntry() : undefined
                    "
                  >
                    <IconPlus
                      v-if="day.status === 'today'"
                      class="h-4 w-4 text-rose-100"
                    />
                    <IconHeart v-else :class="streakDayIconClass(day)" />
                  </component>
                  <span :class="streakDayLabelClass(day)">
                    {{ day.label }}
                  </span>
                </div>
              </div>

              <p class="mt-2 line-clamp-1 text-xs font-medium text-white/72">
                {{ streakCardTitle }}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section class="space-y-2">
        <div v-if="isLoading" class="glass-deep p-4 text-sm text-foreground/70">
          {{ t('GRATITUDE_DIARY.LOADING') }}
        </div>

        <div
          v-else-if="!groupedEntries.length"
          class="glass-deep p-4 text-sm text-foreground/70"
        >
          {{ t('GRATITUDE_DIARY.EMPTY') }}
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="group in groupedEntries"
            :key="group.title"
            class="space-y-2"
          >
            <div class="glass-deep space-y-4 p-4">
              <h3
                class="text-xs font-semibold uppercase tracking-wide text-foreground/60"
              >
                {{ group.title }}
              </h3>
              <button
                v-for="entry in group.items"
                :key="entry.id"
                type="button"
                class="glass-border block w-full space-y-2 p-4 text-left transition hover:border-white/30"
                @click="openEntryEditor(entry.id)"
              >
                <div class="flex items-center justify-between gap-2">
                  <span class="text-xs text-foreground/65">
                    {{ formatEntryDate(entry.createdAt) }}
                  </span>
                  <span v-if="entry.mood" class="text-lg">
                    {{ moodEmoji(entry.mood) }}
                  </span>
                </div>

                <!-- Вопрос-подсказка, если был выбран при записи -->
                <p
                  v-if="entry.promptText"
                  class="text-xs font-medium text-foreground/55 italic"
                >
                  {{ entry.promptText }}
                </p>

                <p
                  class="line-clamp-4 whitespace-pre-line text-sm text-foreground/90"
                >
                  {{ entry.text }}
                </p>

                <div v-if="entry.photoUrl" class="cursor-zoom-in">
                  <img
                    :src="getEntryPhotoSrc(entry)"
                    :alt="t('GRATITUDE_DIARY.PHOTO_ALT')"
                    class="max-h-[220px] w-full rounded-xl object-contain"
                    @click.stop="openPhotoSwipeFromImg"
                    @error="handleEntryPhotoLoadError(entry)"
                  />
                </div>

                <div v-if="entry.tags.length" class="flex flex-wrap gap-2">
                  <span
                    v-for="tag in entry.tags"
                    :key="`${entry.id}-${tag}`"
                    class="rounded-full border border-white/20 px-2 py-0.5 text-xs text-foreground/70"
                  >
                    #{{ tag }}
                  </span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>

    <section class="fixed inset-x-2 bottom-[94px] z-30">
      <Button class="w-full" size="lg" @click="openCreateEntry">
        <IconSquarePen class="mr-2 h-4 w-4" />
        {{ t('GRATITUDE_DIARY.ADD_ENTRY') }}
      </Button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onMounted, ref } from 'vue';
import { useNow } from '@vueuse/core';
import { useI18n } from 'vue-i18n';
import { navigateTo, useNuxtApp } from '#app';
import { useRouter } from 'vue-router';
import PageHeader from '@/app/components/PageHeader.vue';
import { Button } from '@/app/components/ui/button';
import IconHeart from '~icons/lucide/heart';
import IconPlus from '~icons/lucide/plus';
import IconSquarePen from '~icons/lucide/square-pen';
import { usePhotoSwipe } from '@/app/composables/usePhotoSwipe';
import type { GratitudeDiaryMood } from '@/shared/dto';

const { openPhotoSwipeFromImg } = usePhotoSwipe();

interface DiaryEntry {
  id: number;
  text: string;
  mood: GratitudeDiaryMood | null;
  tags: string[];
  photoUrl: string | null;
  // Текст вопроса-подсказки, выбранного при записи
  promptText: string | null;
  inputMethod: 'text' | 'voice' | 'mixed';
  createdAt: string;
}

interface GroupedEntries {
  title: string;
  items: DiaryEntry[];
}

interface StreakCalendarDay {
  key: string;
  label: string;
  status: 'active' | 'today' | 'logged' | 'idle';
}

type StreakCardTone =
  | 'start'
  | 'restart'
  | 'early'
  | 'active'
  | 'long'
  | 'done';

const STREAK_CARD_TITLE_KEY: Record<StreakCardTone, string> = {
  start: 'GRATITUDE_DIARY.STREAK_START_LINE',
  restart: 'GRATITUDE_DIARY.STREAK_RESTART_LINE',
  early: 'GRATITUDE_DIARY.STREAK_EARLY_LINE',
  active: 'GRATITUDE_DIARY.STREAK_ACTIVE_LINE',
  long: 'GRATITUDE_DIARY.STREAK_LONG_LINE',
  done: 'GRATITUDE_DIARY.STREAK_DONE_LINE',
};

const { t, locale } = useI18n();
const { $api } = useNuxtApp();
const router = useRouter();
const now = useNow({ interval: 60_000 });

const streak = ref(0);
const entriesCount = ref(0);
const groupedEntries = ref<GroupedEntries[]>([]);
const isLoading = ref(false);
// Актуальный src для карточек: нужен для retry с cache-buster при холодном CDN.
const entryPhotoSrcMap = ref<Record<number, string>>({});
const entryPhotoRetryCountMap = ref<Record<number, number>>({});
const entryPhotoRetryTimerMap = new Map<
  number,
  ReturnType<typeof setTimeout>
>();

const allEntries = computed(() =>
  groupedEntries.value.flatMap((group) => group.items)
);

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addLocalDays(date: Date, days: number): Date {
  const shiftedDate = startOfLocalDay(date);
  shiftedDate.setDate(shiftedDate.getDate() + days);
  return shiftedDate;
}

function toLocalDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function formatWeekdayLabel(date: Date): string {
  const shortWeekday = new Intl.DateTimeFormat(locale.value, {
    weekday: 'short',
  }).format(date);
  const normalizedWeekday = shortWeekday.replace('.', '');

  return normalizedWeekday.charAt(0).toUpperCase() + normalizedWeekday.slice(1);
}

const entryDays = computed(() => {
  const daysByKey = new Map<string, Date>();

  for (const entry of allEntries.value) {
    const localDay = startOfLocalDay(new Date(entry.createdAt));
    const dayKey = toLocalDayKey(localDay);

    if (!daysByKey.has(dayKey)) {
      daysByKey.set(dayKey, localDay);
    }
  }

  return Array.from(daysByKey.values()).sort(
    (leftDay, rightDay) => rightDay.getTime() - leftDay.getTime()
  );
});

const entryDayKeys = computed(
  () => new Set(entryDays.value.map((day) => toLocalDayKey(day)))
);

const todayDayKey = computed(() => toLocalDayKey(startOfLocalDay(now.value)));

// Подсветку ряда строим от серверного streak, чтобы UI совпадал с бекенд-правилами.
const activeStreakDayKeys = computed(() => {
  const keys = new Set<string>();

  for (const day of entryDays.value.slice(0, streak.value)) {
    keys.add(toLocalDayKey(day));
  }

  return keys;
});

const todayHasEntry = computed(() => entryDayKeys.value.has(todayDayKey.value));

const streakCardTone = computed<StreakCardTone>(() => {
  if (streak.value === 0) {
    return entriesCount.value > 0 ? 'restart' : 'start';
  }

  if (todayHasEntry.value) {
    return 'done';
  }

  if (streak.value >= 7) {
    return 'long';
  }

  if (streak.value >= 3) {
    return 'active';
  }

  return 'early';
});

const streakCardTitle = computed(() =>
  t(STREAK_CARD_TITLE_KEY[streakCardTone.value])
);

const streakCalendarDays = computed<StreakCalendarDay[]>(() => {
  const today = startOfLocalDay(now.value);

  return Array.from({ length: 7 }, (_, index) => {
    const date = addLocalDays(today, index - 6);
    const key = toLocalDayKey(date);
    const isToday = key === todayDayKey.value;
    const hasEntry = entryDayKeys.value.has(key);
    const isActiveStreakDay = activeStreakDayKeys.value.has(key);

    let status: StreakCalendarDay['status'] = 'idle';

    if (isActiveStreakDay) {
      status = 'active';
    } else if (isToday && !hasEntry) {
      status = 'today';
    } else if (hasEntry) {
      status = 'logged';
    }

    return {
      key,
      label: formatWeekdayLabel(date),
      status,
    };
  });
});

function handleBack() {
  if (typeof window !== 'undefined' && window.history.length > 1) {
    router.back();
    return;
  }
  void navigateTo('/practices');
}

function openCreateEntry() {
  void navigateTo('/practices/gratitude-diary/editor');
}

function openEntryEditor(entryId: number) {
  void navigateTo({
    path: '/practices/gratitude-diary/editor',
    query: { entryId: String(entryId) },
  });
}

function formatEntryDate(isoDate: string): string {
  return new Date(isoDate).toLocaleString(locale.value, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function streakDayCircleClass(day: StreakCalendarDay): string {
  if (day.status === 'active') {
    return 'flex h-8 w-8 items-center justify-center rounded-2xl border border-white/0 bg-gradient-to-br from-rose-400 via-orange-300 to-amber-200 shadow-[0_10px_24px_rgba(251,146,60,0.26)]';
  }

  if (day.status === 'today') {
    return 'flex h-8 w-8 items-center justify-center rounded-2xl border border-dashed border-rose-300/60 bg-rose-400/10 transition hover:border-rose-200 hover:bg-rose-400/16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200/70 focus-visible:ring-offset-0';
  }

  if (day.status === 'logged') {
    return 'flex h-8 w-8 items-center justify-center rounded-2xl border border-white/15 bg-white/5';
  }

  return 'flex h-8 w-8 items-center justify-center rounded-2xl border border-white/10 bg-black/10';
}

function streakDayIconClass(day: StreakCalendarDay): string {
  if (day.status === 'active') {
    return 'h-4 w-4 fill-current text-white';
  }

  if (day.status === 'logged') {
    return 'h-4 w-4 text-rose-100/75';
  }

  return 'h-4 w-4 text-white/25';
}

function streakDayLabelClass(day: StreakCalendarDay): string {
  if (day.status === 'active' || day.status === 'today') {
    return 'text-[10px] font-semibold uppercase tracking-[0.08em] text-white/75';
  }

  return 'text-[10px] font-semibold uppercase tracking-[0.08em] text-white/45';
}

function moodEmoji(mood: GratitudeDiaryMood): string {
  const map: Record<GratitudeDiaryMood, string> = {
    great: '🙂',
    good: '😊',
    okay: '😌',
    low: '😐',
    sad: '😔',
  };
  return map[mood] || '🙂';
}

async function refreshDiary() {
  isLoading.value = true;
  try {
    const response = await $api<{
      streak: number;
      entriesCount: number;
      groupedEntries: GroupedEntries[];
    }>('/api/gratitude-diary', { method: 'GET' });

    streak.value = response.streak;
    entriesCount.value = response.entriesCount;
    groupedEntries.value = response.groupedEntries;
    // При каждом refresh синхронизируем базовые URL и сбрасываем ретраи.
    entryPhotoSrcMap.value = Object.fromEntries(
      response.groupedEntries
        .flatMap((group) => group.items)
        .filter((entry) => Boolean(entry.photoUrl))
        .map((entry) => [entry.id, entry.photoUrl as string])
    );
    entryPhotoRetryCountMap.value = {};
  } finally {
    isLoading.value = false;
  }
}

function getEntryPhotoSrc(entry: DiaryEntry): string | undefined {
  return entryPhotoSrcMap.value[entry.id] ?? entry.photoUrl ?? undefined;
}

function handleEntryPhotoLoadError(entry: DiaryEntry) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 2000;
  const basePhotoUrl = entry.photoUrl;

  if (!basePhotoUrl?.startsWith('http')) return;

  const currentRetryCount = entryPhotoRetryCountMap.value[entry.id] || 0;
  if (currentRetryCount >= MAX_RETRIES) return;

  const existingTimer = entryPhotoRetryTimerMap.get(entry.id);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const nextRetryCount = currentRetryCount + 1;
  entryPhotoRetryCountMap.value = {
    ...entryPhotoRetryCountMap.value,
    [entry.id]: nextRetryCount,
  };

  const retryTimer = setTimeout(() => {
    const separator = basePhotoUrl.includes('?') ? '&' : '?';

    entryPhotoSrcMap.value = {
      ...entryPhotoSrcMap.value,
      [entry.id]: `${basePhotoUrl}${separator}_r=${nextRetryCount}`,
    };

    entryPhotoRetryTimerMap.delete(entry.id);
  }, RETRY_DELAY_MS);

  entryPhotoRetryTimerMap.set(entry.id, retryTimer);
}

onMounted(async () => {
  await refreshDiary();
});

// Если страница дневника лежит в keep-alive, при возврате из editor принудительно обновляем список.
onActivated(async () => {
  await refreshDiary();
});

onBeforeUnmount(() => {
  for (const timer of entryPhotoRetryTimerMap.values()) {
    clearTimeout(timer);
  }
  entryPhotoRetryTimerMap.clear();
});
</script>
