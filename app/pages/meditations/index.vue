<template>
  <div
    class="xs:space-y-3 space-y-1 relative h-full overflow-y-auto rounded-lg"
    :class="selectedTrackId ? '' : 'pb-[100px]'"
  >
    <MeditationDetailView
      v-if="selectedTrackId"
      :track-id="selectedTrackId"
      :locked="!meditationsAccess.available"
      :required-plan="normalizedMeditationsRequiredPlan"
      @close="closeDetail"
      @locked-action="openPaywall('meditations.library.full')"
      @practice-start="onMeditationPracticeStart"
      @practice-pause="onMeditationPracticePause"
      @practice-stop="onMeditationPracticeStop"
    />

    <template v-else>
      <PageHeader
        title="🧘‍♀️&nbsp;Медитации"
        :show-back-button="true"
        @go-back="goBack"
      />

      <Skeleton
        v-if="loaders.isSkeletonLoading"
        type="practice-page"
        :count="5"
        :with-wrapper="false"
        class="glass-deep p-4"
      />

      <StateBlock v-else-if="meditationsStore.error" state="error" class="px-4">
        <p class="text-sm text-center">{{ meditationsStore.error }}</p>
      </StateBlock>

      <div v-else class="glass-deep">
        <MeditationSection
          v-for="(section, index) in visibleSections"
          :key="section.key"
          :title="section.title"
          :subtitle="section.subtitle"
          :emoji="section.emoji"
          :tracks="section.tracks"
          :active-id="currentTrack?.id || null"
          :section-topic-key="
            section.key !== 'all' && section.key !== 'favorites'
              ? (section.key as MeditationTopicKey)
              : undefined
          "
          :locked="!meditationsAccess.available"
          :required-plan="normalizedMeditationsRequiredPlan"
          :class="!wasSkeletonShown ? 'animate-slide-up' : ''"
          :style="
            !wasSkeletonShown
              ? `animation-delay: ${index * 0.05}s; animation-fill-mode: both`
              : ''
          "
          @open="openTrack($event, section.key, section.tracks)"
          @favorite="toggleFavorite"
          @view-all="openViewAll(section.key)"
          @locked-action="openPaywall('meditations.library.full')"
        />
      </div>

      <Dialog v-model:open="dialogOpen">
        <DialogContent class="glass-deep max-w-3xl text-white">
          <DialogHeader>
            <DialogTitle>{{ dialogTitle }}</DialogTitle>
            <DialogDescription class="text-white/70">
              Полный список треков раздела.
            </DialogDescription>
          </DialogHeader>
          <div class="mt-4 grid gap-3 md:grid-cols-2">
            <button
              v-for="track in dialogTracks"
              :key="track.id"
              type="button"
              class="group relative flex w-full items-center gap-3 rounded-2xl bg-white/5 p-3 text-left transition hover:bg-white/10"
              @click="
                openTrack(track.id, dialogTopicKey || 'all', dialogTracks)
              "
            >
              <span
                v-if="!meditationsAccess.available"
                class="absolute right-2 top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-black/45 text-xs leading-none"
              >
                {{ getPlanBadgeEmoji(meditationsAccess.requiredPlan) }}
              </span>
              <div class="relative h-16 w-16 overflow-hidden rounded-2xl">
                <div
                  v-if="!track.coverPath"
                  class="absolute inset-0 bg-gradient-to-br"
                  :class="topicGradient(track.topicKey)"
                />
                <img
                  v-else
                  :src="resolveMediaUrl(track.coverPath)"
                  :alt="track.title"
                  class="h-full w-full object-cover transition group-hover:scale-105"
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-xs text-white/60">
                  {{ topicLabel(track.topicKey) }}
                </p>
                <p class="truncate text-sm font-semibold text-white">
                  {{ track.title }}
                </p>
                <p class="line-clamp-2 text-xs text-white/70">
                  {{ track.description || 'Мягкий фон для паузы' }}
                </p>
              </div>
              <div class="text-[11px] text-white/60">
                {{ formatDuration(track.durationSeconds) }}
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </template>

    <FeaturePaywallModal
      v-model:open="paywallOpen"
      :feature-key="paywallFeatureKey"
      :required-plan="paywallAccess?.requiredPlan || null"
      :paywall="paywallAccess?.paywall || null"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { formatInTimeZone } from 'date-fns-tz';
import PageHeader from '@/app/components/PageHeader.vue';
import StateBlock from '@/app/components/StateBlock.vue';
import Skeleton from '@/app/components/ui/Skeleton.vue';
import MeditationSection from '@/app/components/meditations/MeditationSection.vue';
import MeditationDetailView from '@/app/components/meditations/MeditationDetailView.vue';
import { useMeditationsStore } from '@/app/stores/meditations';
import { useLoadersStore } from '@/app/stores/loaders';
import { useMeditationPlayer } from '@/app/composables/useMeditationPlayer';
import { useFreeTimedPracticeRecovery } from '@/app/composables/useFreeTimedPracticeRecovery';
import { MEDITATION_TOPICS } from '@/shared/constants/meditations';
import { MEDITATION_TOPIC_GRADIENTS } from '@/app/lib/meditations';
import { resolveMediaUrl } from '@/app/utils/media';
import FeaturePaywallModal from '@/app/components/subscription/FeaturePaywallModal.vue';
import type {
  MeditationTopicKey,
  MeditationTrackDto,
} from '@/shared/dto/meditations';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { useEntitlements } from '@/app/composables/useEntitlements';

const route = useRoute();
const router = useRouter();
const meditationsStore = useMeditationsStore();
const loaders = useLoadersStore();
const { currentTrack, setQueue, sessionEnded } = useMeditationPlayer();
const freeTimedRecovery = useFreeTimedPracticeRecovery();
const lastAwardedMeditationKey = ref<string | null>(null);
const activeMeditationPractice = ref<MeditationPracticeStartPayload | null>(
  null
);

type MeditationPracticeStartPayload = {
  trackId: string;
  requiredSeconds: number;
};

function formatLocalDateKey(date = new Date()) {
  return [
    String(date.getFullYear()),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function getMeditationSourceId(trackId: string) {
  return `meditation:${trackId}:${formatLocalDateKey()}`;
}

function buildMeditationRecoveryStart(payload: MeditationPracticeStartPayload) {
  return {
    type: 'meditation',
    source: 'meditation_completed' as const,
    sourceId: getMeditationSourceId(payload.trackId),
    requiredSeconds: payload.requiredSeconds,
  };
}

function onMeditationPracticeStart(payload: MeditationPracticeStartPayload) {
  activeMeditationPractice.value = payload;
  void freeTimedRecovery.start(buildMeditationRecoveryStart(payload));
}

function onMeditationPracticePause() {
  void freeTimedRecovery.pause();
}

function onMeditationPracticeStop() {
  activeMeditationPractice.value = null;
  void freeTimedRecovery.stop();
}

/**
 * Завершение медитации = 1 капля (свободные практики, rate-limit 3/день).
 * См. retention/retention_long_term_strategy.md
 *
 * `sessionEnded` становится true только когда трек реально доигрался
 * (`onTimerFinished` или onended). `lastAwardedMeditationKey` защищает от
 * двойного начисления внутри одного "сессионного" завершения — composable
 * глобальный, watch может срабатывать дважды на быстрых переходах.
 */
watch(
  [sessionEnded, currentTrack],
  ([ended, track]) => {
    if (!ended) return;
    const activeRecord = freeTimedRecovery.activeRecord.value;
    const payload =
      activeMeditationPractice.value ??
      (track?.id
        ? {
            trackId: track.id,
            requiredSeconds: activeRecord?.requiredSeconds ?? 1,
          }
        : null);
    const key =
      activeRecord?.sourceId ||
      (payload ? buildMeditationRecoveryStart(payload).sourceId : null);
    if (!key) return;
    if (lastAwardedMeditationKey.value === key) return;
    lastAwardedMeditationKey.value = key;
    activeMeditationPractice.value = null;
    if (activeRecord) {
      void freeTimedRecovery.complete();
      return;
    }
    if (payload) {
      void freeTimedRecovery.complete(buildMeditationRecoveryStart(payload));
    }
  },
  { immediate: false }
);
const { getFeatureAccess } = useEntitlements();

const wasSkeletonShown = ref(false);
const paywallOpen = ref(false);
const paywallFeatureKey = ref<string | null>(null);

const meditationsAccess = computed(() =>
  getFeatureAccess('meditations.library.full')
);
const normalizedMeditationsRequiredPlan = computed(() =>
  meditationsAccess.value.requiredPlan === 'premium' ? 'premium' : 'pro'
);
const paywallAccess = computed(() =>
  paywallFeatureKey.value ? getFeatureAccess(paywallFeatureKey.value) : null
);

type SectionKey = MeditationTopicKey | 'favorites' | 'all';
type Section = {
  key: SectionKey;
  title: string;
  subtitle: string;
  tracks: MeditationTrackDto[];
  emoji?: string;
};

const dialogOpen = ref(false);
const dialogTopicKey = ref<SectionKey | null>(null);

type TopicMetaLite = {
  key: string;
  name: string;
  subtitle?: string;
  emoji?: string;
};

const TOPIC_META: TopicMetaLite[] =
  (MEDITATION_TOPICS as unknown as TopicMetaLite[]) || [];

// Ключи тем, чтобы валидировать входящие query-параметры.
const TOPIC_KEYS = new Set(TOPIC_META.map((topic) => topic.key));

const TOPIC_SECTIONS: BaseSection[] = [];

TOPIC_META.forEach((topic) => {
  TOPIC_SECTIONS.push({
    key: topic.key as SectionKey,
    name: topic.name,
    subtitle: topic.subtitle || topic.name,
    emoji: topic.emoji,
  });
});

const topicsMap = computed(() =>
  meditationsStore.topics.length ? meditationsStore.topics : TOPIC_META
);

type BaseSection = {
  key: SectionKey;
  name: string;
  subtitle?: string;
  emoji?: string;
};

const BASE_SECTIONS: BaseSection[] = [
  {
    key: 'all',
    name: 'Все',
    subtitle: 'Полный каталог медитаций',
    emoji: '✨',
  },
  {
    key: 'favorites',
    name: 'Избранное',
    subtitle: 'Твои сохранённые треки',
    emoji: '💜',
  },
  ...TOPIC_SECTIONS,
];

function trackTopics(track: MeditationTrackDto): MeditationTopicKey[] {
  const topics = new Set<MeditationTopicKey>();
  if (track.topicKey) {
    topics.add(track.topicKey);
  }
  if (track.topicKeys?.length) {
    track.topicKeys.forEach((key) => topics.add(key));
  }
  return Array.from(topics);
}

const sections = computed<Section[]>(() => {
  const tracks = meditationsStore.tracks;

  return BASE_SECTIONS.map((section) => {
    const sectionTracks =
      section.key === 'all'
        ? tracks
        : section.key === 'favorites'
          ? tracks.filter((t) => t.isFavorite)
          : tracks.filter((t) =>
              trackTopics(t).includes(section.key as MeditationTopicKey)
            );

    return {
      key: section.key,
      title: section.name,
      subtitle: section.subtitle || section.name,
      emoji: section.emoji,
      tracks: sectionTracks,
    };
  });
});

const visibleSections = computed(() =>
  sections.value.filter((section) => section.tracks.length > 0)
);

const dialogTracks = computed<MeditationTrackDto[]>(() => {
  if (!dialogTopicKey.value) return [];
  if (dialogTopicKey.value === 'favorites') {
    return meditationsStore.tracks.filter((t) => t.isFavorite);
  }
  if (dialogTopicKey.value === 'all') {
    return meditationsStore.tracks;
  }
  return meditationsStore.tracks.filter((t) =>
    trackTopics(t).includes(dialogTopicKey.value as MeditationTopicKey)
  );
});

const dialogTitle = computed(() => {
  if (dialogTopicKey.value === 'favorites') return 'Избранное';
  if (dialogTopicKey.value === 'all') return 'Все медитации';
  const topic = topicsMap.value.find((t) => t.key === dialogTopicKey.value);
  return topic?.name || 'Подборка';
});

const selectedTrackId = computed(() => {
  const raw = route.query.trackId;
  if (Array.isArray(raw)) return raw[0]?.trim() || '';
  if (typeof raw === 'string') return raw.trim();
  return '';
});

const selectedTopicKey = computed<MeditationTopicKey | null>(() => {
  const raw = route.query.topic;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized || !TOPIC_KEYS.has(normalized)) return null;
  return normalized as MeditationTopicKey;
});

const autoOpenTopicKey = ref<MeditationTopicKey | null>(null);

function goBack() {
  navigateTo('/');
}

onMounted(async () => {
  await meditationsStore.fetchAll();
});

watch(
  () => meditationsAccess.value.available,
  async (available, prev) => {
    if (available && !prev && meditationsStore.error) {
      await meditationsStore.fetchAll(true);
    }
  }
);

function openPaywall(featureKey: string) {
  paywallFeatureKey.value = featureKey;
  paywallOpen.value = true;
}

watch(
  () => meditationsStore.error,
  (value) => {
    if (value) {
      dialogOpen.value = false;
    }
  }
);

watch(
  () => loaders.isSkeletonLoading,
  (isLoading) => {
    if (isLoading) {
      wasSkeletonShown.value = true;
    }
  },
  { immediate: true }
);

watch(
  () => selectedTrackId.value,
  async (value) => {
    if (value) {
      dialogOpen.value = false;
    }
  }
);

watch(
  [
    () => selectedTopicKey.value,
    () => selectedTrackId.value,
    () => meditationsStore.tracks,
  ],
  async ([topicKey, trackId, tracks]) => {
    if (!topicKey || trackId) return;
    if (!tracks.length) return;
    if (autoOpenTopicKey.value === topicKey) return;

    // Автооткрытие первой медитации выбранной темы из query.
    const topicTracks = tracks.filter((track) =>
      trackTopics(track).includes(topicKey)
    );
    autoOpenTopicKey.value = topicKey;

    const firstTrack = topicTracks.at(0);
    // Защищаемся от пустого списка перед обращением к первому элементу.
    if (!firstTrack) return;
    await openTrack(firstTrack.id, topicKey, topicTracks);
  },
  { immediate: true }
);

function topicLabel(key: MeditationTopicKey) {
  return topicsMap.value.find((topic) => topic.key === key)?.name || 'Тема';
}

function topicGradient(key: MeditationTopicKey) {
  return (
    MEDITATION_TOPIC_GRADIENTS[key] ||
    'from-slate-500 via-indigo-500 to-blue-600'
  );
}

function formatDuration(durationSeconds?: number | null) {
  if (!durationSeconds) return '∞';
  const safeSeconds = Math.max(0, Math.floor(durationSeconds));
  const formatMask = safeSeconds >= 3600 ? 'H:mm:ss' : 'mm:ss';
  // Форматируем в UTC, чтобы не зависеть от часового пояса устройства.
  return formatInTimeZone(new Date(safeSeconds * 1000), 'UTC', formatMask);
}

async function openTrack(
  trackId: string,
  sectionKey?: SectionKey,
  list?: MeditationTrackDto[]
) {
  if (list?.length) {
    setQueue(
      list.map((t) => t.id),
      sectionKey ?? null
    );
  } else if (sectionKey) {
    const section = sections.value.find((item) => item.key === sectionKey);
    if (section?.tracks?.length) {
      setQueue(
        section.tracks.map((t) => t.id),
        sectionKey
      );
    }
  }

  const targetTrack =
    list?.find((item) => item.id === trackId) ||
    meditationsStore.byId(trackId) ||
    null;
  const nextQuery = {
    ...route.query,
    trackId,
  } as Record<string, string | string[]>;

  if (targetTrack?.title) {
    nextQuery.title = targetTrack.title;
  } else {
    delete nextQuery.title;
  }

  // Открываем детальный плеер через query, без перехода на отдельную страницу.
  await router.push({ path: '/meditations', query: nextQuery });
}

async function closeDetail() {
  const nextQuery = { ...route.query } as Record<string, string | string[]>;
  delete nextQuery.trackId;
  delete nextQuery.title;
  // Возвращаемся к каталогу, не меняя страницу.
  await router.replace({ path: '/meditations', query: nextQuery });
}

function toggleFavorite(trackId: string) {
  if (!meditationsAccess.value.available) {
    openPaywall('meditations.library.full');
    return;
  }
  meditationsStore.toggleFavorite(trackId);
}

function openViewAll(key: SectionKey) {
  dialogTopicKey.value = key;
  dialogOpen.value = true;
}

function getPlanBadgeEmoji(plan: string) {
  return plan === 'premium' ? '💎' : '⭐';
}
</script>
