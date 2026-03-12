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

      <section class="glass-deep p-4">
        <div class="flex items-center justify-between gap-3">
          <p class="text-sm font-semibold text-foreground">
            🔥 {{ streakText }}
          </p>
        </div>
        <p class="mt-1 text-xs text-foreground/70">
          {{ t('GRATITUDE_DIARY.STREAK_SUBTITLE', { count: streak }) }}
        </p>
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
import { useI18n } from 'vue-i18n';
import { navigateTo, useNuxtApp } from '#app';
import { useRouter } from 'vue-router';
import PageHeader from '@/app/components/PageHeader.vue';
import { Button } from '@/app/components/ui/button';
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

const { t } = useI18n();
const { $api } = useNuxtApp();
const router = useRouter();

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

const streakText = computed(() =>
  t('GRATITUDE_DIARY.STREAK_FORMAT', { count: streak.value })
);

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
  return new Date(isoDate).toLocaleString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
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
