<template>
  <div class="h-dvh w-full flex flex-col min-h-dvh p-2 overflow-hidden">
    <!-- <div
      v-if="isMeditationDetail && detailBackground"
      class="pointer-events-none fixed inset-0 z-0 bg-center bg-cover"
      :style="{ backgroundImage: `url(${detailBackground})` }"
    /> -->
    <img
      v-if="isMeditationDetail && detailBackground"
      :src="detailBackground"
      alt=""
      aria-hidden="true"
      class="pointer-events-none fixed inset-0 z-0 h-full w-full object-cover"
      loading="lazy"
      decoding="async"
    />

    <!-- <div class="flex flex-col flex-[1_1_auto] h-dvh"> -->
    <slot />
    <!-- </div> -->
    <ClientOnly>
      <MiniMeditationPlayer
        v-if="currentTrack && !isMeditationDetail"
        :track="currentTrack"
        :progress="progressPercent"
        :is-playing="isPlaying"
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

const { currentTrack, currentTime, duration, isPlaying, toggle, stop } =
  useMeditationPlayer();
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

const isMeditationDetail = computed(() => {
  const path = route.path || '';
  return path.startsWith('/meditations/') && Boolean(route.params?.id);
});

const routeTrack = computed(() => {
  const id = route.params?.id ? String(route.params.id) : '';
  if (!id) return null;
  return meditationsStore.byId(id) || null;
});

function resolveMediaUrl(path?: string | null) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return new URL(path, window.location.origin).toString();
  }
  return path;
}

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
    meditationsStore.byId(String(route.params?.id || '')) ||
    null;

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
  navigateTo(`/meditations/${currentTrack.value.id}`);
}
</script>
