import type { Howl } from 'howler';
import {
  BREATH_PRACTICE_VOICE_AUDIO,
  type BreathVoiceAddressing,
  type BreathVoiceKey,
} from '@/app/lib/breathPracticeVoiceAudio';
import { getBreathPracticeHowlerModule } from '@/app/lib/breathPracticeHowler';
import { isDocumentAvailable } from '@/app/utils/document';

type HowlConstructor = typeof import('howler').Howl;

export function useBreathPracticeVoice() {
  const soundCache = new Map<string, Howl>();
  const preloaded = new Set<string>();
  const preloadInFlight = new Map<string, Promise<void>>();
  let currentSound: Howl | null = null;
  let currentSoundId: number | null = null;
  let cacheVersion = 0;

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

    const module = await getBreathPracticeHowlerModule();
    return module?.Howl ?? null;
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
    addressing: BreathVoiceAddressing,
    version = cacheVersion
  ): Promise<Howl | null> {
    if (!canUseAudio()) return null;
    if (version !== cacheVersion) return null;

    const key = cacheKey(phase, addressing);
    const cached = soundCache.get(key);
    if (cached) return cached;

    const HowlCtor = await getHowlConstructor();
    if (!HowlCtor || version !== cacheVersion) return null;

    // Double-check после await: параллельный вызов (prepare + play одновременно)
    // мог уже создать и закэшировать звук для этого ключа.
    // Без проверки оба вызова создают Howl — первый остаётся без ссылки
    // и навсегда держит HTML5 Audio ноду из пула.
    const existingAfterAwait = soundCache.get(key);
    if (existingAfterAwait) return existingAfterAwait;

    const src = BREATH_PRACTICE_VOICE_AUDIO[addressing][phase];
    const sound = createSound(HowlCtor, src, key);
    soundCache.set(key, sound);
    return sound;
  }

  async function preloadClip(
    phase: BreathVoiceKey,
    addressing: BreathVoiceAddressing,
    version = cacheVersion
  ) {
    if (version !== cacheVersion) return;

    const key = cacheKey(phase, addressing);
    if (preloaded.has(key)) return;

    const existingTask = preloadInFlight.get(key);
    if (existingTask) {
      await existingTask;
      return;
    }

    const preloadTask = (async () => {
      const sound = await getOrCreateSound(phase, addressing, version);
      if (!sound) return;
      if (version !== cacheVersion) return;

      if (sound.state() === 'loaded') {
        if (version === cacheVersion) {
          preloaded.add(key);
        }
        return;
      }

      await new Promise<void>((resolve) => {
        const handleLoad = () => {
          if (version === cacheVersion) {
            preloaded.add(key);
          }
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
    const version = cacheVersion;
    const phases = Object.keys(
      BREATH_PRACTICE_VOICE_AUDIO[addressing]
    ) as BreathVoiceKey[];
    await Promise.allSettled(
      phases.map((phase) => preloadClip(phase, addressing, version))
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
    const version = cacheVersion;
    const sound = await getOrCreateSound(phase, addressing, version);
    if (!sound) return;
    if (version !== cacheVersion) return;

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

  function release() {
    cacheVersion += 1;
    stop();
    preloaded.clear();
    preloadInFlight.clear();

    for (const sound of soundCache.values()) {
      try {
        sound.unload();
      } catch (error) {
        console.error('[BreathVoice] Failed to unload sound:', error);
      }
    }

    soundCache.clear();
  }

  return {
    prepare,
    play,
    stop,
    release,
  };
}
