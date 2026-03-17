<template>
  <div>
    <div
      v-if="showAurora"
      class="aurora-outer"
      :style="{ opacity: auroraOpacity }"
    ></div>
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
      theme="light"
      rich-colors
      position="top-right"
      :expand="false"
      close-button
      close-button-position="top-right"
    />
    <ClientOnly>
      <GlobalNavigationPaywall />
    </ClientOnly>

    <!-- Глобальный PageLoader -->
    <!-- <Transition name="fade">
      <div
        v-if="loaders.isPageLoading"
        class="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none"
      >
        <PageLoader :size="8" />
      </div>
    </Transition> -->
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, watch } from 'vue';
import { Toaster } from 'vue-sonner';
import { useAuthStore } from '@/app/stores/auth';
import { useSceneSettingsStore } from '@/app/stores/sceneSettings';
import { useUiSettingsStore } from '@/app/stores/uiSettings';
import GlobalNavigationPaywall from '@/app/components/navigation/GlobalNavigationPaywall.vue';
import {
  DEFAULT_SCENE_ID,
  findSceneTrack,
} from '@/app/lib/sceneSelectionCatalog';

const auth = useAuthStore();
const sceneSettings = useSceneSettingsStore();
const uiSettings = useUiSettingsStore();

// Aurora остаётся только как глобальный fallback-слой под layout-ами.
const showAurora = computed(() => {
  const scene = findSceneTrack(sceneSettings.sceneId);
  // "Стандартный фон" = нет кастомного изображения, показываем aurora.
  const isStandardBackground =
    sceneSettings.sceneId === 'default' || !scene?.backgroundPath;
  return sceneSettings.sceneId === DEFAULT_SCENE_ID || isStandardBackground;
});

const auroraOpacity = computed(() => uiSettings.auroraOpacity);

onMounted(async () => {
  await Promise.all([
    sceneSettings.ensureLoaded(),
    uiSettings.ensureLoaded(auth.user?.id ?? null),
  ]);
});

watch(
  () => auth.user?.id,
  async (userId) => {
    await uiSettings.loadFromStorage(userId ?? null);
  }
);

watch(
  () => auth.user?.sceneSettings,
  async () => {
    if (!auth.user) return;
    // Следим за сменой пользователя и настройками сцены после авторизации.
    await sceneSettings.loadFromUser();
  }
);
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
