import { ref } from 'vue';
import type { Howl } from 'howler';
import type { BreathCueType } from '@/app/lib/breathPracticesCatalog';
import { BREATH_PRACTICE_SOUNDS } from '@/app/lib/breathPracticeAudio';
import { getBreathPracticeHowlerModule } from '@/app/lib/breathPracticeHowler';
import { isDocumentAvailable } from '@/app/utils/document';

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
  const VOLUME_FADE_MS = 120;
  // Небольшой буст, чтобы компенсировать тихие файлы (выше 1.0 нельзя).
  const VOLUME_BOOST = 1.35;
  let cacheVersion = 0;

  function canUseAudio() {
    return (
      !process.server && typeof window !== 'undefined' && isDocumentAvailable()
    );
  }

  function createSound(
    HowlCtor: HowlConstructor,
    src: string,
    label: string,
    onReplay?: (id: number) => void
  ): Howl {
    const sound = new HowlCtor({
      src: [src],
      // html5: true форсирует HTML5 Audio вместо Web Audio API.
      // Это критично для Android Capacitor WebView: Web Audio API
      // там ненадёжен (suspended AudioContext, нестабильный fade через
      // linearRampToValueAtTime, сбои decodeAudioData для .m4a).
      // HTML5 Audio делегирует декодирование нативному плееру Android —
      // именно так работает useBreathPracticeVoice, и там всё стабильно.
      html5: true,
      preload: true,
      // pool: 1 — на каждый Howl держим максимум один Sound в пуле.
      // По умолчанию Howler удерживает до 5 Sound-объектов и drain()
      // удаляет лишние только когда длина превышает pool. Если предыдущий
      // play() ещё не ended (например, звук длится 2 сек или идёт fade),
      // то следующий play() создаёт новый Sound и берёт новую ноду
      // из общего html5 pool — новую Audio элемент без preload,
      // который на Android перед воспроизведением грузит .m4a с нуля.
      // Итог: звук пропадает. pool: 1 + мгновенный stop() перед play()
      // гарантируют переиспользование одного и того же HTMLAudioElement.
      pool: 1,
      onplayerror: () => {
        // Ждём авто‑unlock и повторяем воспроизведение (важно для iOS/Android).
        // onReplay обновляет activeSoundIds — без этого stopAll() не остановит
        // звук, воспроизведённый после разблокировки, и он продолжит играть
        // поверх следующих фаз.
        sound.once('unlock', () => {
          try {
            const id = sound.play();
            if (typeof id === 'number') {
              onReplay?.(id);
            }
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

  async function ensureSounds(version = cacheVersion): Promise<boolean> {
    if (!canUseAudio()) return false;
    if (version !== cacheVersion) return false;

    if (!inhaleSound.value) {
      // Инициализируем звуки один раз, чтобы не создавать объекты при каждом запуске.
      const module = await getBreathPracticeHowlerModule();
      if (!module || version !== cacheVersion) return false;

      // Double-check после await: параллельный вызов (например, onPhaseStart
      // и onSoundEnabledChange одновременно) мог уже инициализировать звуки.
      // Без этой проверки оба вызова создают по 4 Howl-объекта — первые 4
      // остаются без ссылки и навсегда держат HTML5 Audio ноды из пула.
      // Утечки исчерпывают пул (24 ноды на Android), и новые play() падают молча.
      if (!inhaleSound.value) {
        const { Howl } = module;
        inhaleSound.value = createSound(
          Howl,
          BREATH_PRACTICE_SOUNDS.inhale,
          'inhale',
          (id) => {
            activeSoundIds.inhale = id;
          }
        );
        exhaleSound.value = createSound(
          Howl,
          BREATH_PRACTICE_SOUNDS.exhale,
          'exhale',
          (id) => {
            activeSoundIds.exhale = id;
          }
        );
        holdSound.value = createSound(
          Howl,
          BREATH_PRACTICE_SOUNDS.hold,
          'hold',
          (id) => {
            activeSoundIds.hold = id;
          }
        );
        pauseSound.value = createSound(
          Howl,
          BREATH_PRACTICE_SOUNDS.pause,
          'pause',
          (id) => {
            activeSoundIds.pause = id;
          }
        );
      }
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

    // Останавливаем ровно по завершению fade через нативный Howler-эвент.
    // Раньше использовался setTimeout(fadeMs + 20), но это поддерживало
    // sound в состоянии _ended=false во время фейда, из-за чего параллельный
    // play() создавал новый Sound с новой HTMLAudioElement из html5 pool.
    // Теперь stop() вызывается как можно раньше — сразу после окончания fade,
    // и _sounds-слот Howl освобождается для переиспользования.
    const currentVolume = sound.volume(soundId);
    sound.once(
      'fade',
      () => {
        sound.stop(soundId);
      },
      soundId
    );
    sound.fade(currentVolume, 0, fadeMs, soundId);
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
    const version = cacheVersion;
    const ready = await ensureSounds(version);
    if (!ready) return;
    if (version !== cacheVersion) return;

    const sound = resolveSound(type);
    if (!sound) return;

    try {
      // Мгновенно останавливаем все активные cue перед следующим play().
      // Фейд-аут здесь создавал race condition на Android:
      // пока Howler держал старый Sound в состоянии _ended=false (идёт fade),
      // новый play() создавал новый Sound с НОВОЙ HTMLAudioElement-нодой
      // из html5 pool. Новая нода — без preload, и на Android .m4a файл
      // грузился с нуля перед воспроизведением. Если фаза короткая или
      // файл не успевал догрузиться — звук пропадал совсем.
      // Мгновенный stop переводит старый Sound в _ended=true, и следующий
      // play() переиспользует тот же самый HTMLAudioElement через Sound.reset().
      stopAll(0);
      const targetVolume = normalizeVolume(volume);
      const id = sound.play();
      activeSoundIds[type] = id;
      // Сразу ставим целевую громкость без fade-in:
      // на Android (html5: true) linearRampToValueAtTime ненадёжен —
      // звук стартовал на 0 и там и оставался.
      sound.volume(targetVolume, id);
    } catch (error) {
      console.error('[BreathAudio] Failed to play cue:', error);
    }
  }

  function release(): void {
    cacheVersion += 1;
    stopAll(0);

    for (const sound of [
      inhaleSound.value,
      exhaleSound.value,
      holdSound.value,
      pauseSound.value,
    ]) {
      if (!sound) continue;
      try {
        sound.unload();
      } catch (error) {
        console.error('[BreathAudio] Failed to unload cue sound:', error);
      }
    }

    inhaleSound.value = null;
    exhaleSound.value = null;
    holdSound.value = null;
    pauseSound.value = null;
  }

  return {
    playCue,
    prepare,
    stopAll,
    setVolume,
    release,
  };
}
