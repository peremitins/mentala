import { useRuntimeConfig } from '#imports';
import { Capacitor } from '@capacitor/core';
import type {
  BreathCueType,
  BreathPhase,
} from '@/app/lib/breathPracticesCatalog';
import { BREATH_PRACTICE_SOUNDS } from '@/app/lib/breathPracticeAudio';
import {
  BREATH_PRACTICE_VOICE_AUDIO,
  type BreathVoiceAddressing,
  type BreathVoiceKey,
} from '@/app/lib/breathPracticeVoiceAudio';
import { useBreathPracticeAudio as useWebBreathPracticeCueAudio } from '@/app/composables/useBreathPracticeAudio';
import { useBreathPracticeVoice as useWebBreathPracticeVoice } from '@/app/composables/useBreathPracticeVoice';
import { NativeAudioService } from '@/app/services/audio/nativeAudio.service';
import {
  NativeBreathSessionService,
  type NativeBreathSessionConfig,
} from '@/app/services/audio/nativeBreathSession.service';
import type { AudioServiceTrack } from '@/app/services/audio/audio.types';
import { isDocumentAvailable } from '@/app/utils/document';
import { isHttpUrl, resolveAppAssetBaseUrl } from '../utils/media-base';

type BreathPhasePlayback = {
  cue: BreathCueType;
  voice: BreathVoiceKey;
  addressing: BreathVoiceAddressing;
  phaseDurationMs: number;
  soundEnabled: boolean;
  voiceEnabled: boolean;
  volume: number;
};

type BreathSessionPlayback = {
  phases: BreathPhase[];
  addressing: BreathVoiceAddressing;
  soundEnabled: boolean;
  voiceEnabled: boolean;
  volume: number;
  sessionEndsAtMs: number | null;
};

const CUE_VOLUME_BOOST = 1.35;
const BREATH_VOICE_DURATION_MS: Record<BreathVoiceKey, number> = {
  intro: 2_376,
  inhale: 1_104,
  hold: 1_344,
  exhale: 1_176,
  pause: 1_128,
};

function normalizeCueVolume(raw: number) {
  const safe = Number.isFinite(raw) ? raw : 0;
  const clamped = Math.max(0, Math.min(1, safe));
  return Math.min(1, clamped * CUE_VOLUME_BOOST);
}

export function useBreathPracticePhaseAudio() {
  const webCueAudio = useWebBreathPracticeCueAudio();
  const webVoiceAudio = useWebBreathPracticeVoice();

  let introNativeService: NativeAudioService | null = null;
  let introNativeServicePromise: Promise<NativeAudioService | null> | null =
    null;
  let nativeSessionService: NativeBreathSessionService | null = null;
  let nativeSessionServicePromise: Promise<NativeBreathSessionService | null> | null =
    null;
  let scheduledStopAtMs: number | null = null;
  let activeSessionConfig: BreathSessionPlayback | null = null;

  function canUseAudio() {
    return (
      !process.server && typeof window !== 'undefined' && isDocumentAvailable()
    );
  }

  function shouldUseNativeAudio() {
    if (!canUseAudio()) return false;
    if (!Capacitor.isNativePlatform()) return false;
    if (!Capacitor.isPluginAvailable('AudioPlayer')) return false;

    try {
      const config = useRuntimeConfig();
      return config?.public?.featureNativeMeditationAudioEnabled !== false;
    } catch {
      return true;
    }
  }

  function isNativeSessionEnabled() {
    return shouldUseNativeAudio();
  }

  function hasActiveNativeSession() {
    return Boolean(nativeSessionService?.isActive());
  }

  function getNativePlatform() {
    return typeof Capacitor.getPlatform === 'function'
      ? Capacitor.getPlatform()
      : null;
  }

  function resolveAudioUrl(path: string) {
    if (!path) return '';
    if (isHttpUrl(path)) return path;

    const config = useRuntimeConfig();
    const publicConfig = config?.public;
    const origin =
      typeof window !== 'undefined' && isHttpUrl(window.location.origin)
        ? window.location.origin
        : '';
    const baseUrl = resolveAppAssetBaseUrl({
      isDev: publicConfig?.isDev === true,
      isNativeRuntime: Capacitor.isNativePlatform(),
      platform: getNativePlatform(),
      origin,
      apiBaseUrl: publicConfig?.apiBase,
      appUrl: publicConfig?.appUrl,
    });

    if (!baseUrl) return path;

    try {
      return new URL(path, `${baseUrl}/`).toString();
    } catch {
      return path;
    }
  }

  function mapVoiceTrack(
    key: BreathVoiceKey,
    addressing: BreathVoiceAddressing,
    useForNotification: boolean
  ): AudioServiceTrack | null {
    const path = BREATH_PRACTICE_VOICE_AUDIO[addressing][key];
    if (!path) return null;

    const url = resolveAudioUrl(path);
    if (!url) return null;

    return {
      id: `breath-voice-${addressing}-${key}`,
      url,
      title: `Дыхательная подсказка: ${key}`,
      category: 'breathing',
      durationMs: BREATH_VOICE_DURATION_MS[key],
      isLoop: false,
      useForNotification,
      isBackgroundMusic: false,
    };
  }

  async function createIntroNativeService() {
    const service = new NativeAudioService({
      audioIdNamespace: 'breathing_intro',
    });
    try {
      await service.init();
      return service;
    } catch (error) {
      console.error(
        '[BreathPhaseAudio] Failed to initialize native intro audio service:',
        error
      );
      await service.destroy().catch(() => undefined);
      return null;
    }
  }

  async function ensureIntroNativeService() {
    if (!shouldUseNativeAudio()) return null;
    if (introNativeService) return introNativeService;
    if (!introNativeServicePromise) {
      introNativeServicePromise = createIntroNativeService();
    }

    introNativeService = await introNativeServicePromise;
    introNativeServicePromise = null;
    return introNativeService;
  }

  async function createNativeSessionService() {
    const service = new NativeBreathSessionService();
    try {
      await service.init();
      return service;
    } catch (error) {
      console.error(
        '[BreathPhaseAudio] Failed to initialize native breath session service:',
        error
      );
      return null;
    }
  }

  async function ensureNativeSessionService() {
    if (!shouldUseNativeAudio()) return null;
    if (nativeSessionService) return nativeSessionService;
    if (!nativeSessionServicePromise) {
      nativeSessionServicePromise = createNativeSessionService();
    }

    nativeSessionService = await nativeSessionServicePromise;
    nativeSessionServicePromise = null;
    return nativeSessionService;
  }

  function buildSessionConfig(
    payload: BreathSessionPlayback
  ): NativeBreathSessionConfig {
    return {
      phases: payload.phases.map((phase) => ({
        type: phase.type,
        cue: phase.cue,
        label: phase.label,
        seconds: phase.seconds,
        cueAudioSource: resolveAudioUrl(BREATH_PRACTICE_SOUNDS[phase.cue]),
        voiceAudioSource: resolveAudioUrl(
          BREATH_PRACTICE_VOICE_AUDIO[payload.addressing][phase.type]
        ),
      })),
      soundEnabled: payload.soundEnabled,
      voiceEnabled: payload.voiceEnabled,
      cueVolume: normalizeCueVolume(payload.volume),
      sessionEndsAtMs: payload.sessionEndsAtMs,
    };
  }

  async function prepare(addressing: BreathVoiceAddressing) {
    if (shouldUseNativeAudio()) {
      await Promise.all([
        ensureIntroNativeService(),
        ensureNativeSessionService(),
      ]);
      return;
    }

    await Promise.all([
      webCueAudio.prepare(),
      webVoiceAudio.prepare(addressing),
    ]);
  }

  async function playWebPhase(payload: BreathPhasePlayback) {
    if (payload.soundEnabled) {
      await webCueAudio.playCue(
        payload.cue,
        payload.volume,
        payload.phaseDurationMs
      );
    } else {
      webCueAudio.stopAll(0);
    }

    if (payload.voiceEnabled) {
      await webVoiceAudio.play(payload.voice, payload.addressing);
    } else {
      webVoiceAudio.stop();
    }
  }

  async function playPhase(payload: BreathPhasePlayback) {
    if (shouldUseNativeAudio()) {
      // На native основная фаза идёт внутри breathing-session.
      return;
    }

    await playWebPhase(payload);
  }

  async function startSession(payload: BreathSessionPlayback) {
    activeSessionConfig = {
      ...payload,
      sessionEndsAtMs: payload.sessionEndsAtMs ?? scheduledStopAtMs,
    };

    if (!shouldUseNativeAudio()) {
      return;
    }

    const service = await ensureNativeSessionService();
    if (!service) return;

    // Перед стартом основной сессии убираем intro, чтобы источники не пересеклись.
    await introNativeService?.stop({
      fadeOutMs: 0,
    });

    const startedAtMs = await service.startSession(
      buildSessionConfig(activeSessionConfig)
    );

    return typeof startedAtMs === 'number' ? startedAtMs : Date.now();
  }

  async function updateSessionConfig(
    partial: Partial<
      Pick<
        BreathSessionPlayback,
        'soundEnabled' | 'voiceEnabled' | 'volume' | 'sessionEndsAtMs'
      >
    >
  ) {
    if (!activeSessionConfig) {
      if (partial.sessionEndsAtMs !== undefined) {
        scheduledStopAtMs = partial.sessionEndsAtMs ?? null;
      }
      return;
    }

    activeSessionConfig = {
      ...activeSessionConfig,
      ...partial,
    };

    if (!shouldUseNativeAudio()) return;

    const service = await ensureNativeSessionService();
    if (!service) return;

    await service.updateSessionConfig({
      soundEnabled: partial.soundEnabled,
      voiceEnabled: partial.voiceEnabled,
      cueVolume:
        typeof partial.volume === 'number'
          ? normalizeCueVolume(partial.volume)
          : undefined,
      sessionEndsAtMs:
        partial.sessionEndsAtMs !== undefined
          ? partial.sessionEndsAtMs
          : undefined,
    });
  }

  async function pauseSession() {
    if (!shouldUseNativeAudio()) return;
    await nativeSessionService?.pauseSession();
  }

  async function resumeSession() {
    if (!shouldUseNativeAudio()) return;
    await nativeSessionService?.resumeSession();
  }

  async function playIntro(addressing: BreathVoiceAddressing) {
    if (shouldUseNativeAudio()) {
      const service = await ensureIntroNativeService();
      const track = mapVoiceTrack('intro', addressing, true);
      if (!service || !track) return;

      await service.stop({ fadeOutMs: 0 }).catch(() => undefined);
      await service.play(track, { volume: 1 });
      return;
    }

    webCueAudio.stopAll(0);
    await webVoiceAudio.play('intro', addressing);
  }

  async function stopAll(fadeOutMs = 0) {
    activeSessionConfig = null;

    if (shouldUseNativeAudio()) {
      await Promise.allSettled([
        nativeSessionService?.stopSession() ?? Promise.resolve(),
        introNativeService?.stop({
          fadeOutMs,
        }) ?? Promise.resolve(),
      ]);
      return;
    }

    webCueAudio.stopAll(fadeOutMs);
    webVoiceAudio.stop();
  }

  function setVolume(level: number) {
    if (shouldUseNativeAudio()) {
      void updateSessionConfig({
        volume: level,
      }).catch((error) => {
        console.error(
          '[BreathPhaseAudio] Failed to update native session cue volume:',
          error
        );
      });
      return;
    }

    webCueAudio.setVolume(level);
  }

  async function setScheduledStopAt(timestampMs: number | null) {
    scheduledStopAtMs =
      typeof timestampMs === 'number' && Number.isFinite(timestampMs)
        ? Math.max(0, Math.floor(timestampMs))
        : null;

    if (!shouldUseNativeAudio()) return;

    await updateSessionConfig({
      sessionEndsAtMs: scheduledStopAtMs,
    });
  }

  function release() {
    activeSessionConfig = null;
    scheduledStopAtMs = null;

    void nativeSessionService?.destroy().catch((error) => {
      console.error(
        '[BreathPhaseAudio] Failed to destroy native breath session service:',
        error
      );
    });
    void introNativeService?.destroy().catch((error) => {
      console.error(
        '[BreathPhaseAudio] Failed to destroy native intro audio service:',
        error
      );
    });

    nativeSessionService = null;
    nativeSessionServicePromise = null;
    introNativeService = null;
    introNativeServicePromise = null;

    webCueAudio.release();
    webVoiceAudio.release();
  }

  return {
    prepare,
    playPhase,
    startSession,
    updateSessionConfig,
    pauseSession,
    resumeSession,
    playIntro,
    stopAll,
    setVolume,
    setScheduledStopAt,
    release,
    isNativeSessionEnabled,
    hasActiveNativeSession,
  };
}
