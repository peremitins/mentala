import { ref } from 'vue';
import type { Howl } from 'howler';
import type { BreathCueType } from '@/app/lib/breathPracticesCatalog';
import { BREATH_PRACTICE_SOUNDS } from '@/app/lib/breathPracticeAudio';

type HowlConstructor = typeof import('howler').Howl;

export function useBreathPracticeAudio() {
  const inhaleSound = ref<Howl | null>(null);
  const exhaleSound = ref<Howl | null>(null);
  const holdSound = ref<Howl | null>(null);
  const pauseSound = ref<Howl | null>(null);
  const activeSoundIds: Record<BreathCueType, number | null> = {
    inhale: null,
    exhale: null,
    hold: null,
    pause: null,
  };
  const TRANSITION_FADE_MS = 500;
  const VOLUME_FADE_MS = 120;
  // Небольшой буст, чтобы компенсировать тихие файлы (выше 1.0 нельзя).
  const VOLUME_BOOST = 1.35;

  function createSound(
    HowlCtor: HowlConstructor,
    src: string,
    label: string
  ): Howl {
    const sound = new HowlCtor({
      src: [src],
      preload: true,
      onplayerror: () => {
        // Ждём авто‑unlock и повторяем воспроизведение (важно для iOS/Android).
        sound.once('unlock', () => {
          try {
            sound.play();
          } catch (error) {
            console.error(`[BreathAudio] Failed to replay ${label}:`, error);
          }
        });
      },
      onloaderror: (_id, error) => {
        console.error(`[BreathAudio] Failed to load ${label}:`, error);
      },
    });

    return sound;
  }

  async function ensureSounds(): Promise<boolean> {
    if (process.server || typeof window === 'undefined') return false;

    if (!inhaleSound.value) {
      // Инициализируем звуки один раз, чтобы не создавать объекты при каждом запуске.
      const { Howl } = await import('howler');
      inhaleSound.value = createSound(
        Howl,
        BREATH_PRACTICE_SOUNDS.inhale,
        'inhale'
      );
      exhaleSound.value = createSound(
        Howl,
        BREATH_PRACTICE_SOUNDS.exhale,
        'exhale'
      );
      holdSound.value = createSound(Howl, BREATH_PRACTICE_SOUNDS.hold, 'hold');
      pauseSound.value = createSound(
        Howl,
        BREATH_PRACTICE_SOUNDS.pause,
        'pause'
      );
    }

    return true;
  }

  async function prepare(): Promise<void> {
    // Инициализируем Howler заранее, чтобы авто‑unlock сработал на первом тапе.
    await ensureSounds();
  }

  function normalizeVolume(raw: number): number {
    const safe = Number.isFinite(raw) ? raw : 0;
    const clamped = Math.max(0, Math.min(1, safe));
    return Math.min(1, clamped * VOLUME_BOOST);
  }

  function stopSound(
    sound: Howl | null,
    soundId: number | null,
    fadeMs: number
  ): void {
    if (!sound || soundId === null) return;
    if (!sound.playing(soundId)) return;

    if (fadeMs <= 0) {
      sound.stop(soundId);
      return;
    }

    const currentVolume = sound.volume(soundId);
    sound.fade(currentVolume, 0, fadeMs, soundId);
    // Останавливаем после фейда, чтобы освободить ресурс.
    setTimeout(() => {
      sound.stop(soundId);
    }, fadeMs + 20);
  }

  function stopAll(fadeMs = 0): void {
    stopSound(inhaleSound.value, activeSoundIds.inhale, fadeMs);
    stopSound(exhaleSound.value, activeSoundIds.exhale, fadeMs);
    stopSound(holdSound.value, activeSoundIds.hold, fadeMs);
    stopSound(pauseSound.value, activeSoundIds.pause, fadeMs);
    activeSoundIds.inhale = null;
    activeSoundIds.exhale = null;
    activeSoundIds.hold = null;
    activeSoundIds.pause = null;
  }

  function applyVolume(
    sound: Howl | null,
    soundId: number | null,
    targetVolume: number
  ): void {
    if (!sound || soundId === null) return;
    if (!sound.playing(soundId)) return;

    const current = sound.volume(soundId);
    if (VOLUME_FADE_MS > 0) {
      sound.fade(current, targetVolume, VOLUME_FADE_MS, soundId);
    } else {
      sound.volume(targetVolume, soundId);
    }
  }

  function setVolume(level: number): void {
    const target = normalizeVolume(level);
    applyVolume(inhaleSound.value, activeSoundIds.inhale, target);
    applyVolume(exhaleSound.value, activeSoundIds.exhale, target);
    applyVolume(holdSound.value, activeSoundIds.hold, target);
    applyVolume(pauseSound.value, activeSoundIds.pause, target);
  }

  function resolveSound(type: BreathCueType): Howl | null {
    if (
      !inhaleSound.value ||
      !exhaleSound.value ||
      !holdSound.value ||
      !pauseSound.value
    ) {
      return null;
    }

    if (type === 'inhale') return inhaleSound.value;
    if (type === 'exhale') return exhaleSound.value;
    if (type === 'pause') return pauseSound.value;
    return holdSound.value;
  }

  async function playCue(type: BreathCueType, volume: number): Promise<void> {
    const ready = await ensureSounds();
    if (!ready) return;

    const sound = resolveSound(type);
    if (!sound) return;

    try {
      // Делаем мягкий переход: короткий фейд‑аут и фейд‑ин.
      stopAll(TRANSITION_FADE_MS);
      const targetVolume = normalizeVolume(volume);
      const id = sound.play();
      activeSoundIds[type] = id;
      sound.volume(0, id);
      if (TRANSITION_FADE_MS > 0) {
        sound.fade(0, targetVolume, TRANSITION_FADE_MS, id);
      } else {
        sound.volume(targetVolume, id);
      }
    } catch (error) {
      console.error('[BreathAudio] Failed to play cue:', error);
    }
  }

  return {
    playCue,
    prepare,
    stopAll,
    setVolume,
  };
}
