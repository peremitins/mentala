import type { BreathPhase } from '@/app/lib/breathPracticesCatalog';
import { BREATH_PRACTICE_SOUNDS } from '@/app/lib/breathPracticeAudio';
import {
  BREATH_PRACTICE_VOICE_AUDIO,
  type BreathVoiceAddressing,
} from '@/app/lib/breathPracticeVoiceAudio';
import { isDocumentAvailable } from '@/app/utils/document';

type BreathContinuousAudioStart = {
  phases: BreathPhase[];
  addressing: BreathVoiceAddressing;
  soundEnabled: boolean;
  voiceEnabled: boolean;
  volume: number;
};

type RenderedCycleAudio = {
  url: string;
  durationSeconds: number;
};

type WindowWithAudioConstructors = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
    webkitOfflineAudioContext?: typeof OfflineAudioContext;
  };

const WAV_HEADER_BYTES = 44;
const WAV_BYTES_PER_SAMPLE = 2;
const CUE_VOLUME_BOOST = 1.35;
const TARGET_SAMPLE_RATE = 44_100;

const renderedCycleCache = new Map<string, RenderedCycleAudio>();

export function useBreathPracticeContinuousAudio() {
  // Единственный постоянный HTMLAudioElement на весь lifecycle плеера.
  // Принципиально не пересоздаём его на каждый запуск: на iOS Safari
  // элемент можно проигрывать программно только после того, как он хотя бы
  // раз стартовал внутри user gesture. Реальный цикл стартует через 3с
  // (после prep-отсчёта) — вне жеста, поэтому свежий new Audio() там бы
  // блокировался. Переиспользуя один «разблокированный» элемент, мы
  // подменяем ему src и зовём play() уже без жеста.
  let audioEl: HTMLAudioElement | null = null;
  let isPlaying = false;
  let unlocked = false;

  function canUseContinuousAudio() {
    if (import.meta.server) return false;
    if (!isDocumentAvailable()) return false;
    if (typeof window === 'undefined') return false;
    if (typeof Audio === 'undefined') return false;
    if (typeof Blob === 'undefined' || typeof URL === 'undefined') return false;
    return Boolean(getAudioContextCtor() && getOfflineAudioContextCtor());
  }

  function ensureAudioElement() {
    if (audioEl) return audioEl;
    if (typeof Audio === 'undefined') return null;
    const audio = new Audio();
    audio.preload = 'auto';
    audioEl = audio;
    return audio;
  }

  // Должен вызываться СИНХРОННО внутри user gesture (тап по кнопке play).
  // Проигрываем короткий тихий WAV (нулевые сэмплы, без mute — реальное
  // unmuted-воспроизведение надёжнее «благословляет» элемент на iOS) и сразу
  // ставим на паузу. После этого отложенный startLoop переиспользует тот же
  // элемент и iOS разрешает play() вне жеста.
  function unlock() {
    if (!canUseContinuousAudio()) return;
    if (unlocked) return;
    const audio = ensureAudioElement();
    if (!audio) return;

    try {
      audio.loop = false;
      audio.volume = 1;
      audio.src = getSilentUnlockUrl();
      const finalize = () => {
        try {
          audio.pause();
          audio.currentTime = 0;
        } catch {
          // элемент мог быть уже остановлен — игнорируем
        }
        unlocked = true;
      };
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise.then(finalize).catch((error) => {
          console.error(
            '[BreathContinuousAudio] Не удалось разблокировать audio:',
            error
          );
        });
      } else {
        finalize();
      }
    } catch (error) {
      console.error(
        '[BreathContinuousAudio] Ошибка разблокировки audio:',
        error
      );
    }
  }

  async function startLoop(payload: BreathContinuousAudioStart) {
    stopAll();
    if (!canUseContinuousAudio()) return null;
    if (!payload.soundEnabled && !payload.voiceEnabled) return null;

    try {
      const cycle = await getOrCreateRenderedCycle(payload);
      const audio = ensureAudioElement();
      if (!audio) return null;
      audio.src = cycle.url;
      audio.loop = true;
      audio.preload = 'auto';
      audio.volume = 1;
      audio.currentTime = 0;

      await audio.play();
      isPlaying = true;
      return Date.now();
    } catch (error) {
      stopAll();
      console.error(
        '[BreathContinuousAudio] Не удалось запустить continuous audio:',
        error
      );
      return null;
    }
  }

  async function pauseSession() {
    audioEl?.pause();
  }

  async function resumeSession() {
    if (!audioEl) return;
    try {
      await audioEl.play();
    } catch (error) {
      console.error(
        '[BreathContinuousAudio] Не удалось возобновить continuous audio:',
        error
      );
    }
  }

  function stopAll() {
    isPlaying = false;
    if (!audioEl) return;

    try {
      audioEl.pause();
      audioEl.currentTime = 0;
    } catch (error) {
      console.error(
        '[BreathContinuousAudio] Не удалось остановить continuous audio:',
        error
      );
    }
    // ВАЖНО: не обнуляем audioEl и не сбрасываем unlocked — сохраняем
    // «разблокировку» iOS, иначе следующий запуск снова потребует двойного тапа.
  }

  function setVolume(level: number) {
    if (!audioEl) return;
    audioEl.volume = normalizeVolume(level);
  }

  function isActive() {
    return isPlaying;
  }

  function release() {
    stopAll();
    if (audioEl) {
      try {
        audioEl.src = '';
      } catch {
        // игнорируем
      }
    }
    audioEl = null;
    unlocked = false;
    if (silentUnlockUrl) {
      URL.revokeObjectURL(silentUnlockUrl);
      silentUnlockUrl = null;
    }
    for (const rendered of renderedCycleCache.values()) {
      URL.revokeObjectURL(rendered.url);
    }
    renderedCycleCache.clear();
  }

  return {
    unlock,
    startLoop,
    pauseSession,
    resumeSession,
    stopAll,
    setVolume,
    isActive,
    release,
  };
}

// Ленивая генерация короткого тихого WAV для iOS-unlock. Кэшируем url,
// чтобы не плодить blob'ы; revoke в release().
let silentUnlockUrl: string | null = null;

function getSilentUnlockUrl() {
  if (silentUnlockUrl) return silentUnlockUrl;

  const sampleRate = 8_000;
  const sampleCount = Math.floor(sampleRate * 0.1); // 0.1с тишины
  const dataBytes = sampleCount * WAV_BYTES_PER_SAMPLE; // моно
  const arrayBuffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes);
  const view = new DataView(arrayBuffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); // моно
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * WAV_BYTES_PER_SAMPLE, true);
  view.setUint16(32, WAV_BYTES_PER_SAMPLE, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);
  // data-секция уже заполнена нулями = тишина.

  silentUnlockUrl = URL.createObjectURL(
    new Blob([arrayBuffer], { type: 'audio/wav' })
  );
  return silentUnlockUrl;
}

async function getOrCreateRenderedCycle(
  payload: BreathContinuousAudioStart
): Promise<RenderedCycleAudio> {
  const cacheKey = buildCycleCacheKey(payload);
  const cached = renderedCycleCache.get(cacheKey);
  if (cached) return cached;

  const rendered = await renderCycleAudio(payload);
  renderedCycleCache.set(cacheKey, rendered);
  return rendered;
}

function buildCycleCacheKey(payload: BreathContinuousAudioStart) {
  const phasesKey = payload.phases
    .map((phase) => `${phase.type}:${phase.cue}:${phase.seconds}`)
    .join('|');
  return [
    phasesKey,
    payload.addressing,
    payload.soundEnabled ? 'sound:on' : 'sound:off',
    payload.voiceEnabled ? 'voice:on' : 'voice:off',
    `volume:${normalizeCueVolume(payload.volume).toFixed(3)}`,
  ].join(';');
}

async function renderCycleAudio(
  payload: BreathContinuousAudioStart
): Promise<RenderedCycleAudio> {
  const OfflineCtor = getOfflineAudioContextCtor();
  if (!OfflineCtor) {
    throw new Error('OfflineAudioContext is not available');
  }

  const durationSeconds = getCycleDurationSeconds(payload.phases);
  const frameCount = Math.max(
    1,
    Math.ceil(durationSeconds * TARGET_SAMPLE_RATE)
  );
  const context = new OfflineCtor(2, frameCount, TARGET_SAMPLE_RATE);
  const cueVolume = normalizeCueVolume(payload.volume);

  const bufferCache = new Map<string, AudioBuffer>();
  let phaseStartsAt = 0;
  let scheduledBufferCount = 0;

  for (const phase of payload.phases) {
    const phaseDuration = Math.max(0, phase.seconds);

    if (payload.soundEnabled) {
      const cuePath = BREATH_PRACTICE_SOUNDS[phase.cue];
      const cueBuffer = await getDecodedBuffer(context, cuePath, bufferCache);
      if (cueBuffer) {
        scheduleLoopedBuffer(
          context,
          cueBuffer,
          phaseStartsAt,
          phaseDuration,
          cueVolume
        );
        scheduledBufferCount += 1;
      }
    }

    if (payload.voiceEnabled) {
      const voicePath =
        BREATH_PRACTICE_VOICE_AUDIO[payload.addressing][phase.type];
      const voiceBuffer = await getDecodedBuffer(
        context,
        voicePath,
        bufferCache
      );
      if (voiceBuffer) {
        scheduleOneShotBuffer(context, voiceBuffer, phaseStartsAt, 1);
        scheduledBufferCount += 1;
      }
    }

    phaseStartsAt += phaseDuration;
  }

  if (scheduledBufferCount === 0) {
    throw new Error('No breath audio buffers were decoded');
  }

  const renderedBuffer = await context.startRendering();
  const blob = audioBufferToWavBlob(renderedBuffer);
  return {
    url: URL.createObjectURL(blob),
    durationSeconds,
  };
}

async function getDecodedBuffer(
  context: OfflineAudioContext,
  path: string,
  bufferCache: Map<string, AudioBuffer>
) {
  const cached = bufferCache.get(path);
  if (cached) return cached;

  try {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.arrayBuffer();
    const buffer = await context.decodeAudioData(data.slice(0));
    bufferCache.set(path, buffer);
    return buffer;
  } catch (error) {
    console.error(
      `[BreathContinuousAudio] Не удалось декодировать ${path}:`,
      error
    );
    return null;
  }
}

function scheduleLoopedBuffer(
  context: OfflineAudioContext,
  buffer: AudioBuffer,
  startsAt: number,
  durationSeconds: number,
  volume: number
) {
  if (durationSeconds <= 0 || buffer.duration <= 0) return;

  let cursor = startsAt;
  let remaining = durationSeconds;

  while (remaining > 0) {
    const sliceDuration = Math.min(buffer.duration, remaining);
    scheduleOneShotBuffer(context, buffer, cursor, volume, sliceDuration);
    cursor += sliceDuration;
    remaining -= sliceDuration;
  }
}

function scheduleOneShotBuffer(
  context: OfflineAudioContext,
  buffer: AudioBuffer,
  startsAt: number,
  volume: number,
  durationSeconds?: number
) {
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  gain.gain.value = normalizeVolume(volume);
  source.connect(gain);
  gain.connect(context.destination);
  source.start(startsAt, 0, durationSeconds);
}

function getAudioContextCtor() {
  if (typeof window === 'undefined') return null;
  const target = window as WindowWithAudioConstructors;
  return target.AudioContext || target.webkitAudioContext || null;
}

function getOfflineAudioContextCtor() {
  if (typeof window === 'undefined') return null;
  const target = window as WindowWithAudioConstructors;
  return target.OfflineAudioContext || target.webkitOfflineAudioContext || null;
}

function getCycleDurationSeconds(phases: BreathPhase[]) {
  return phases.reduce((total, phase) => total + Math.max(0, phase.seconds), 0);
}

function normalizeVolume(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function normalizeCueVolume(value: number) {
  return normalizeVolume(value) * CUE_VOLUME_BOOST > 1
    ? 1
    : normalizeVolume(value) * CUE_VOLUME_BOOST;
}

function audioBufferToWavBlob(buffer: AudioBuffer) {
  const channelCount = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const sampleCount = buffer.length;
  const dataBytes = sampleCount * channelCount * WAV_BYTES_PER_SAMPLE;
  const arrayBuffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes);
  const view = new DataView(arrayBuffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * WAV_BYTES_PER_SAMPLE, true);
  view.setUint16(32, channelCount * WAV_BYTES_PER_SAMPLE, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = WAV_HEADER_BYTES;
  const channels = Array.from({ length: channelCount }, (_, channelIndex) =>
    buffer.getChannelData(channelIndex)
  );

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const sample = Math.max(
        -1,
        Math.min(1, channels[channelIndex][sampleIndex])
      );
      view.setInt16(
        offset,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true
      );
      offset += WAV_BYTES_PER_SAMPLE;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}
