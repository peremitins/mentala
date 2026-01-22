<template>
  <div class="h-dvh w-full flex flex-col min-h-dvh p-2 overflow-hidden">
    <Transition name="scene-bg-fade" mode="out-in">
      <div
        v-if="showSceneBackground && sceneBackground"
        :key="sceneBackground"
        class="pointer-events-none fixed inset-0 z-[1] overflow-hidden"
        :class="{ 'scene-bg-static': !sceneSettings.animateBackground }"
        :style="{ opacity: uiSettings.auroraOpacity }"
      >
        <div class="meditation-bg-pan h-full w-full">
          <img
            :src="sceneBackground"
            alt=""
            aria-hidden="true"
            class="meditation-bg-media h-full w-full"
            loading="lazy"
            decoding="async"
          />
        </div>
      </div>
    </Transition>
    <div
      v-if="isMeditationDetail && detailBackground"
      class="pointer-events-none fixed inset-0 z-[2] overflow-hidden"
    >
      <div class="meditation-bg-pan h-full w-full">
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
    <div class="relative z-10 flex min-h-0 flex-1 flex-col">
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
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useMediaQuery, useWindowSize } from '@vueuse/core';
import BottomNav from '@/app/components/BottomNav.vue';
import MiniMeditationPlayer from '@/app/components/meditations/MiniMeditationPlayer.vue';
import { useMeditationPlayer } from '@/app/composables/useMeditationPlayer';
import { useMeditationsStore } from '@/app/stores/meditations';
import { useSceneSettingsStore } from '@/app/stores/sceneSettings';
import { useUiSettingsStore } from '@/app/stores/uiSettings';
import { useSceneAudio } from '@/app/composables/useSceneAudio';
import { findSceneTrack } from '@/app/lib/sceneSelectionCatalog';
import { resolveMediaUrl } from '@/app/utils/media';
import { useAuthStore } from '@/app/stores/auth';

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
const auth = useAuthStore();
const sceneSettings = useSceneSettingsStore();
const uiSettings = useUiSettingsStore();
const sceneAudio = useSceneAudio();
const canPlaySceneAudio = computed(() => {
  // Во время logout фон не должен стартовать заново.
  return auth.isLoggedIn && !auth.isLoggingOut;
});

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

const currentScene = computed(
  () => findSceneTrack(sceneSettings.sceneId) || null
);

const sceneBackground = computed(() => {
  if (!currentScene.value) return '';
  const ordered = orientationVariants(
    currentScene.value.backgroundPath || '',
    isPortraitMode.value
  );
  const chosen = ordered.find(Boolean);
  return resolveMediaUrl(chosen || '');
});

const showSceneBackground = computed(() => {
  return (
    !isMeditationDetail.value &&
    !isBreathPracticePage.value &&
    Boolean(sceneBackground.value)
  );
});

const isMeditationAudioActive = computed(() => Boolean(currentTrack.value));
const isBreathPracticePage = computed(() => {
  const path = route.path || '';
  // Исключаем страницу создания кастомной практики, чтобы показывать фон обоев
  if (path === '/breath-practices/custom') {
    return false;
  }
  // Глушим фон только на детальной практике, например /breath-practices/4-7-8
  return path.startsWith('/breath-practices/');
});

const shouldMuteSceneAudio = computed(() => {
  // Пока открыт трек медитации, активен мини‑плеер или открыты дыхательные практики — фон сцены молчит.
  return (
    isMeditationDetail.value ||
    isMeditationAudioActive.value ||
    isBreathPracticePage.value
  );
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

onMounted(async () => {
  await sceneSettings.ensureLoaded();
  sceneAudio.setVolume(sceneSettings.volume / 100);
  sceneAudio.setBackgroundPlayMinutes(sceneSettings.backgroundPlayMinutes);
  await syncSceneAudioState();
});

watch(
  () => sceneSettings.volume,
  (value) => {
    sceneAudio.setVolume(value / 100);
  }
);

watch(
  () => sceneSettings.backgroundPlayMinutes,
  (value) => {
    sceneAudio.setBackgroundPlayMinutes(value);
  }
);

async function syncSceneAudioState() {
  // На неавторизованных экранах фон всегда выключен.
  if (!canPlaySceneAudio.value) {
    await sceneAudio.stop(false);
    return;
  }
  await sceneSettings.ensureLoaded();
  if (!currentScene.value) return;
  // Обновляем текущую сцену, чтобы не было рассинхрона при смене.
  await sceneAudio.setScene(currentScene.value);
  // Пока открыт трек медитации или активен мини‑плеер — фоновые звуки выключены.
  if (shouldMuteSceneAudio.value) {
    await sceneAudio.suspend();
    return;
  }
  await sceneAudio.resume();
  if (!sceneAudio.isPlaying.value) {
    await sceneAudio.play(currentScene.value);
  }
}

watch(
  [
    () => shouldMuteSceneAudio.value,
    () => canPlaySceneAudio.value,
    () => currentScene.value?.id,
  ],
  () => {
    void syncSceneAudioState();
  },
  { immediate: true }
);
</script>

<style scoped>
.scene-bg-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(10, 10, 20, 0.35) 0%,
    rgba(10, 10, 20, 0.55) 100%
  );
}

.scene-bg-fade-enter-active,
.scene-bg-fade-leave-active {
  transition: opacity 0.6s ease;
}

.scene-bg-fade-enter-from,
.scene-bg-fade-leave-to {
  opacity: 0;
}

.scene-bg-static .meditation-bg-pan {
  animation: none;
  transform: none;
}

.scene-bg-static .meditation-bg-media {
  transform: none;
}

.meditation-bg-media {
  object-fit: cover;
  /* Держим запас по краям, чтобы при панорамировании не вскрывались полосы. */
  transform: scale(1.12);
  transform-origin: center;
  will-change: transform;
  background: #000;
}

.meditation-bg-pan {
  position: absolute;
  inset: -10%;
  width: 120%;
  height: 120%;
  animation: meditation-pan-diagonal 70s linear infinite;
  will-change: transform;
  overflow: hidden;
  background: #000;
}

/* Плавная траектория без остановок и резких углов. */
@keyframes meditation-pan-diagonal {
  0% {
    transform: scale(1.11) translate3d(0px, 0px, 0);
  }
  50% {
    transform: scale(1.13) translate3d(44px, 40px, 0);
  }
  100% {
    transform: scale(1.11) translate3d(0px, 0px, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .meditation-bg-pan {
    animation: none;
    transform: none;
  }
}
</style>
