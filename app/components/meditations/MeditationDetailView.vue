<template>
  <div class="relative h-full overflow-hidden rounded-lg">
    <div class="flex h-full flex-col justify-between space-y-2 overflow-y-auto">
      <PageHeader
        :title="topicName"
        :show-back-button="true"
        @go-back="goBack"
      />

      <div class="mt-1 flex flex-col items-center gap-2 text-center">
        <h1 class="text-xl font-semibold leading-tight text-elevated-strong">
          {{ track?.title || 'Медитация' }}
        </h1>
        <p class="max-w-xl text-sm text-white text-elevated">
          {{
            track?.description ||
            'Фоновая медитация: мягкий ритм, чтобы выдохнуть и вернуться к себе.'
          }}
        </p>
      </div>

      <div class="flex-1" />

      <div
        class="glass-deep space-y-4 p-4 text-elevated-strong"
        :style="{ backdropFilter: 'blur(1px)' }"
      >
        <div v-if="!isLoopTrack" class="space-y-2">
          <div
            class="relative h-2 w-full cursor-pointer overflow-hidden rounded-full border border-white/75"
            ref="progressRef"
            @click="onProgressClick"
          >
            <div
              class="h-full rounded-full bg-gradient-to-r from-primary-ui via-cyan-400 to-emerald-400 transition-all duration-300"
              :style="{ width: `${progressPercent}%` }"
            />
          </div>
          <div class="flex items-center justify-between text-xs text-white">
            <span>{{ formatPlaybackTime(displayCurrentTime) }}</span>
            <span>{{ formatPlaybackTime(displayDuration) }}</span>
          </div>
        </div>

        <div class="grid grid-cols-6 items-center gap-3">
          <button
            type="button"
            class="flex h-12 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 opacity-100"
            :class="
              isLoopTrack
                ? 'cursor-not-allowed opacity-50 hover:bg-white/10'
                : ''
            "
            :disabled="isLoopTrack"
            @click="handleRepeat"
          >
            <IconRepeat
              :class="['h-5 w-5', isRepeating ? 'text-primary-ui' : '']"
            />
          </button>
          <button
            type="button"
            class="flex h-12 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 opacity-100"
            @click="playPrev"
          >
            <IconSkipBack class="h-5 w-5" />
          </button>
          <button
            type="button"
            class="flex h-12 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 opacity-100"
            @click="seekBy(-15)"
          >
            <IconUndo2 class="h-5 w-5" />
          </button>
          <button
            type="button"
            class="flex h-14 items-center justify-center rounded-full bg-primary/80 text-primary-foreground shadow-lg transition hover:bg-primary disabled:cursor-not-allowed disabled:opacity-70 opacity-100"
            :class="{ 'opacity-80': isBuffering }"
            :disabled="isBuffering"
            :aria-busy="isBuffering"
            @click="togglePlay"
          >
            <svg
              v-if="isBuffering"
              class="h-6 w-6 animate-spin"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <IconPause v-else-if="isActive && isPlaying" class="h-6 w-6" />
            <IconPlay v-else class="h-6 w-6" />
          </button>
          <button
            type="button"
            class="flex h-12 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 opacity-100"
            @click="seekBy(15)"
          >
            <IconRedo2 class="h-5 w-5" />
          </button>
          <button
            type="button"
            class="flex h-12 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 opacity-100"
            @click="playNext"
          >
            <IconSkipForward class="h-5 w-5" />
          </button>
        </div>

        <div class="flex flex-wrap items-center gap-2 text-xs text-white">
          <div class="flex items-center gap-2">
            <div class="flex items-center gap-2">
              <span class="text-white">Таймер:</span>
              <TimePicker
                v-model:model-value="timerPickerValue"
                label=""
                @update:model-value="(val) => applyTimer(val)"
              >
                <template #trigger="{ formattedTime }">
                  <button
                    type="button"
                    class="rounded-full border px-3 py-1 transition"
                    :class="
                      isTimerEnabled
                        ? 'border-white/30 bg-white/15 text-white shadow-sm'
                        : 'border-white/15 bg-white/5 text-white hover:border-white/30 hover:text-white'
                    "
                  >
                    <span>{{ timerTriggerLabel }}</span>
                  </button>
                </template>
              </TimePicker>
              <span class="text-white">
                {{ timerRemainingLabel }}
              </span>
            </div>
          </div>

          <button
            type="button"
            class="rounded-full px-3 py-1 transition ml-auto"
            @click="toggleFavorite"
          >
            <IconHeart
              class="h-5 w-5"
              :class="
                track?.isFavorite
                  ? 'text-red-500 [&>path]:fill-current [&>path]:stroke-current'
                  : ' [&>path]:fill-none [&>path]:stroke-current'
              "
            />
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="error"
      class="absolute inset-0 z-20 flex items-center justify-center bg-black/70 px-4 backdrop-blur"
    >
      <StateBlock state="error">
        <p class="text-sm text-center text-white">{{ error }}</p>
      </StateBlock>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import StateBlock from '@/app/components/StateBlock.vue';
import { Badge } from '@/app/components/ui/shadcn/badge';
import TimePicker from '@/app/components/TimePicker.vue';
import PageHeader from '@/app/components/PageHeader.vue';
import IconHeart from '~icons/lucide/heart';
import IconPlay from '~icons/lucide/play';
import IconPause from '~icons/lucide/pause';
import IconSkipBack from '~icons/lucide/skip-back';
import IconUndo2 from '~icons/lucide/undo-2';
import IconRedo2 from '~icons/lucide/redo-2';
import IconSkipForward from '~icons/lucide/skip-forward';
import IconRepeat from '~icons/lucide/repeat';
import { useMeditationsStore } from '@/app/stores/meditations';
import { useMeditationPlayer } from '@/app/composables/useMeditationPlayer';
import {
  isMeditationTopicKey,
  MEDITATION_TOPICS,
} from '@/shared/constants/meditations';
import type {
  MeditationTopicKey,
  MeditationTrackDto,
} from '@/shared/dto/meditations';

const props = defineProps<{
  trackId: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const route = useRoute();
const router = useRouter();
const meditationsStore = useMeditationsStore();

const track = ref<MeditationTrackDto | null>(null);
const error = ref<string | null>(null);
const progressRef = ref<HTMLElement | null>(null);

const {
  currentTrack,
  isPlaying,
  isBuffering,
  isRepeating,
  currentTime,
  duration,
  timerRemainingMs,
  preferredTimerMinutes,
  queueIds,
  queueKey,
  toggle,
  play,
  pause,
  stop,
  setTimer,
  setPreferredTimer,
  seekBy,
  seekTo,
  toggleRepeat,
  acknowledgeSession,
} = useMeditationPlayer();

const timerPickerValue = computed({
  get: () => preferredTimerMinutes.value ?? 0,
  set: (value) => applyTimer(value),
});

const isActive = computed(() => currentTrack.value?.id === track.value?.id);
const isLoopTrack = computed(() => Boolean(track.value?.isLoop));

const displayCurrentTime = computed(() =>
  isActive.value ? currentTime.value : 0
);
const displayDuration = computed(() => (isActive.value ? duration.value : 0));

const progressPercent = computed(() => {
  if (!displayDuration.value) return 0;
  return Math.min(
    100,
    (displayCurrentTime.value / displayDuration.value) * 100
  );
});

const timerRemainingLabel = computed(() => {
  if (!isActive.value || !timerRemainingMs.value) return '';
  const totalSeconds = Math.ceil(timerRemainingMs.value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
});

const isTimerEnabled = computed(() => preferredTimerMinutes.value !== null);

const timerTriggerLabel = computed(() => {
  if (preferredTimerMinutes.value !== null) {
    return `${preferredTimerMinutes.value} мин`;
  }
  return 'Без таймера';
});

function goBack() {
  emit('close');
}

function topicLabel(key: MeditationTopicKey) {
  return MEDITATION_TOPICS.find((topic) => topic.key === key)?.name || 'Тема';
}

const contextTopicKey = computed<MeditationTopicKey | null>(() => {
  // Берём контекст секции (queueKey) или query, чтобы мульти-треки показывали правильную тему.
  const queueValue = queueKey.value;
  if (queueValue && isMeditationTopicKey(queueValue)) {
    return queueValue;
  }

  const rawQueryTopic = route.query.topic;
  const queryValue = Array.isArray(rawQueryTopic)
    ? rawQueryTopic[0]
    : rawQueryTopic;
  if (typeof queryValue === 'string') {
    const normalized = queryValue.trim();
    if (normalized && isMeditationTopicKey(normalized)) {
      return normalized;
    }
  }

  return track.value?.topicKey || null;
});

const topicName = computed(() => {
  const key = contextTopicKey.value;
  return key ? topicLabel(key) : 'Медитация';
});

function formatPlaybackTime(value: number) {
  if (!value || !Number.isFinite(value)) return '0:00';
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function applyTimer(value: number | null) {
  // 00:00 или пустое значение = таймер выключен.
  const safeValue = Number.isFinite(value) ? (value as number) : 0;
  const clamped = Math.max(0, Math.floor(safeValue));
  const normalized = clamped > 0 ? clamped : null;
  setPreferredTimer(normalized);
  if (isActive.value) {
    setTimer(normalized);
  }
}

function togglePlay() {
  if (!track.value) return;
  // Если играет другой трек, сразу запускаем текущий, а не ставим на паузу глобальный плеер.
  if (!isActive.value) {
    void play(track.value, preferredTimerMinutes.value);
    return;
  }
  if (isPlaying.value) {
    void pause();
  } else {
    void play(track.value, preferredTimerMinutes.value);
  }
}

function trackTopics(source?: MeditationTrackDto | null): MeditationTopicKey[] {
  if (!source) return [];
  const topics = new Set<MeditationTopicKey>();
  if (source.topicKey) topics.add(source.topicKey);
  if (source.topicKeys?.length) {
    source.topicKeys.forEach((key) => topics.add(key));
  }
  return Array.from(topics);
}

function resolveQueuePool(): MeditationTrackDto[] {
  if (!track.value) return [];
  const ids = queueIds.value;
  if (!ids.length) return [];
  if (!ids.includes(track.value.id)) return [];
  // Собираем в порядке очереди, пропуская отсутствующие элементы.
  return ids
    .map((id) => meditationsStore.byId(id))
    .filter((item): item is MeditationTrackDto => Boolean(item));
}

function resolveTopicPool(): MeditationTrackDto[] {
  if (!track.value) return [];
  const topics = trackTopics(track.value);
  if (!topics.length) return [];
  return meditationsStore.tracks.filter((item) =>
    trackTopics(item).some((key) => topics.includes(key))
  );
}

function findSiblingTrack(direction: 1 | -1) {
  if (!track.value) return null;
  const queuePool = resolveQueuePool();
  if (queuePool.length) {
    const idx = queuePool.findIndex((item) => item.id === track.value?.id);
    const nextIndex = (idx + direction + queuePool.length) % queuePool.length;
    return queuePool[nextIndex];
  }

  const topicPool = resolveTopicPool();
  const fallback = meditationsStore.tracks;
  const pool = topicPool.length ? topicPool : fallback;
  const idx = pool.findIndex((item) => item.id === track.value?.id);
  if (!pool.length) return null;
  const nextIndex = (idx + direction + pool.length) % pool.length;
  return pool[nextIndex];
}

async function replaceTrackQuery(nextTrack: MeditationTrackDto) {
  const nextQuery = {
    ...route.query,
    trackId: nextTrack.id,
    title: nextTrack.title,
  };
  // Обновляем query без перехода на отдельную страницу.
  await router.replace({ path: '/meditations', query: nextQuery });
}

async function changeTrack(direction: 1 | -1) {
  if (!track.value) return;
  const target = findSiblingTrack(direction);
  if (!target) return;

  // Учитываем буферизацию, чтобы быстрые клики не сбивали автоплей.
  const shouldAutoplay = isPlaying.value || isBuffering.value;
  track.value = target;

  await replaceTrackQuery(target);

  // Если воспроизведение было остановлено, не запускаем новый трек.
  if (!shouldAutoplay) {
    await stop(false);
    return;
  }

  // Автовоспроизведение, если уже играло.
  await play(target, preferredTimerMinutes.value);
}

function playNext() {
  void changeTrack(1);
}

function playPrev() {
  void changeTrack(-1);
}

function onProgressClick(event: MouseEvent) {
  if (!isActive.value || !progressRef.value || !displayDuration.value) return;
  const rect = progressRef.value.getBoundingClientRect();
  const percent = Math.min(
    Math.max(0, (event.clientX - rect.left) / rect.width),
    1
  );
  seekTo(displayDuration.value * percent);
}

function handleRepeat() {
  // Если трек бесконечный, кнопка повторения бессмысленна.
  if (isLoopTrack.value) return;
  toggleRepeat();
}

function toggleFavorite() {
  if (!track.value) return;
  meditationsStore.toggleFavorite(track.value.id);
}

async function loadTrack(nextId: string) {
  const trimmedId = nextId.trim();
  if (!trimmedId) return;
  if (track.value?.id === trimmedId) return;

  try {
    error.value = null;
    acknowledgeSession();
    track.value = await meditationsStore.fetchTrack(trimmedId);
    if (
      track.value &&
      !(isActive.value && (isPlaying.value || isBuffering.value))
    ) {
      // Автостарт при входе на страницу, если трек ещё не играет.
      void play(track.value, preferredTimerMinutes.value);
    }
  } catch (err: any) {
    error.value = err?.message || 'Не удалось загрузить медитацию';
  }
}

watch(
  () => props.trackId,
  async (value) => {
    if (!value) return;
    await loadTrack(value);
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  if (isActive.value && !isPlaying.value) {
    void stop(false);
  }
});
</script>
