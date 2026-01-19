<template>
  <div class="h-dvh w-full flex flex-col min-h-dvh p-2 overflow-hidden">
    <div
      v-if="isMeditationDetail && detailBackground"
      class="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      <div class="meditation-bg-pan-x h-full w-full">
        <div class="meditation-bg-pan-y h-full w-full">
          <img
            :src="detailBackground"
            alt=""
            aria-hidden="true"
            class="meditation-bg-media h-full w-full"
            loading="lazy"
            decoding="async"
          />
        </div>
      </div>
    </div>

    <slot />

    <ClientOnly>
      <MiniMeditationPlayer
        v-if="currentTrack && !isMeditationDetail"
        :track="currentTrack"
        :progress="progressPercent"
        :is-playing="isPlaying"
        :is-buffering="isBuffering"
        @toggle="togglePlayback"
        @stop="stopPlayback"
        @open="openDetail"
      />
    </ClientOnly>
    <BottomNav />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useMediaQuery, useWindowSize } from '@vueuse/core';
import BottomNav from '@/app/components/BottomNav.vue';
import MiniMeditationPlayer from '@/app/components/meditations/MiniMeditationPlayer.vue';
import { useMeditationPlayer } from '@/app/composables/useMeditationPlayer';
import { useMeditationsStore } from '@/app/stores/meditations';
import { resolveMediaUrl } from '@/app/utils/media';

const {
  currentTrack,
  currentTime,
  duration,
  isPlaying,
  isBuffering,
  toggle,
  stop,
} = useMeditationPlayer();
const meditationsStore = useMeditationsStore();
const isPortraitQuery = useMediaQuery('(orientation: portrait)');
const { width, height } = useWindowSize();
const isPortraitMode = computed(() => {
  if (height.value && width.value) {
    return height.value >= width.value;
  }
  return isPortraitQuery.value;
});

const route = useRoute();

const detailTrackId = computed(() => {
  const raw = route.query.trackId;
  if (Array.isArray(raw)) return raw[0]?.trim() || '';
  if (typeof raw === 'string') return raw.trim();
  return '';
});

const isMeditationDetail = computed(() => {
  const path = route.path || '';
  return path.startsWith('/meditations') && Boolean(detailTrackId.value);
});

const routeTrack = computed(() => {
  const id = detailTrackId.value;
  if (!id) return null;
  return meditationsStore.byId(id) || null;
});

function buildVariants(path?: string | null) {
  if (!path) return [];
  const dotIndex = path.lastIndexOf('.');
  if (dotIndex === -1) return [path];
  const name = path.slice(0, dotIndex);
  const ext = path.slice(dotIndex);
  // Поддерживаем только портретные варианты:
  // 1) суффикс -portrait (приоритет)
  // 2) префикс portrait-
  const suffixedPortrait = `${name}-portrait${ext}`;
  const prefixedPortrait = name.replace(/\/([^/]+)$/, '/portrait-$1') + ext;
  const ordered = [suffixedPortrait, prefixedPortrait, path];
  return Array.from(new Set(ordered.filter(Boolean)));
}

function orientationVariants(path?: string | null, portraitFirst = false) {
  const variants = buildVariants(path);
  if (!variants.length) return [];
  const [portrait1, portrait2, base] = [
    variants[0],
    variants[1],
    variants[2] || variants[variants.length - 1],
  ];
  return portraitFirst
    ? [portrait1, portrait2, base].filter(Boolean)
    : [base, portrait1, portrait2].filter(Boolean);
}

const detailBackground = computed(() => {
  const track =
    routeTrack.value ||
    currentTrack.value ||
    (detailTrackId.value ? meditationsStore.byId(detailTrackId.value) : null);

  if (!track) return '';

  const ordered = orientationVariants(
    track.backgroundPath || '',
    isPortraitMode.value
  );

  const chosen = ordered.find(Boolean);
  return resolveMediaUrl(chosen || '');
});

const progressPercent = computed(() => {
  if (!duration.value) return 0;
  return Math.min(100, (currentTime.value / duration.value) * 100);
});

function togglePlayback() {
  if (!currentTrack.value) return;
  toggle(currentTrack.value);
}

function stopPlayback() {
  void stop(false);
}

function openDetail() {
  if (!currentTrack.value) return;
  const nextQuery = {
    ...route.query,
    trackId: currentTrack.value.id,
    title: currentTrack.value.title,
  } as Record<string, string | string[]>;
  void navigateTo({ path: '/meditations', query: nextQuery });
}
</script>

<style scoped>
.meditation-bg-media {
  object-fit: cover;
  /* Держим запас по краям, чтобы при панорамировании не вскрывались полосы. */
  transform: scale(1.12);
  transform-origin: center;
  will-change: transform;
  background: #000;
}

.meditation-bg-pan-x {
  position: absolute;
  inset: -10%;
  width: 120%;
  height: 120%;
  animation: meditation-pan-x 70s linear infinite;
  will-change: transform;
}

.meditation-bg-pan-y {
  position: absolute;
  inset: 0;
  animation: meditation-pan-y 80s linear infinite;
  will-change: transform;
}

/* На всякий случай фиксируем подложку и отсечение краёв. */
.meditation-bg-pan-x,
.meditation-bg-pan-y {
  overflow: hidden;
  background: #000;
}

/* Плавная траектория без остановок и резких углов. */
@keyframes meditation-pan-x {
  0% {
    transform: translate3d(0px, 0, 0);
  }
  8.333% {
    transform: translate3d(14px, 0, 0);
  }
  16.667% {
    transform: translate3d(26px, 0, 0);
  }
  25% {
    transform: translate3d(30px, 0, 0);
  }
  33.333% {
    transform: translate3d(22px, 0, 0);
  }
  41.667% {
    transform: translate3d(6px, 0, 0);
  }
  50% {
    transform: translate3d(-12px, 0, 0);
  }
  58.333% {
    transform: translate3d(-26px, 0, 0);
  }
  66.667% {
    transform: translate3d(-32px, 0, 0);
  }
  75% {
    transform: translate3d(-24px, 0, 0);
  }
  83.333% {
    transform: translate3d(-8px, 0, 0);
  }
  91.667% {
    transform: translate3d(10px, 0, 0);
  }
  100% {
    transform: translate3d(0px, 0, 0);
  }
}

@keyframes meditation-pan-y {
  0% {
    transform: translate3d(0, -22px, 0);
  }
  8.333% {
    transform: translate3d(0, -12px, 0);
  }
  16.667% {
    transform: translate3d(0, 2px, 0);
  }
  25% {
    transform: translate3d(0, 18px, 0);
  }
  33.333% {
    transform: translate3d(0, 30px, 0);
  }
  41.667% {
    transform: translate3d(0, 24px, 0);
  }
  50% {
    transform: translate3d(0, 8px, 0);
  }
  58.333% {
    transform: translate3d(0, -8px, 0);
  }
  66.667% {
    transform: translate3d(0, -22px, 0);
  }
  75% {
    transform: translate3d(0, -30px, 0);
  }
  83.333% {
    transform: translate3d(0, -20px, 0);
  }
  91.667% {
    transform: translate3d(0, -6px, 0);
  }
  100% {
    transform: translate3d(0, -22px, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .meditation-bg-pan-x,
  .meditation-bg-pan-y {
    animation: none;
    transform: none;
  }
}
</style>
