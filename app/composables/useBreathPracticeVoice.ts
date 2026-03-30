import type { Howl } from 'howler';
import {
  BREATH_PRACTICE_VOICE_AUDIO,
  type BreathVoiceAddressing,
  type BreathVoiceKey,
} from '@/app/lib/breathPracticeVoiceAudio';
import { isDocumentAvailable } from '@/app/utils/document';

type HowlConstructor = typeof import('howler').Howl;

export function useBreathPracticeVoice() {
  const soundCache = new Map<string, Howl>();
  const preloaded = new Set<string>();
  const preloadInFlight = new Map<string, Promise<void>>();
  let howlConstructorPromise: Promise<HowlConstructor> | null = null;
  let currentSound: Howl | null = null;
  let currentSoundId: number | null = null;

  function canUseAudio() {
    return (
      !process.server && isDocumentAvailable() && typeof window !== 'undefined'
    );
  }

  function cacheKey(phase: BreathVoiceKey, addressing: BreathVoiceAddressing) {
    return `${addressing}:${phase}`;
  }

  async function getHowlConstructor(): Promise<HowlConstructor | null> {
    if (!canUseAudio()) return null;

    if (!howlConstructorPromise) {
      howlConstructorPromise = import('howler').then(({ Howl }) => Howl);
    }

    return howlConstructorPromise;
  }

  function createSound(
    HowlCtor: HowlConstructor,
    src: string,
    label: string
  ): Howl {
    const sound = new HowlCtor({
      src: [src],
      // Для Android Capacitor WebView используем HTML5 Audio через Howler:
      // это стабильнее, чем голый Audio и Web Audio API для коротких voice-clip.
      html5: true,
      preload: true,
      onplayerror: () => {
        sound.once('unlock', () => {
          if (currentSound !== sound) return;

          try {
            currentSoundId = sound.play();
          } catch (error) {
            console.error(
              `[BreathVoice] Failed to replay ${label} after unlock:`,
              error
            );
          }
        });
      },
      onloaderror: (_id, error) => {
        console.error(`[BreathVoice] Failed to load ${label}:`, error);
      },
    });

    return sound;
  }

  async function getOrCreateSound(
    phase: BreathVoiceKey,
    addressing: BreathVoiceAddressing
  ): Promise<Howl | null> {
    if (!canUseAudio()) return null;

    const key = cacheKey(phase, addressing);
    const cached = soundCache.get(key);
    if (cached) return cached;

    const HowlCtor = await getHowlConstructor();
    if (!HowlCtor) return null;

    const src = BREATH_PRACTICE_VOICE_AUDIO[addressing][phase];
    const sound = createSound(HowlCtor, src, key);
    soundCache.set(key, sound);
    return sound;
  }

  async function preloadClip(
    phase: BreathVoiceKey,
    addressing: BreathVoiceAddressing
  ) {
    const key = cacheKey(phase, addressing);
    if (preloaded.has(key)) return;

    const existingTask = preloadInFlight.get(key);
    if (existingTask) {
      await existingTask;
      return;
    }

    const preloadTask = (async () => {
      const sound = await getOrCreateSound(phase, addressing);
      if (!sound) return;

      if (sound.state() === 'loaded') {
        preloaded.add(key);
        return;
      }

      await new Promise<void>((resolve) => {
        const handleLoad = () => {
          preloaded.add(key);
          resolve();
        };
        const handleLoadError = () => {
          resolve();
        };

        sound.once('load', handleLoad);
        sound.once('loaderror', handleLoadError);

        if (sound.state() === 'unloaded') {
          sound.load();
        }
      });
    })();

    preloadInFlight.set(key, preloadTask);
    try {
      await preloadTask;
    } finally {
      preloadInFlight.delete(key);
    }
  }

  async function prepare(addressing: BreathVoiceAddressing) {
    if (!canUseAudio()) return;
    const phases = Object.keys(
      BREATH_PRACTICE_VOICE_AUDIO[addressing]
    ) as BreathVoiceKey[];
    await Promise.allSettled(
      phases.map((phase) => preloadClip(phase, addressing))
    );
  }

  function stop() {
    if (!currentSound) return;

    try {
      if (currentSoundId !== null) {
        currentSound.stop(currentSoundId);
      } else {
        currentSound.stop();
      }
    } catch (error) {
      console.error('[BreathVoice] Failed to stop sound:', error);
    } finally {
      currentSound = null;
      currentSoundId = null;
    }
  }

  async function play(
    phase: BreathVoiceKey,
    addressing: BreathVoiceAddressing
  ) {
    if (!canUseAudio()) return;
    const sound = await getOrCreateSound(phase, addressing);
    if (!sound) return;

    stop();
    currentSound = sound;
    try {
      currentSoundId = sound.play();
    } catch (error: any) {
      currentSound = null;
      currentSoundId = null;
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
