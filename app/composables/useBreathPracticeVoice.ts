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
  // persistent id первого (и единственного) Sound каждого Howl-а голоса.
  // Ключ — тот же cacheKey, что и в soundCache. См. комментарий к
  // persistentSoundIds в useBreathPracticeAudio.ts: sound.play(id) идёт
  // через _soundById и обходит _inactiveSound + _drain, что не даёт
  // Howler'у утечь html5 Audio-ноды из глобального пула (10 штук).
  // Без этого повторные play() постепенно выедают пул и voice-подсказки
  // молча перестают звучать.
  const persistentSoundIds = new Map<string, number>();
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
    key: string
  ): Howl {
    const sound = new HowlCtor({
      src: [src],
      // Для Android Capacitor WebView используем HTML5 Audio через Howler:
      // это стабильнее, чем голый Audio и Web Audio API для коротких voice-clip.
      html5: true,
      preload: true,
      // pool оставляем дефолтным. Мы сами никогда не зовём play() без id
      // после первого раза (см. persistentSoundIds) — поэтому у Howl'а
      // всегда ровно один Sound в _sounds, _inactiveSound не срабатывает,
      // drain ничего не сплайсит, html5 Audio-нода не утекает.
      onplayerror: () => {
        sound.once('unlock', () => {
          if (currentSound !== sound) return;

          try {
            const existingId = persistentSoundIds.get(key);
            if (existingId !== undefined) {
              // Переигрываем тот же Sound — без захвата новой html5-ноды.
              sound.play(existingId);
              currentSoundId = existingId;
              return;
            }
            const id = sound.play();
            if (typeof id === 'number') {
              persistentSoundIds.set(key, id);
              currentSoundId = id;
            }
          } catch (error) {
            console.error(
              `[BreathVoice] Failed to replay ${key} after unlock:`,
              error
            );
          }
        });
      },
      onloaderror: (_id, error) => {
        console.error(`[BreathVoice] Failed to load ${key}:`, error);
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

    const key = cacheKey(phase, addressing);
    stop();
    currentSound = sound;
    try {
      const existingId = persistentSoundIds.get(key);
      if (existingId !== undefined) {
        // Переиспользуем уже созданный Sound (и его HTMLAudioElement)
        // через sound.play(id) — обходим _inactiveSound/drain.
        sound.play(existingId);
        currentSoundId = existingId;
      } else {
        // Первый запуск этого клипа — Howler создаст Sound, запоминаем id.
        const id = sound.play();
        if (typeof id === 'number') {
          persistentSoundIds.set(key, id);
          currentSoundId = id;
        } else {
          currentSoundId = null;
        }
      }
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
    // После unload() id'ы протухают — новый ensureSounds/getOrCreateSound
    // создаст свежие Howl-объекты и новые persistent ids.
    persistentSoundIds.clear();
  }

  return {
    prepare,
    play,
    stop,
    release,
  };
}
