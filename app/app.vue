<template>
  <div>
    <div
      v-if="showAurora"
      class="aurora-outer"
      :style="{ opacity: auroraOpacity }"
    ></div>
    <NuxtLoadingIndicator />
    <NuxtLayout>
      <div class="h-full flex flex-col z-0 justify-center">
        <KeepAlive>
          <NuxtPage />
        </KeepAlive>
      </div>
    </NuxtLayout>
    <ClientOnly>
      <AppLockGate />
    </ClientOnly>
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
    <ClientOnly>
      <AiChatConsentModal />
    </ClientOnly>
    <ClientOnly>
      <ForceUpdateBlocker />
    </ClientOnly>
    <ClientOnly>
      <RealtimeVoiceAmbientFrame />
    </ClientOnly>
    <ClientOnly>
      <AppTourOverlay />
    </ClientOnly>
    <ClientOnly>
      <ReviewPromptModal />
    </ClientOnly>
    <ClientOnly>
      <div
        v-if="isPortraitFallbackActive"
        class="portrait-only-fallback"
        role="dialog"
        aria-live="polite"
        aria-label="Требуется вертикальная ориентация"
      >
        <div class="portrait-only-phone" aria-hidden="true"></div>
        <div class="portrait-only-title">Поверните телефон вертикально</div>
        <p class="portrait-only-text">
          Ментала работает в портретном формате, чтобы сохранить удобный размер
          практик, чата и навигации.
        </p>
      </div>
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
import AppLockGate from '@/app/components/app-lock/AppLockGate.vue';
import GlobalNavigationPaywall from '@/app/components/navigation/GlobalNavigationPaywall.vue';
import ForceUpdateBlocker from '@/app/components/ForceUpdateBlocker.vue';
import AiChatConsentModal from '@/app/components/privacy/AiChatConsentModal.vue';
import RealtimeVoiceAmbientFrame from '@/app/components/realtime/RealtimeVoiceAmbientFrame.vue';
import AppTourOverlay from '@/app/components/app-tour/AppTourOverlay.vue';
import ReviewPromptModal from '@/app/components/reviews/ReviewPromptModal.vue';
import { usePortraitOrientationLock } from '@/app/composables/usePortraitOrientationLock';
import {
  DEFAULT_SCENE_ID,
  findSceneTrack,
} from '@/app/lib/sceneSelectionCatalog';

const auth = useAuthStore();
const sceneSettings = useSceneSettingsStore();
const uiSettings = useUiSettingsStore();
const { isLandscapeFallbackActive: isPortraitFallbackActive } =
  usePortraitOrientationLock();

// Aurora остаётся только как глобальный fallback-слой под layout-ами.
const showAurora = computed(() => {
  const scene = findSceneTrack(sceneSettings.sceneId);
  // "Стандартный фон" = нет кастомного изображения, показываем aurora.
  const isStandardBackground =
    sceneSettings.sceneId === 'default' || !scene?.backgroundPath;
  return sceneSettings.sceneId === DEFAULT_SCENE_ID || isStandardBackground;
});

const auroraOpacity = computed(() => uiSettings.auroraOpacity);

watch(
  () => uiSettings.fontFamily,
  (font) => {
    document.documentElement.style.setProperty(
      '--app-font',
      `'${font}', system-ui, sans-serif`
    );
  },
  { immediate: true }
);

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

:global(html.app-portrait-only-landscape),
:global(body.app-portrait-only-landscape) {
  overflow: hidden;
  overscroll-behavior: none;
}

.portrait-only-fallback {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 24px;
  color: #f8fafc;
  text-align: center;
  background: radial-gradient(
      circle at 50% 20%,
      rgba(45, 212, 191, 0.18),
      transparent 38%
    ),
    linear-gradient(180deg, #09090b 0%, #18181b 100%);
}

.portrait-only-phone {
  width: 42px;
  height: 70px;
  border: 3px solid rgba(248, 250, 252, 0.9);
  border-radius: 12px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28);
}

.portrait-only-title {
  max-width: 360px;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.2;
}

.portrait-only-text {
  max-width: 420px;
  margin: 0;
  color: rgba(248, 250, 252, 0.74);
  font-size: 14px;
  line-height: 1.5;
}
</style>
