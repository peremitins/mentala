<template>
  <div>
    <div v-if="showAurora" class="aurora-outer"></div>
    <NuxtLoadingIndicator />
    <NuxtLayout>
      <div class="h-full flex flex-col z-0">
        <KeepAlive>
          <NuxtPage />
        </KeepAlive>
      </div>
    </NuxtLayout>
    <NuxtRouteAnnouncer />
    <Toaster
      theme="dark"
      richColors
      position="top-right"
      :expand="false"
      closeButton
      closeButtonPosition="top-right"
    />

    <!-- Глобальный PageLoader -->
    <Transition name="fade">
      <div
        v-if="loaders.isPageLoading"
        class="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none"
      >
        <PageLoader :size="8" />
      </div>
    </Transition>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { Toaster } from 'vue-sonner';
import { useLoadersStore } from '@/app/stores/loaders';
import PageLoader from '@/app/components/ui/PageLoader.vue';
import { useSceneSettingsStore } from '@/app/stores/sceneSettings';
import { DEFAULT_SCENE_ID } from '@/app/lib/sceneSelectionCatalog';

const loaders = useLoadersStore();
const sceneSettings = useSceneSettingsStore();
const route = useRoute();

const isBreathPracticeDetail = computed(() => {
  const path = route.path || '';
  return path.startsWith('/breath-practices/');
});

// Если выбран «стандартный фон» или открыта практика — показываем aurora.
const showAurora = computed(() => {
  return (
    sceneSettings.sceneId === DEFAULT_SCENE_ID || isBreathPracticeDetail.value
  );
});

onMounted(async () => {
  await sceneSettings.ensureLoaded();
});
</script>

<style lang="scss" scoped>
.aurora-outer {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;

  /* Тёплый тёмный базовый тон + мягкая aurora (без «игрового» пятна) */
  background: radial-gradient(
      1200px 900px at 15% 10%,
      rgba(155, 120, 255, 0.14),
      transparent 60%
    ),
    radial-gradient(
      1100px 800px at 85% 20%,
      rgba(120, 180, 255, 0.14),
      transparent 62%
    ),
    radial-gradient(
      900px 700px at 55% 85%,
      rgba(210, 150, 255, 0.1),
      transparent 70%
    ),
    linear-gradient(180deg, #1b1b3a 0%, #23235a 55%, #171730 100%);

  /* Лёгкое «дороже/живее», но без кислотности */
  filter: saturate(101%) contrast(102%);

  opacity: 1;
}

/* Слой микрошумa для «тумана» (не влияет на верстку/клики) */
.aurora-outer::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;

  /* SVG-noise через data-uri (лёгкий, без загрузки ассетов) */
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='.35'/%3E%3C/svg%3E");
  background-size: 160px 160px;

  /* Шум должен быть едва заметным */
  opacity: 0.035;
  mix-blend-mode: overlay;
}

/* Едва заметная виньетка — добавляет глубину без «эффектности» */
.aurora-outer::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(
    1200px 900px at 50% 40%,
    transparent 40%,
    rgba(0, 0, 0, 0.35) 100%
  );
  opacity: 0.4;
}
</style>
