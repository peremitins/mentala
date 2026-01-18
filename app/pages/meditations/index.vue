<template>
  <div class="relative h-full overflow-y-auto space-y-4 pb-[140px]">
    <PageHeader title="🧘‍♀️&nbsp;Медитации" />

    <Skeleton v-if="loaders.isSkeletonLoading" type="list-item" :count="6" />

    <StateBlock v-else-if="meditationsStore.error" state="error" class="px-4">
      <p class="text-sm text-center">{{ meditationsStore.error }}</p>
    </StateBlock>

    <div v-else class="space-y-6">
      <MeditationSection
        v-for="section in visibleSections"
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
        @open="openTrack($event, section.key, section.tracks)"
        @favorite="toggleFavorite"
        @view-all="openViewAll(section.key)"
      />
    </div>

    <Dialog v-model:open="dialogOpen">
      <DialogContent
        class="max-w-3xl bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-950 text-white border-white/10"
      >
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
            class="group flex w-full items-center gap-3 rounded-2xl bg-white/5 p-3 text-left transition hover:bg-white/10"
            @click="openTrack(track.id, dialogTopicKey || 'all', dialogTracks)"
          >
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
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { formatInTimeZone } from 'date-fns-tz';
import PageHeader from '@/app/components/PageHeader.vue';
import StateBlock from '@/app/components/StateBlock.vue';
import Skeleton from '@/app/components/ui/Skeleton.vue';
import MeditationSection from '@/app/components/meditations/MeditationSection.vue';
import { useMeditationsStore } from '@/app/stores/meditations';
import { useLoadersStore } from '@/app/stores/loaders';
import { useMeditationPlayer } from '@/app/composables/useMeditationPlayer';
import { MEDITATION_TOPICS } from '@/shared/constants/meditations';
import type { MeditationTopic } from '@/shared/constants/meditations';
import { MEDITATION_TOPIC_GRADIENTS } from '@/app/lib/meditations';
import { resolveMediaUrl } from '@/app/utils/media';
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

const router = useRouter();
const meditationsStore = useMeditationsStore();
const loaders = useLoadersStore();
const { currentTrack, setQueue } = useMeditationPlayer();

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

onMounted(async () => {
  await meditationsStore.fetchAll();
});

watch(
  () => meditationsStore.error,
  (value) => {
    if (value) {
      dialogOpen.value = false;
    }
  }
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

function openTrack(
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
  router.push(`/meditations/${trackId}`);
}

function toggleFavorite(trackId: string) {
  meditationsStore.toggleFavorite(trackId);
}

function openViewAll(key: SectionKey) {
  dialogTopicKey.value = key;
  dialogOpen.value = true;
}
</script>
