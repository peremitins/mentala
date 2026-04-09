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
  // persistentSoundIds — id первого (и единственного) Sound каждого Howl.
  // Мы запоминаем его сразу после первого sound.play() и на последующих
  // вызовах дёргаем sound.play(persistentId). Это принципиально:
  //   1) sound.play(id) идёт через Howl._soundById(id) и НЕ вызывает
  //      _inactiveSound() — значит Howler не пересоздаёт Sound и не
  //      берёт новый HTMLAudioElement из Howler._html5AudioPool.
  //   2) Sound.reset() (его вызывает _inactiveSound) генерирует новый
  //      _id = ++Howler._counter — поэтому нам нельзя дважды звать
  //      play() без id, иначе persistent id протухнет.
  //   3) Howl._drain() в html5-режиме splice'ит Sound из _sounds, но НЕ
  //      вызывает Howler._releaseHtml5Audio — каждая сдренированная нода
  //      навсегда утекает из глобального пула (10 штук по умолчанию).
  //      После того как пул истощён, _obtainHtml5Audio возвращает свежий
  //      new Audio(), который на Android/iOS ещё заблокирован → cue
  //      перестают звучать без ошибок. Это ровно симптом бага.
  // ids обнуляются только в release() (где мы явно вызываем unload).
  const persistentSoundIds: Record<BreathCueType, number | null> = {
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
    type: BreathCueType
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
      // pool оставляем дефолтным. Нам важно, что мы сами НИКОГДА не
      // вызываем sound.play() без id после первого раза — см. комментарий
      // к persistentSoundIds. Это гарантирует, что _inactiveSound не
      // срабатывает и _sounds всегда длины 1 без пересоздания Sound'ов.
      onplayerror: () => {
        // Ждём авто-unlock и переигрываем тот же самый Sound по persistent id,
        // а не через sound.play() без id. Иначе Howler пойдёт в
        // _inactiveSound → при первом вызове создаст новый Sound с новой
        // html5-нодой, а старый повиснет в _sounds неведомым orphan'ом,
        // который потом утечёт при drain (html5 Audio не возвращается в пул).
        sound.once('unlock', () => {
          try {
            const existingId = persistentSoundIds[type];
            if (existingId !== null) {
              sound.play(existingId);
              return;
            }
            const id = sound.play();
            if (typeof id === 'number') {
              persistentSoundIds[type] = id;
            }
          } catch (error) {
            console.error(`[BreathAudio] Failed to replay ${type}:`, error);
          }
        });
      },
      onloaderror: (_id, error) => {
        console.error(`[BreathAudio] Failed to load ${type}:`, error);
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
      // Утечки исчерпывают пул (10 нод по умолчанию), и новые play() падают молча.
      if (!inhaleSound.value) {
        const { Howl } = module;
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
        holdSound.value = createSound(
          Howl,
          BREATH_PRACTICE_SOUNDS.hold,
          'hold'
        );
        pauseSound.value = createSound(
          Howl,
          BREATH_PRACTICE_SOUNDS.pause,
          'pause'
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
    // setTimeout(fadeMs + 20) здесь плох: пока таймер не сработал, Sound
    // остаётся в _sounds с _ended=false. Если параллельно прилетит
    // playCue с тем же persistent id, sound.play(id) увидит `!sound._paused`
    // (см. howler.js:811) и просто вернёт id, НЕ перезапуская аудио.
    // Нативный 'fade'-эвент позволяет позвать stop(id) раньше и привести
    // Sound в paused-состояние к моменту следующего play(id).
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
    // ВАЖНО: persistentSoundIds НЕ обнуляем. Ids должны жить столько же,
    // сколько сами Howl-объекты (до release()/unload). Обнуление здесь
    // превратило бы следующий playCue в sound.play() без id, что вошло бы
    // в _inactiveSound → создание нового Sound → drain старого →
    // утечка HTMLAudioElement (см. комментарий к persistentSoundIds).
    stopSound(inhaleSound.value, persistentSoundIds.inhale, fadeMs);
    stopSound(exhaleSound.value, persistentSoundIds.exhale, fadeMs);
    stopSound(holdSound.value, persistentSoundIds.hold, fadeMs);
    stopSound(pauseSound.value, persistentSoundIds.pause, fadeMs);
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
    applyVolume(inhaleSound.value, persistentSoundIds.inhale, target);
    applyVolume(exhaleSound.value, persistentSoundIds.exhale, target);
    applyVolume(holdSound.value, persistentSoundIds.hold, target);
    applyVolume(pauseSound.value, persistentSoundIds.pause, target);
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
      // Мгновенно глушим все активные cue перед следующим play(). Фейд
      // нельзя: sound.play(persistentId) проверяет `!sound._paused` (см.
      // howler.js:811) — если Sound ещё играет (или идёт fade), повторный
      // play(id) вернёт id без реального воспроизведения. Моментальный stop
      // приводит Sound к paused+ended состоянию, и следующий play(id)
      // корректно перезапускает ту же ноду HTMLAudioElement.
      stopAll(0);
      const targetVolume = normalizeVolume(volume);

      const existingId = persistentSoundIds[type];
      let id: number | null;
      if (existingId !== null) {
        // Переиспользуем тот же Sound через _soundById → тот же _node.
        // Это обходит _inactiveSound, drain и утечку html5-аудионод.
        sound.play(existingId);
        id = existingId;
      } else {
        // Самый первый запуск этого cue: Howler создаст единственный Sound,
        // его id мы запоминаем на весь lifecycle Howl.
        const newId = sound.play();
        if (typeof newId === 'number') {
          persistentSoundIds[type] = newId;
          id = newId;
        } else {
          id = null;
        }
      }

      if (id !== null) {
        // Сразу ставим целевую громкость без fade-in:
        // на Android (html5: true) linearRampToValueAtTime ненадёжен —
        // звук стартовал на 0 и там и оставался.
        sound.volume(targetVolume, id);
      }
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

    // После unload() id'ы протухают — Howl.unload() освобождает _sounds
    // и возвращает _node в Howler._html5AudioPool через _releaseHtml5Audio.
    // Обнуляем, чтобы следующий ensureSounds → createSound завёл новые ids.
    persistentSoundIds.inhale = null;
    persistentSoundIds.exhale = null;
    persistentSoundIds.hold = null;
    persistentSoundIds.pause = null;
  }

  return {
    playCue,
    prepare,
    stopAll,
    setVolume,
    release,
  };
}
