import type { BreathPhaseType } from '@/app/lib/breathPracticesCatalog';
import {
  BREATH_PRACTICE_VOICE_AUDIO,
  type BreathVoiceAddressing,
  type BreathVoiceKey,
} from '@/app/lib/breathPracticeVoiceAudio';
import { isDocumentAvailable } from '@/app/utils/document';

export function useBreathPracticeVoice() {
  const audioCache = new Map<string, HTMLAudioElement>();
  const preloaded = new Set<string>();
  const preloadInFlight = new Set<string>();
  let currentAudio: HTMLAudioElement | null = null;

  function canUseAudio() {
    return !process.server && isDocumentAvailable() && typeof Audio !== 'undefined';
  }

  function cacheKey(phase: BreathVoiceKey, addressing: BreathVoiceAddressing) {
    return `${addressing}:${phase}`;
  }

  function getOrCreateAudio(
    phase: BreathVoiceKey,
    addressing: BreathVoiceAddressing
  ) {
    if (!canUseAudio()) return null;
    const key = cacheKey(phase, addressing);
    const cached = audioCache.get(key);
    if (cached) return cached;

    const src = BREATH_PRACTICE_VOICE_AUDIO[addressing][phase];
    const audio = new Audio(src);
    audio.preload = 'auto';
    audioCache.set(key, audio);
    return audio;
  }

  async function preloadClip(
    phase: BreathVoiceKey,
    addressing: BreathVoiceAddressing
  ) {
    const key = cacheKey(phase, addressing);
    if (preloaded.has(key) || preloadInFlight.has(key)) return;

    const audio = getOrCreateAudio(phase, addressing);
    if (!audio) return;

    preloadInFlight.add(key);
    try {
      await new Promise<void>((resolve) => {
        const done = () => {
          cleanup();
          preloaded.add(key);
          resolve();
        };
        const cleanup = () => {
          audio.removeEventListener('canplaythrough', done);
          audio.removeEventListener('error', done);
        };
        audio.addEventListener('canplaythrough', done, { once: true });
        audio.addEventListener('error', done, { once: true });
        audio.load();
      });
    } finally {
      preloadInFlight.delete(key);
    }
  }

  async function prepare(addressing: BreathVoiceAddressing) {
    if (!canUseAudio()) return;
    const phases = Object.keys(
      BREATH_PRACTICE_VOICE_AUDIO[addressing]
    ) as BreathVoiceKey[];
    await Promise.allSettled(phases.map((phase) => preloadClip(phase, addressing)));
  }

  function stop() {
    if (!currentAudio) return;
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch (error) {
      console.error('[BreathVoice] Failed to stop audio:', error);
    } finally {
      currentAudio = null;
    }
  }

  async function play(phase: BreathVoiceKey, addressing: BreathVoiceAddressing) {
    if (!canUseAudio()) return;
    const audio = getOrCreateAudio(phase, addressing);
    if (!audio) return;

    stop();
    currentAudio = audio;
    try {
      audio.currentTime = 0;
      await audio.play();
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      console.error('[BreathVoice] Failed to play phase voice:', error);
    }
  }

  return {
    prepare,
    play,
    stop,
  };
}
