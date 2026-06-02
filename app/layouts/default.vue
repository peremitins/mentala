<template>
  <div
    class="safe-area-layout mobile-compact-type flex h-dvh min-h-dvh w-full flex-col overflow-hidden px-1 pb-0"
  >
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
    <div class="relative z-10 flex min-h-0 flex-1 flex-col rounded-lg">
      <slot />

      <ClientOnly>
        <!-- Глобальный overlay достижений: показывается поверх любой страницы.
             Задержанные достижения (garden_completed) появятся после анимаций сада. -->
        <MilestoneAchievementOverlay
          v-if="currentCelebrationId"
          :show="celebrationVisible"
          :badge-id="currentCelebrationId"
          @closed="onCelebrationClosed"
          @continue="onCelebrationContinue"
        />

        <MiniMeditationPlayer
          v-if="showMiniMeditationPlayer"
          :track="currentTrack"
          :progress="progressPercent"
          :is-playing="isPlaying"
          :is-buffering="isBuffering"
          @toggle="togglePlayback"
          @stop="stopPlayback"
          @open="openDetail"
        />
        <PushRecoveryDialog
          v-if="showPushRecoveryDialog"
          :open="pushRecovery.showRecoveryDialog.value"
          @update:open="
            (val) => {
              if (!val) pushRecovery.dismissRecovery();
            }
          "
          @dismiss="pushRecovery.dismissRecovery()"
          @enable="pushRecovery.attemptRecovery()"
        />
        <!-- Mobile install / app-promo surfaces -->
        <AndroidAppPromoBanner
          :visible="showAndroidAppPromo"
          :variant="mobileAppPromo.androidPromoVariant.value"
          @open-app="handleAndroidAppOpen"
          @open-store="handleGooglePlayOpen"
          @close="handleMobilePromoClose"
        />
        <PwaIosGuide :visible="showIosGuide" @close="handleMobilePromoClose" />
        <!-- In-app модалка про готовый отчёт. Показывается, когда приложение
             активно (foreground) и есть непросмотренный готовый отчёт. -->
        <PendingReportNotificationModal
          :pending="pendingReport.pending.value"
          @dismiss="pendingReport.dismiss"
          @open="handleOpenPendingReport"
        />
      </ClientOnly>
      <BottomNav />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import MilestoneAchievementOverlay from '@/app/components/milestones/MilestoneAchievementOverlay.vue';
import { useMilestoneBadges } from '@/app/composables/useMilestoneBadges';
import { useRoute } from 'vue-router';
import BottomNav from '@/app/components/BottomNav.vue';
import MiniMeditationPlayer from '@/app/components/meditations/MiniMeditationPlayer.vue';
import PushRecoveryDialog from '@/app/components/notifications/PushRecoveryDialog.vue';
import AndroidAppPromoBanner from '@/app/components/pwa/AndroidAppPromoBanner.vue';
import PwaIosGuide from '@/app/components/pwa/PwaIosGuide.vue';
import PendingReportNotificationModal from '@/app/components/garden/PendingReportNotificationModal.vue';
import {
  usePendingReportNotification,
  type PendingReport,
} from '@/app/composables/usePendingReportNotification';
import { useMobileAppPromo } from '@/app/composables/useMobileAppPromo';
import { usePushRecovery } from '@/app/composables/usePushRecovery';
import { useWebPush } from '@/app/composables/useWebPush';
import { useMeditationPlayer } from '@/app/composables/useMeditationPlayer';
import { useMeditationsStore } from '@/app/stores/meditations';
import { useSceneSettingsStore } from '@/app/stores/sceneSettings';
import { useUiSettingsStore } from '@/app/stores/uiSettings';
import { useSceneAudio } from '@/app/composables/useSceneAudio';
import { useSceneAudioFocusState } from '@/app/composables/useSceneAudioFocus';
import { useSos } from '@/app/composables/useSos';
import { findSceneTrack } from '@/app/lib/sceneSelectionCatalog';
import { resolveMediaUrl } from '@/app/utils/media';
import { useAuthStore } from '@/app/stores/auth';
import { useViewportOrientation } from '@/app/composables/useViewportOrientation';
import { pickOrientationMediaPath } from '@/app/utils/orientationMedia';

// ─── Глобальные достижения ────────────────────────────────────────────────
const { popNextCelebration, hasReadyCelebration } = useMilestoneBadges();
const currentCelebrationId = ref<string | null>(null);
const celebrationVisible = ref(false);

function showNextCelebrationGlobal() {
  if (celebrationVisible.value) return;
  const next = popNextCelebration();
  if (!next) return;
  currentCelebrationId.value = next.badgeId;
  celebrationVisible.value = true;
}

function onCelebrationContinue() {
  celebrationVisible.value = false;
}

function onCelebrationClosed() {
  currentCelebrationId.value = null;
  // Небольшая пауза перед следующим
  setTimeout(() => showNextCelebrationGlobal(), 300);
}

// Поллинг раз в 500ms — подхватывает отложенные достижения (garden)
let celebrationPoller: ReturnType<typeof setInterval> | null = null;

// ─── Meditation player ────────────────────────────────────────────────────
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
const { isPortraitMode } = useViewportOrientation();
const pushRecovery = usePushRecovery();

// In-app модалка про готовый отчёт: polling /api/garden/reports/pending,
// показ только когда залогинен И приложение активно (foreground).
const pendingReport = usePendingReportNotification({
  enabled: () =>
    auth.isLoggedIn && (typeof document === 'undefined' || document.visibilityState === 'visible'),
});

function handleOpenPendingReport(report: PendingReport) {
  pendingReport.clear(report.id);
  // Навигация в /garden с параметром, чтобы страница автоматически открыла
  // соответствующий отчёт в GardenPlantReportSheet через timeline.
  void navigateTo({
    path: '/garden',
    query: {
      openReport: String(report.id),
      step: String(report.checkpointStep),
      slug: report.programSlug,
    },
  });
}

const route = useRoute();
const auth = useAuthStore();
const sceneSettings = useSceneSettingsStore();

// ==========================================
// Mobile app-promo + Web Push
// ==========================================
const mobileAppPromo = useMobileAppPromo();
const webPush = useWebPush();
let webPushPermissionTimer: ReturnType<typeof setTimeout> | null = null;

const showAndroidAppPromo = computed(
  () => mobileAppPromo.activePromoKind.value === 'android-app'
);
const showIosGuide = computed(
  () => mobileAppPromo.activePromoKind.value === 'ios-pwa'
);

let mobilePromoTimer: ReturnType<typeof setTimeout> | null = null;

function clearMobilePromoTimer() {
  if (!mobilePromoTimer) return;
  clearTimeout(mobilePromoTimer);
  mobilePromoTimer = null;
}

function scheduleMobilePromoOffer() {
  clearMobilePromoTimer();

  if (!auth.isLoggedIn) return;
  if (mobileAppPromo.isPromoBlockedPath(route.path || '')) {
    mobileAppPromo.hideActiveOffer();
    return;
  }

  // Даём пользователю сначала войти в контекст экрана, затем мягко показываем promotion.
  mobilePromoTimer = setTimeout(() => {
    void mobileAppPromo.prepareOffer(route.path || '');
  }, 5000);
}

function handleMobilePromoClose() {
  mobileAppPromo.dismissActiveOffer();
}

async function handleAndroidAppOpen() {
  await mobileAppPromo.openAndroidApp();
}

async function handleGooglePlayOpen() {
  await mobileAppPromo.openGooglePlayStore();
}

// Показываем mobile promotion + запрашиваем web push разрешение только авторизованным.
watch(
  () => auth.isLoggedIn,
  (loggedIn) => {
    if (loggedIn) {
      scheduleMobilePromoOffer();
      tryRequestWebPushPermission();
      // Если push уже включён (permission + активный флаг) — регистрируем foreground-listener.
      // Нужно при каждой загрузке страницы (не только при login/enable).
      // Без этого foreground-уведомления не показываются при data-only web push.
      if (
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted' &&
        webPush.isUserActivated()
      ) {
        webPush.setupForegroundListener();
      }
    } else {
      mobileAppPromo.resetAndroidRuntimeDismiss();
      clearMobilePromoTimer();
      if (webPushPermissionTimer) clearTimeout(webPushPermissionTimer);
      mobileAppPromo.hideActiveOffer();
    }
  },
  { immediate: true }
);

watch(
  () => route.path,
  (path) => {
    clearMobilePromoTimer();

    if (!auth.isLoggedIn) return;

    if (mobileAppPromo.isPromoBlockedPath(path || '')) {
      mobileAppPromo.hideActiveOffer();
      return;
    }

    if (mobileAppPromo.activePromoKind.value !== 'none') {
      return;
    }

    scheduleMobilePromoOffer();
  }
);

/**
 * Запрашивает разрешение на web push через 10 секунд после логина.
 * Только если браузер поддерживает, разрешение ещё не запрашивалось
 * и это не нативная платформа.
 */
function tryRequestWebPushPermission() {
  if (!webPush.isBrowserCapable()) return;
  if (typeof Notification === 'undefined') return;
  // Уже было решение — не спрашиваем снова
  if (Notification.permission !== 'default') return;

  webPushPermissionTimer = setTimeout(async () => {
    // Повторная проверка — вдруг уже решил за это время
    if (Notification.permission !== 'default') return;
    if (await webPush.isNativePlatform()) return;

    // Запрашиваем разрешение браузера
    const permission = await webPush.requestPermission();
    if (permission === 'granted') {
      // Если Firebase настроен — сразу регистрируем токен
      void webPush.ensureRegisteredAfterLogin();
    }
  }, 10_000);
}
const uiSettings = useUiSettingsStore();
const sceneAudio = useSceneAudio();
const sceneAudioFocusState = useSceneAudioFocusState();
const RESUME_SCENE_AFTER_MEDITATION_DELAY_MS = 450;
const SOS_TECHNIQUE_STEPS = [
  'panic-grounding',
  'panic-breathing',
  'tension-practice',
  'finish',
] as const;
const { step: sosStep } = useSos();
const isSosTechniqueActive = computed(
  () =>
    route.path === '/quick-help' &&
    SOS_TECHNIQUE_STEPS.includes(
      sosStep.value as (typeof SOS_TECHNIQUE_STEPS)[number]
    )
);
const canPlaySceneAudio = computed(() => {
  const onboardingCompleted = auth.user?.onboarding?.welcome === true;
  // Фоновые сцены доступны только внутри основного приложения:
  // не во время logout/login-перехода и не до завершения welcome-онбординга.
  return (
    auth.isLoggedIn &&
    !auth.isLoggingOut &&
    !auth.loading &&
    onboardingCompleted
  );
});
const showPushRecoveryDialog = computed(() => {
  return pushRecovery.showRecoveryDialog.value && auth.user?.role !== 'support';
});

const isAppActive = ref(true);
let removeVisibilityListener: (() => void) | null = null;
let removeAppStateListener: (() => Promise<void>) | null = null;

// Проверяем recovery push-уведомлений через 5 секунд после mount
// (после того как push-notifications.client.ts отработает за 3 секунды)
onMounted(() => {
  // Поллер для отложенных достижений (каждые 500ms)
  celebrationPoller = setInterval(() => {
    if (hasReadyCelebration()) showNextCelebrationGlobal();
  }, 500);

  if (typeof document !== 'undefined') {
    const syncVisibilityState = () => {
      isAppActive.value = document.visibilityState === 'visible';
    };

    syncVisibilityState();
    document.addEventListener('visibilitychange', syncVisibilityState);
    removeVisibilityListener = () => {
      document.removeEventListener('visibilitychange', syncVisibilityState);
    };
  }

  void (async () => {
    try {
      const { App } = await import('@capacitor/app');
      const state = await App.getState();
      isAppActive.value = state.isActive;

      const listener = await App.addListener(
        'appStateChange',
        ({ isActive }) => {
          isAppActive.value = isActive;
        }
      );

      removeAppStateListener = () => listener.remove();
    } catch {
      // На web fallback уже закрыт visibilitychange.
    }
  })();

  setTimeout(() => {
    if (canPlaySceneAudio.value) {
      void pushRecovery.checkRecoveryStatus();
    }
  }, 5000);
});

onBeforeUnmount(() => {
  if (celebrationPoller) {
    clearInterval(celebrationPoller);
    celebrationPoller = null;
  }

  removeVisibilityListener?.();
  removeVisibilityListener = null;

  if (removeAppStateListener) {
    void removeAppStateListener();
    removeAppStateListener = null;
  }

  clearMobilePromoTimer();

  if (webPushPermissionTimer) {
    clearTimeout(webPushPermissionTimer);
    webPushPermissionTimer = null;
  }
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

const isProgramRoute = computed(() => {
  return (route.path || '').startsWith('/programs/');
});

const showMiniMeditationPlayer = computed(() => {
  // В roadmap медитация встроена в шаг, а глобальный mini-player перекрывает CTA.
  return Boolean(
    currentTrack.value && !isMeditationDetail.value && !isProgramRoute.value
  );
});

const routeTrack = computed(() => {
  const id = detailTrackId.value;
  if (!id) return null;
  return meditationsStore.byId(id) || null;
});

const detailBackground = computed(() => {
  const track =
    routeTrack.value ||
    currentTrack.value ||
    (detailTrackId.value ? meditationsStore.byId(detailTrackId.value) : null);

  if (!track) return '';

  const chosen = pickOrientationMediaPath(track.backgroundPath || '', {
    portraitFirst: isPortraitMode.value,
  });
  return resolveMediaUrl(chosen || '');
});

const currentScene = computed(
  () => findSceneTrack(sceneSettings.sceneId) || null
);

const sceneBackground = computed(() => {
  if (!currentScene.value) return '';
  const chosen = pickOrientationMediaPath(currentScene.value.backgroundPath, {
    portraitFirst: isPortraitMode.value,
  });
  return resolveMediaUrl(chosen || '');
});

const showSceneBackground = computed(() => {
  return !isMeditationDetail.value && Boolean(sceneBackground.value);
});

const isMeditationAudioActive = computed(
  () => isPlaying.value || isBuffering.value
);
const breathPracticeSlug = computed(() => {
  const path = route.path || '';
  if (!path.startsWith('/breath-practices/')) return null;

  const raw = route.params.slug;
  const slug = Array.isArray(raw) ? raw[0] : raw;
  if (typeof slug !== 'string') return null;

  const normalized = slug.trim();
  return normalized.length > 0 ? normalized : null;
});

const isBreathPracticePlayerPage = computed(() => {
  // Визуально scene background теперь используется везде,
  // а route-проверка нужна только для приглушения audio сцены на реальном плеере.
  return Boolean(
    breathPracticeSlug.value && breathPracticeSlug.value !== 'custom'
  );
});

const shouldMuteSceneAudio = computed(() => {
  // Фон сцены глушим только при реально активном медитационном аудио,
  // на дыхательных практиках и в SOS-техниках.
  // Важно: открытый экран медитации сам по себе не должен блокировать фон,
  // иначе после stop() сцена не возобновляется.
  return (
    isMeditationAudioActive.value ||
    isBreathPracticePlayerPage.value ||
    isSosTechniqueActive.value ||
    sceneAudioFocusState.isLocked.value
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

let sceneAudioHydrationRunId = 0;
let sceneAudioHydrated = false;

watch(
  () => sceneSettings.volume,
  (value) => {
    if (!sceneSettings.loaded) return;
    sceneAudio.setVolume(value / 100);
  }
);

watch(
  () => sceneSettings.backgroundPlayMinutes,
  (value) => {
    if (!sceneSettings.loaded) return;
    sceneAudio.setBackgroundPlayMinutes(value);
  }
);

let syncSceneAudioRunId = 0;

async function hydrateSceneAudioFromSettings() {
  const runId = ++sceneAudioHydrationRunId;
  await sceneSettings.ensureLoaded();
  if (runId !== sceneAudioHydrationRunId) return;
  await sceneAudio.hydrateFromSettings({
    scene: currentScene.value,
    volume: sceneSettings.volume / 100,
    backgroundPlayMinutes: sceneSettings.backgroundPlayMinutes,
  });
  if (runId !== sceneAudioHydrationRunId) return;
  sceneAudioHydrated = true;
}

/** Флаг: переход с mute на unmute (остановка медитации). Нужен для отменяемого resume сцены. */
async function syncSceneAudioState(options?: {
  transitioningFromMute?: boolean;
}) {
  const runId = ++syncSceneAudioRunId;
  const transitioningFromMute = options?.transitioningFromMute ?? false;

  // На неавторизованных экранах фон всегда выключен.
  if (!canPlaySceneAudio.value) {
    await sceneAudio.stop(false);
    return;
  }
  if (!sceneAudioHydrated) {
    await hydrateSceneAudioFromSettings();
  }
  if (runId !== syncSceneAudioRunId) return;
  if (!currentScene.value) return;
  // Нулевая громкость = сцена полностью выключена.
  if (sceneSettings.volume <= 0) {
    await sceneAudio.stop(false);
    return;
  }
  // Пока открыт трек медитации или активен мини‑плеер — фоновые звуки выключены.
  if (shouldMuteSceneAudio.value) {
    // Обновляем текущую сцену без автозапуска, пока приоритет у другого аудио.
    await sceneAudio.setScene(currentScene.value);
    if (runId !== syncSceneAudioRunId) return;
    await sceneAudio.suspend();
    return;
  }

  if (!isAppActive.value) {
    // Если медитация закончилась по таймеру в фоне/под локскрином,
    // сцену нельзя поднимать сразу: пользователь её не видит и
    // вместо тишины получит неожиданный фоновый звук.
    return;
  }

  const resumed = await sceneAudio.resume({
    delayMs: transitioningFromMute ? RESUME_SCENE_AFTER_MEDITATION_DELAY_MS : 0,
  });
  if (runId !== syncSceneAudioRunId) return;
  if (!resumed && !sceneAudio.isPlaying.value) {
    await sceneAudio.play(currentScene.value);
  }
}

watch(
  [
    () => shouldMuteSceneAudio.value,
    () => canPlaySceneAudio.value,
    () => currentScene.value?.id,
    () => isAppActive.value,
  ],
  ([mute], [oldMute]) => {
    const transitioningFromMute = oldMute === true && mute === false;
    void syncSceneAudioState({
      transitioningFromMute,
    });
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
  transform: scale(1.1);
  transform-origin: center;
  will-change: transform;
  background: #000;
}

.meditation-bg-pan {
  position: absolute;
  inset: -10%;
  width: 120%;
  height: 120%;
  animation: meditation-pan-diagonal 60s ease-in-out infinite;
  will-change: transform;
  overflow: hidden;
  background: #000;
}

/* Плавная траектория без остановок и резких углов. */
@keyframes meditation-pan-diagonal {
  0% {
    transform: scale(1) translate3d(0px, 0px, 0);
  }
  50% {
    transform: scale(1.1) translate3d(44px, 40px, 0);
  }
  100% {
    transform: scale(1) translate3d(0px, 0px, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .meditation-bg-pan {
    animation: none;
    transform: none;
  }
}
</style>
