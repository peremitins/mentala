import { computed, ref } from 'vue';
import { isDocumentAvailable } from '@/app/utils/document';
import { resolveMediaUrl } from '@/app/utils/media';
import type { MeditationTrackDto } from '@/shared/dto/meditations';

const FADE_IN_MS = 1500;
const FADE_OUT_MS = 2500;
const PAUSE_FADE_MS = 600;
const QUICK_STOP_FADE_MS = 80;
const TICK_MS = 500;
const LOOP_THRESHOLD_SEC = 0.12; // небольшой зазор перед концом для мгновенного рестарта
const LOOP_REARM_SEC = 0.3; // окно, в котором разрешаем снова сработать триггер
const AUDIO_SESSION_PLAYBACK = 'playback';
// Максимальный размер файла для WebAudio на мобильных (50MB)
const MAX_WEB_AUDIO_SIZE_MB = 50;

function getUserAgent() {
  if (typeof navigator === 'undefined') return '';
  return navigator.userAgent || '';
}

function isMobileUserAgent() {
  const ua = getUserAgent();
  if (!ua) return false;
  return /iphone|ipad|ipod|android/i.test(ua);
}

function isIosUserAgent() {
  const ua = getUserAgent();
  if (!ua) return false;
  return /iphone|ipad|ipod/i.test(ua);
}

// Таймаут загрузки аудио файла (30 секунд для мобильных, 15 для десктопа)
function getAudioLoadTimeout() {
  return isMobileUserAgent() ? 30000 : 15000;
}

type PlaybackMode = 'html' | 'webaudio';
type PendingGesturePlay = {
  track: MeditationTrackDto;
  timerMinutes?: number | null;
};

function shouldPreferWebAudio(track: MeditationTrackDto) {
  if (!track?.isLoop) {
    // Для не-loop треков всегда используем HTML Audio (более эффективно для больших файлов)
    return false;
  }
  // Для бесшовного лупа используем WebAudio, если доступен.
  // Но на мобильных для больших файлов лучше использовать HTML Audio
  if (
    isMobileUserAgent() &&
    track.durationSeconds &&
    track.durationSeconds > 300
  ) {
    // Для файлов больше 5 минут на мобильных используем HTML Audio
    return false;
  }
  return isWebAudioAvailable();
}

const globalState = {
  audio: null as HTMLAudioElement | null,
  playbackMode: null as PlaybackMode | null,
  audioContext: null as AudioContext | null,
  audioBuffer: null as AudioBuffer | null,
  audioSource: null as AudioBufferSourceNode | null,
  audioGain: null as GainNode | null,
  audioBufferUrl: '',
  webAudioStartTime: 0,
  webAudioOffset: 0,
  currentTrack: ref<MeditationTrackDto | null>(null),
  isPlaying: ref(false),
  isBuffering: ref(false),
  pendingGesturePlay: null as PendingGesturePlay | null,
  gestureUnlockCleanup: null as (() => void) | null,
  globalUnlockCleanup: null as (() => void) | null,
  // По умолчанию повтор трека включён.
  isRepeating: ref(true),
  currentTime: ref(0),
  duration: ref(0),
  timerMinutes: ref<number | null>(null),
  timerEndsAt: ref<number | null>(null),
  timerRemainingMs: ref<number | null>(null),
  // Выбранная длительность таймера, сохраняется между треками. По умолчанию 30 минут.
  preferredTimerMinutes: ref<number | null>(30),
  sessionEnded: ref(false),
  playbackAllowed: ref(true),
  queueIds: ref<string[]>([]),
  queueKey: ref<string | null>(null),
  fadeInterval: null as ReturnType<typeof setInterval> | null,
  progressInterval: null as ReturnType<typeof setInterval> | null,
  timerInterval: null as ReturnType<typeof setInterval> | null,
  // Флаг, что пользователь уже разрешил запуск WebAudio.
  audioUnlocked: false,
  playbackActionId: 0,
  loopResetTriggered: false,
  visibilityBound: false,
  appStateBound: false,
  audioContextPrimed: false,
  audioContextRecoveryInProgress: false,
};

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  return (
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext ||
    null
  );
}

function isWebAudioAvailable() {
  return isDocumentAvailable() && Boolean(getAudioContextCtor());
}

function clearGestureUnlock() {
  if (globalState.gestureUnlockCleanup) {
    globalState.gestureUnlockCleanup();
    globalState.gestureUnlockCleanup = null;
  }
  globalState.pendingGesturePlay = null;
}

type ExtendedAudioContextState = AudioContextState | 'interrupted';
type NavigatorWithAudioSession = Navigator & {
  audioSession?: {
    type?: string;
  };
};

function getAudioContextState(
  context: AudioContext
): ExtendedAudioContextState {
  return context.state as ExtendedAudioContextState;
}

function ensurePlaybackAudioSessionType() {
  if (typeof navigator === 'undefined') return;
  const session = (navigator as NavigatorWithAudioSession).audioSession;
  if (!session) return;
  try {
    if (session.type !== AUDIO_SESSION_PLAYBACK) {
      session.type = AUDIO_SESSION_PLAYBACK;
    }
  } catch {
    // В старых WebView API может отсутствовать или быть read-only.
  }
}

async function ensureAudioContextRunning(context: AudioContext) {
  if (getAudioContextState(context) === 'running') return true;
  try {
    await context.resume();
  } catch {
    return false;
  }
  return getAudioContextState(context) === 'running';
}

async function primeAudioContext(context: AudioContext) {
  if (!isIosUserAgent()) return;
  if (globalState.audioContextPrimed) return;
  // Тихий короткий старт прогревает аудиопайплайн на первом запуске.
  const buffer = context.createBuffer(1, 1, 22050);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start(0);
  source.stop(context.currentTime + 0.001);
  globalState.audioContextPrimed = true;
}

async function setPlaybackAllowed(allowed: boolean) {
  globalState.playbackAllowed.value = allowed;
  if (allowed) return;
  // На публичных экранах полностью блокируем запуск звука и очищаем очередь.
  clearGestureUnlock();
  await stop(false);
}

async function unlockAudioContext(): Promise<boolean> {
  if (!isDocumentAvailable() || typeof window === 'undefined') return false;
  const context = ensureAudioContext();
  if (!context) return false;
  ensurePlaybackAudioSessionType();

  const running = await ensureAudioContextRunning(context);
  if (running) {
    await primeAudioContext(context);
    globalState.audioUnlocked = true;
    return true;
  }
  return false;
}

function ensureGlobalGestureUnlock() {
  if (!isDocumentAvailable() || typeof window === 'undefined') return;
  if (globalState.audioUnlocked) return;
  if (globalState.globalUnlockCleanup) return;

  const handler = () => {
    ensurePlaybackAudioSessionType();
    void (async () => {
      // WebAudio можно резюмить только после пользовательского жеста.
      const unlocked = await unlockAudioContext();
      if (!unlocked) return;

      const pending = globalState.pendingGesturePlay;
      if (pending) {
        clearGestureUnlock();
        await play(pending.track, pending.timerMinutes ?? null);
      }

      if (globalState.globalUnlockCleanup) {
        globalState.globalUnlockCleanup();
        globalState.globalUnlockCleanup = null;
      }
    })();
  };

  const options: AddEventListenerOptions = { passive: true };
  window.addEventListener('pointerdown', handler, options);
  window.addEventListener('touchstart', handler, options);
  window.addEventListener('keydown', handler);

  globalState.globalUnlockCleanup = () => {
    window.removeEventListener('pointerdown', handler, options);
    window.removeEventListener('touchstart', handler, options);
    window.removeEventListener('keydown', handler);
  };
}

function scheduleGestureUnlock(
  track: MeditationTrackDto,
  timerMinutes?: number | null
) {
  if (!isDocumentAvailable() || typeof window === 'undefined') return;
  if (!globalState.playbackAllowed.value) return;
  clearGestureUnlock();
  ensureGlobalGestureUnlock();

  globalState.pendingGesturePlay = { track, timerMinutes };

  const handler = () => {
    ensurePlaybackAudioSessionType();
    void (async () => {
      const pending = globalState.pendingGesturePlay;
      clearGestureUnlock();
      if (!pending) return;
      await unlockAudioContext();
      // Стартуем по первому пользовательскому жесту.
      await play(pending.track, pending.timerMinutes ?? null);
    })();
  };

  const options: AddEventListenerOptions = { passive: true };
  window.addEventListener('pointerdown', handler, options);
  window.addEventListener('touchstart', handler, options);
  window.addEventListener('keydown', handler);

  globalState.gestureUnlockCleanup = () => {
    window.removeEventListener('pointerdown', handler, options);
    window.removeEventListener('touchstart', handler, options);
    window.removeEventListener('keydown', handler);
  };
}

async function attemptHtmlPlayback(audio: HTMLAudioElement) {
  let onPlaying: (() => void) | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    const playPromise = audio.play();
    if (!playPromise) return { started: true };

    const playingPromise = new Promise<'playing'>((resolve) => {
      onPlaying = () => resolve('playing');
      audio.addEventListener('playing', onPlaying, { once: true });
    });

    const timeoutMs = getAudioLoadTimeout();
    const timeoutPromise = new Promise<'timeout'>((resolve) => {
      timeoutId = setTimeout(() => resolve('timeout'), timeoutMs);
    });

    const result = await Promise.race([
      playPromise.then(() => 'started' as const),
      playingPromise,
      timeoutPromise,
    ]);

    if (result === 'timeout') {
      try {
        audio.pause();
      } catch {
        // Игнорируем, если уже не играет
      }
      return { started: false, timedOut: true };
    }

    return { started: true };
  } catch (error) {
    return { started: false, error };
  } finally {
    if (onPlaying) {
      audio.removeEventListener('playing', onPlaying);
    }
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function isAutoplayBlockedError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const name = (error as { name?: string }).name || '';
  const message = String(
    (error as { message?: string }).message || ''
  ).toLowerCase();
  return (
    name === 'NotAllowedError' ||
    message.includes('not allowed') ||
    message.includes('user gesture') ||
    message.includes('user interaction')
  );
}

function ensureAudioContext(): AudioContext | null {
  const ctor = getAudioContextCtor();
  if (!ctor) return null;
  if (!globalState.audioContext) {
    const context = new ctor();
    context.onstatechange = () => {
      if (globalState.audioContext !== context) return;
      if (globalState.playbackMode !== 'webaudio') return;
      if (!globalState.isPlaying.value) return;
      if (getAudioContextState(context) === 'running') return;
      void maybeRecoverWebAudioPlayback();
    };
    globalState.audioContext = context;
    globalState.audioContextPrimed = false;
  }
  return globalState.audioContext;
}

async function maybeRecoverWebAudioPlayback() {
  if (globalState.playbackMode !== 'webaudio') return;
  if (!globalState.isPlaying.value) return;
  if (globalState.audioContextRecoveryInProgress) return;
  const context = globalState.audioContext;
  if (!context) return;

  globalState.audioContextRecoveryInProgress = true;
  try {
    ensurePlaybackAudioSessionType();
    const running = await ensureAudioContextRunning(context);
    if (!running) return;
    if (!globalState.audioSource && globalState.audioBuffer) {
      createWebAudioSource(globalState.webAudioOffset);
    }
  } finally {
    globalState.audioContextRecoveryInProgress = false;
  }
}

function handleVisibilityChange() {
  if (!isDocumentAvailable() || typeof document === 'undefined') return;
  if (document.visibilityState !== 'visible') return;
  void maybeRecoverWebAudioPlayback();
}

function ensureVisibilityListener() {
  if (!isDocumentAvailable() || typeof document === 'undefined') return;
  if (globalState.visibilityBound) return;
  document.addEventListener('visibilitychange', handleVisibilityChange);
  globalState.visibilityBound = true;
}

function ensureAppStateListener() {
  if (globalState.appStateBound) return;
  globalState.appStateBound = true;
  import('@capacitor/app')
    .then(({ App }) => {
      App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) return;
        void maybeRecoverWebAudioPlayback();
      });
    })
    .catch(() => {
      // На Web fallback уже закрыт visibilitychange.
    });
}

function ensureAudioGain(context: AudioContext): GainNode {
  if (!globalState.audioGain) {
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(context.destination);
    globalState.audioGain = gain;
  }
  return globalState.audioGain;
}

async function loadAudioBuffer(
  url: string,
  context: AudioContext
): Promise<AudioBuffer> {
  // Загружаем и декодируем аудио для точного лупа без зазоров.
  // Добавляем таймаут для предотвращения зависания на мобильных
  const controller = new AbortController();
  const timeoutMs = getAudioLoadTimeout();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to load audio: ${response.status}`);
    }

    // Проверяем размер файла перед загрузкой на мобильных
    const contentLength = response.headers.get('content-length');
    if (contentLength && isMobileUserAgent()) {
      const sizeMB = parseInt(contentLength, 10) / (1024 * 1024);
      if (sizeMB > MAX_WEB_AUDIO_SIZE_MB) {
        throw new Error(
          `Audio file too large for mobile: ${sizeMB.toFixed(2)}MB`
        );
      }
    }

    const arrayBuffer = await response.arrayBuffer();

    // Дополнительная проверка размера после загрузки
    if (isMobileUserAgent()) {
      const sizeMB = arrayBuffer.byteLength / (1024 * 1024);
      if (sizeMB > MAX_WEB_AUDIO_SIZE_MB) {
        throw new Error(
          `Audio buffer too large for mobile: ${sizeMB.toFixed(2)}MB`
        );
      }
    }

    return await context.decodeAudioData(arrayBuffer);
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Audio load timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

async function prepareWebAudioTrack(
  track: MeditationTrackDto
): Promise<AudioBuffer | null> {
  if (!globalState.audioUnlocked) {
    // Не создаём контекст до первого жеста, чтобы избежать autoplay-ошибок.
    return null;
  }

  const context = ensureAudioContext();
  if (!context) return null;
  ensurePlaybackAudioSessionType();

  const running = await ensureAudioContextRunning(context);
  if (!running) {
    return null;
  }
  await primeAudioContext(context);

  const url = resolveMediaUrl(track.audioPath);
  if (!url) return null;
  if (!globalState.audioBuffer || globalState.audioBufferUrl !== url) {
    globalState.audioBuffer = await loadAudioBuffer(url, context);
    globalState.audioBufferUrl = url;
  }

  ensureAudioGain(context);
  // Буфер кэшируем, а состояние трека выставляем только после проверки актуальности.
  return globalState.audioBuffer;
}

function stopWebAudioSource() {
  if (!globalState.audioSource) return;
  try {
    globalState.audioSource.stop();
  } catch {
    // Если источник уже остановлен — просто чистим состояние.
  }
  globalState.audioSource.disconnect();
  globalState.audioSource = null;
  globalState.webAudioStartTime = 0;
}

function stopDetachedAudio(audio: HTMLAudioElement) {
  // Останавливаем "осиротевший" audio, не трогая глобальное состояние.
  try {
    audio.pause();
  } catch {
    // Если элемент уже остановлен — ничего не делаем.
  }
}

function stopDetachedWebAudio(source: AudioBufferSourceNode) {
  // Аналогично для Web Audio, чтобы не пересекаться с актуальным плеером.
  try {
    source.stop();
  } catch {
    // Источник мог уже остановиться.
  }
  try {
    source.disconnect();
  } catch {
    // На всякий случай игнорируем повторное отключение.
  }
}

function updateWebAudioOffset() {
  const context = globalState.audioContext;
  const buffer = globalState.audioBuffer;
  if (!context || !buffer) return;
  const elapsed = Math.max(
    0,
    context.currentTime - globalState.webAudioStartTime
  );
  const total = globalState.webAudioOffset + elapsed;
  const duration = buffer.duration || 0;
  globalState.webAudioOffset = duration ? total % duration : total;
}

function getWebAudioCurrentTime(): number {
  const context = globalState.audioContext;
  const buffer = globalState.audioBuffer;
  if (!context || !buffer) return 0;
  if (!globalState.isPlaying.value || !globalState.audioSource) {
    return globalState.webAudioOffset;
  }
  const elapsed = Math.max(
    0,
    context.currentTime - globalState.webAudioStartTime
  );
  const total = globalState.webAudioOffset + elapsed;
  const duration = buffer.duration || 0;
  const isLooping =
    Boolean(globalState.currentTrack.value?.isLoop) ||
    globalState.isRepeating.value;
  if (duration && isLooping) {
    return total % duration;
  }
  return Math.min(total, duration);
}

function createWebAudioSource(
  offsetSeconds: number
): AudioBufferSourceNode | null {
  const context = globalState.audioContext;
  const buffer = globalState.audioBuffer;
  const gain = globalState.audioGain;
  if (!context || !buffer || !gain) return null;

  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop =
    Boolean(globalState.currentTrack.value?.isLoop) ||
    globalState.isRepeating.value;
  if (buffer.duration > 0) {
    source.loopStart = 0;
    source.loopEnd = buffer.duration;
  }
  source.connect(gain);
  source.onended = () => {
    if (globalState.audioSource !== source) return;
    const isLooping =
      Boolean(globalState.currentTrack.value?.isLoop) ||
      globalState.isRepeating.value;
    if (isLooping) {
      // Если loop-источник неожиданно завершился (часто после iOS interruption),
      // сохраняем позицию и пытаемся восстановить звук.
      updateWebAudioOffset();
      globalState.audioSource = null;
      void maybeRecoverWebAudioPlayback();
      return;
    }
    globalState.isPlaying.value = false;
    clearTimer();
    globalState.currentTime.value = 0;
  };

  globalState.audioSource = source;
  globalState.webAudioStartTime = context.currentTime;
  const safeOffset = Math.min(Math.max(0, offsetSeconds), buffer.duration || 0);
  source.start(0, safeOffset);
  return source;
}

function clearIntervalSafe(timer: ReturnType<typeof setInterval> | null) {
  if (!timer) return;
  clearInterval(timer);
}

function stopIntervals() {
  clearIntervalSafe(globalState.fadeInterval);
  clearIntervalSafe(globalState.progressInterval);
  clearIntervalSafe(globalState.timerInterval);
  globalState.fadeInterval = null;
  globalState.progressInterval = null;
  globalState.timerInterval = null;
  resetLoopGuard();
}

function resetProgress() {
  globalState.currentTime.value = 0;
  globalState.duration.value = 0;
}

function resetLoopGuard() {
  globalState.loopResetTriggered = false;
}

function bumpPlaybackActionId() {
  globalState.playbackActionId += 1;
  return globalState.playbackActionId;
}

function isPlaybackActionActive(actionId: number) {
  return globalState.playbackActionId === actionId;
}

function getPlaybackSnapshot() {
  if (globalState.playbackMode === 'webaudio') {
    const duration = globalState.audioBuffer?.duration ?? 0;
    const current = globalState.isPlaying.value
      ? getWebAudioCurrentTime()
      : globalState.webAudioOffset;
    return { current, duration };
  }
  const audio = globalState.audio;
  if (!audio) return { current: 0, duration: 0 };
  return {
    current: audio.currentTime || 0,
    duration: Number.isFinite(audio.duration) ? audio.duration : 0,
  };
}

function startProgressTracking() {
  clearIntervalSafe(globalState.progressInterval);
  globalState.progressInterval = setInterval(() => {
    const snapshot = getPlaybackSnapshot();
    globalState.currentTime.value = snapshot.current;
    globalState.duration.value = snapshot.duration;
  }, TICK_MS);
}

function handleGaplessLoop(audio: HTMLAudioElement) {
  if (globalState.playbackMode !== 'html') return;
  // Для loop-треков используем Web Audio, чтобы не резать хвост вручную.
  if (globalState.currentTrack.value?.isLoop) return;
  const isLooping = globalState.isRepeating.value || audio.loop;
  if (!isLooping) return;
  if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;

  const remaining = audio.duration - audio.currentTime;
  // Мгновенно перезапускаем трек перед концом, чтобы убрать слышимый зазор
  if (remaining <= LOOP_THRESHOLD_SEC && !globalState.loopResetTriggered) {
    globalState.loopResetTriggered = true;
    audio.currentTime = 0;
    void audio.play();
    return;
  }
  // После начала следующего цикла возвращаем возможность снова сработать
  if (audio.currentTime <= LOOP_REARM_SEC) {
    globalState.loopResetTriggered = false;
  }
}

async function fadeTo(targetVolume: number, durationMs: number) {
  if (globalState.playbackMode === 'webaudio') {
    const context = globalState.audioContext;
    const gain = globalState.audioGain;
    if (!context || !gain) return;
    const now = context.currentTime;
    const durationSec = durationMs / 1000;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(targetVolume, now + durationSec);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, durationMs);
    });
    return;
  }

  const audio = globalState.audio;
  if (!audio) return;

  clearIntervalSafe(globalState.fadeInterval);

  const startVolume = audio.volume;
  const steps = Math.max(1, Math.floor(durationMs / 50));
  const delta = (targetVolume - startVolume) / steps;
  let step = 0;

  await new Promise<void>((resolve) => {
    globalState.fadeInterval = setInterval(() => {
      step += 1;
      const nextVolume = Math.min(1, Math.max(0, startVolume + delta * step));
      audio.volume = nextVolume;

      if (step >= steps) {
        clearIntervalSafe(globalState.fadeInterval);
        globalState.fadeInterval = null;
        resolve();
      }
    }, durationMs / steps);
  });
}

function updateTimerRemaining() {
  if (!globalState.timerEndsAt.value) {
    globalState.timerRemainingMs.value = null;
    return;
  }
  globalState.timerRemainingMs.value = Math.max(
    0,
    globalState.timerEndsAt.value - Date.now()
  );
}

async function onTimerFinished() {
  globalState.sessionEnded.value = true;
  // При завершении таймера останавливаем мгновенно без fade,
  // чтобы исключить продолжение воспроизведения.
  await stop(false);
}

function startTimerCountdown() {
  clearIntervalSafe(globalState.timerInterval);
  globalState.timerInterval = setInterval(() => {
    updateTimerRemaining();
    if (
      globalState.timerRemainingMs.value !== null &&
      globalState.timerRemainingMs.value <= 0
    ) {
      void onTimerFinished();
    }
  }, TICK_MS);
}

function clearTimer() {
  globalState.timerMinutes.value = null;
  globalState.timerEndsAt.value = null;
  globalState.timerRemainingMs.value = null;
  clearIntervalSafe(globalState.timerInterval);
  globalState.timerInterval = null;
}

function setPreferredTimer(minutes: number | null) {
  globalState.preferredTimerMinutes.value = minutes;
}

function setTimer(minutes: number | null) {
  if (!minutes) {
    setPreferredTimer(null);
    clearTimer();
    return;
  }
  setPreferredTimer(minutes);
  globalState.timerMinutes.value = minutes;
  globalState.timerRemainingMs.value = minutes * 60 * 1000;
  globalState.timerEndsAt.value =
    Date.now() + globalState.timerRemainingMs.value;
  startTimerCountdown();
}

function pauseTimer() {
  updateTimerRemaining();
  globalState.timerEndsAt.value = null;
  clearIntervalSafe(globalState.timerInterval);
  globalState.timerInterval = null;
}

function resumeTimer() {
  if (!globalState.timerRemainingMs.value) return;
  globalState.timerEndsAt.value =
    Date.now() + globalState.timerRemainingMs.value;
  startTimerCountdown();
}

async function stop(
  withFade = true,
  options: { keepActionId?: boolean; quickFadeMs?: number } = {}
) {
  if (!options.keepActionId) {
    bumpPlaybackActionId();
  }
  clearGestureUnlock();
  globalState.isBuffering.value = false;
  if (globalState.playbackMode === 'webaudio') {
    if (withFade) {
      await fadeTo(0, FADE_OUT_MS);
    } else if (options.quickFadeMs) {
      // Быстро приглушаем, чтобы избежать щелчка при смене трека.
      await fadeTo(0, options.quickFadeMs);
    }
    stopWebAudioSource();
    globalState.webAudioOffset = 0;
  } else {
    const audio = globalState.audio;
    if (audio) {
      if (withFade) {
        await fadeTo(0, FADE_OUT_MS);
      } else if (options.quickFadeMs) {
        // Быстро приглушаем, чтобы избежать щелчка при смене трека.
        await fadeTo(0, options.quickFadeMs);
      }
      audio.pause();
      audio.currentTime = 0;
      audio.onended = null;
      audio.onerror = null;
      audio.onloadedmetadata = null;
      audio.ontimeupdate = null;
    }
  }

  globalState.audio = null;
  globalState.isPlaying.value = false;
  globalState.currentTrack.value = null;
  globalState.playbackMode = null;

  // Очищаем WebAudio буферы для освобождения памяти (критично для мобильных)
  if (isMobileUserAgent()) {
    globalState.audioBuffer = null;
    globalState.audioBufferUrl = '';
    globalState.webAudioOffset = 0;
  }

  stopIntervals();
  clearTimer();
  resetProgress();
}

async function pause() {
  bumpPlaybackActionId();
  clearGestureUnlock();
  globalState.isBuffering.value = false;
  if (globalState.playbackMode === 'webaudio') {
    if (!globalState.audioSource) return;
    await fadeTo(0, PAUSE_FADE_MS);
    updateWebAudioOffset();
    stopWebAudioSource();
    globalState.isPlaying.value = false;
    pauseTimer();
    return;
  }

  const audio = globalState.audio;
  if (!audio) return;
  await fadeTo(0, PAUSE_FADE_MS);
  audio.pause();
  globalState.isPlaying.value = false;
  pauseTimer();
}

async function play(track: MeditationTrackDto, timerMinutes?: number | null) {
  if (!isDocumentAvailable()) return;
  if (!globalState.playbackAllowed.value) {
    // Защита от автозапуска на публичных маршрутах.
    clearGestureUnlock();
    globalState.isBuffering.value = false;
    return;
  }

  const actionId = bumpPlaybackActionId();
  const isActionActive = () => isPlaybackActionActive(actionId);
  clearGestureUnlock();
  ensureGlobalGestureUnlock();
  ensureVisibilityListener();
  ensureAppStateListener();
  ensurePlaybackAudioSessionType();

  resetLoopGuard();

  const sameTrack = globalState.currentTrack.value?.id === track.id;
  // Для бесконечных эмбиентов включаем Web Audio, чтобы убрать паузу на лупе.
  const preferWebAudio = shouldPreferWebAudio(track);
  let mode: PlaybackMode = preferWebAudio ? 'webaudio' : 'html';

  // Для больших не-loop файлов на мобильных принудительно используем HTML Audio
  if (
    mode === 'webaudio' &&
    isMobileUserAgent() &&
    !track.isLoop &&
    track.durationSeconds &&
    track.durationSeconds > 300
  ) {
    console.warn(
      '[MeditationPlayer] Large non-loop file detected, forcing HTML Audio on mobile:',
      {
        trackId: track.id,
        duration: track.durationSeconds,
      }
    );
    mode = 'html';
  }

  const shouldUseWebAudio = mode === 'webaudio' && isWebAudioAvailable();
  if (shouldUseWebAudio) {
    const unlocked = await unlockAudioContext();
    if (!unlocked) {
      // Для лупов не падаем на HTML, чтобы не было слышимого шва.
      globalState.isPlaying.value = false;
      globalState.isBuffering.value = false;
      scheduleGestureUnlock(track, timerMinutes ?? null);
      return;
    }
  }

  if (!sameTrack || globalState.playbackMode !== mode) {
    // Останавливаем предыдущий трек перед запуском нового
    await stop(false, { keepActionId: true, quickFadeMs: QUICK_STOP_FADE_MS });
    if (!isActionActive()) return;
  }

  globalState.sessionEnded.value = false;
  globalState.isBuffering.value = true;
  startProgressTracking();

  let started = false;
  let localAudio: HTMLAudioElement | null = null;
  let localSource: AudioBufferSourceNode | null = null;

  const abortIfStale = () => {
    if (isActionActive()) return false;
    if (localAudio) {
      stopDetachedAudio(localAudio);
    }
    if (localSource) {
      stopDetachedWebAudio(localSource);
    }
    return true;
  };

  try {
    if (mode === 'webaudio') {
      let buffer: AudioBuffer | null = null;
      try {
        buffer = await prepareWebAudioTrack(track);
      } catch (error) {
        console.warn(
          '[MeditationPlayer] WebAudio failed, fallback to HTML:',
          error
        );
        globalState.audioBuffer = null;
        globalState.audioBufferUrl = '';
        buffer = null;
      }
      if (abortIfStale()) return;
      if (!buffer) {
        if (track.isLoop) {
          // Для loop-треков не падаем на HTML, чтобы не было слышимого шва.
          globalState.isBuffering.value = false;
          console.error('[MeditationPlayer] WebAudio buffer is not ready:', {
            trackId: track.id,
            audioPath: track.audioPath,
          });
          return;
        }
        mode = 'html';
      } else {
        globalState.playbackMode = 'webaudio';
        globalState.currentTrack.value = track;
        globalState.duration.value = buffer.duration ?? 0;
      }
    }

    if (mode === 'html') {
      if (typeof Audio === 'undefined') return;
      if (!globalState.audio || !sameTrack) {
        const audioUrl = resolveMediaUrl(track.audioPath);
        if (!audioUrl) {
          // Без валидного URL нет смысла запускать воспроизведение.
          globalState.isBuffering.value = false;
          console.error('[MeditationPlayer] Missing audio URL:', {
            trackId: track.id,
            audioPath: track.audioPath,
          });
          return;
        }
        const audio = new Audio(audioUrl);
        localAudio = audio;
        audio.loop = Boolean(track.isLoop);
        audio.preload = 'auto';
        audio.volume = 0;

        audio.onended = () => {
          if (globalState.audio !== audio) return;
          if (globalState.isRepeating.value || audio.loop) {
            audio.currentTime = 0;
            void audio.play();
            return;
          }
          globalState.isPlaying.value = false;
          clearTimer();
          if (!audio.loop) {
            globalState.currentTime.value = 0;
          }
        };

        audio.onloadedmetadata = () => {
          if (globalState.audio !== audio) return;
          globalState.duration.value = Number.isFinite(audio.duration)
            ? audio.duration
            : 0;
        };

        audio.ontimeupdate = () => {
          if (globalState.audio !== audio) return;
          handleGaplessLoop(audio);
        };

        audio.onerror = () => {
          if (globalState.audio !== audio) return;
          console.error('[MeditationPlayer] Audio error:', {
            trackId: track.id,
            src: audio.currentSrc || audio.src,
            code: audio.error?.code,
          });
          globalState.isPlaying.value = false;
        };

        if (abortIfStale()) return;
        globalState.audio = audio;
        globalState.currentTrack.value = track;
        globalState.playbackMode = 'html';
      } else if (globalState.audio) {
        const activeAudio = globalState.audio;
        localAudio = activeAudio;
        activeAudio.ontimeupdate = () => {
          if (globalState.audio !== activeAudio) return;
          handleGaplessLoop(activeAudio);
        };
      }

      if (abortIfStale()) return;
      if (!globalState.audio) return;

      // Ждём минимальной готовности файла перед воспроизведением.
      const audio = globalState.audio;
      if (audio.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        await new Promise<void>((resolve, reject) => {
          const timeoutMs = getAudioLoadTimeout();
          const timeoutId = setTimeout(() => {
            audio.removeEventListener('loadedmetadata', onReady);
            audio.removeEventListener('canplay', onReady);
            audio.removeEventListener('canplaythrough', onReady);
            audio.removeEventListener('error', onError);
            reject(new Error(`Audio load timeout after ${timeoutMs}ms`));
          }, timeoutMs);

          const onReady = () => {
            clearTimeout(timeoutId);
            audio.removeEventListener('loadedmetadata', onReady);
            audio.removeEventListener('canplay', onReady);
            audio.removeEventListener('canplaythrough', onReady);
            audio.removeEventListener('error', onError);
            resolve();
          };

          const onError = () => {
            clearTimeout(timeoutId);
            audio.removeEventListener('loadedmetadata', onReady);
            audio.removeEventListener('canplay', onReady);
            audio.removeEventListener('canplaythrough', onReady);
            audio.removeEventListener('error', onError);
            reject(
              new Error(`Audio load error: ${audio.error?.code || 'unknown'}`)
            );
          };

          if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            clearTimeout(timeoutId);
            resolve();
            return;
          }

          audio.addEventListener('loadedmetadata', onReady, { once: true });
          audio.addEventListener('canplay', onReady, { once: true });
          audio.addEventListener('canplaythrough', onReady, { once: true });
          audio.addEventListener('error', onError, { once: true });
        }).catch((error) => {
          console.error('[MeditationPlayer] Audio ready check failed:', error);
          if (abortIfStale()) return;
          // Пробуем воспроизвести даже если не все данные загружены
        });
      }

      if (abortIfStale()) return;
      const playbackResult = await attemptHtmlPlayback(audio);
      if (abortIfStale()) return;
      if (!playbackResult.started) {
        if (!isActionActive()) return;
        globalState.isPlaying.value = false;
        globalState.isBuffering.value = false;
        if (isAutoplayBlockedError(playbackResult.error)) {
          // Браузер ждёт жест — ставим отложенный старт.
          scheduleGestureUnlock(track, timerMinutes ?? null);
        } else if (playbackResult.timedOut) {
          console.error(
            '[MeditationPlayer] Playback timeout, file may be corrupted or too large'
          );
          // Пробуем перезагрузить файл
          if (audio.src) {
            audio.load();
          }
        }
        return;
      }
      globalState.isPlaying.value = true;
      // Снимаем лоадер сразу после старта воспроизведения (play() уже зарезолвился).
      globalState.isBuffering.value = false;
      started = true;
      clearGestureUnlock();
      await fadeTo(1, FADE_IN_MS);
      if (abortIfStale()) return;
    } else {
      globalState.playbackMode = 'webaudio';
      const context = globalState.audioContext;
      if (!context || !globalState.audioBuffer) return;
      if (globalState.audioGain) {
        globalState.audioGain.gain.setValueAtTime(0, context.currentTime);
      }
      if (!globalState.audioSource) {
        localSource = createWebAudioSource(globalState.webAudioOffset);
      } else {
        localSource = globalState.audioSource;
      }
      if (abortIfStale()) return;
      globalState.isPlaying.value = true;
      // WebAudio стартует сразу после source.start(), лоадер можно скрыть.
      globalState.isBuffering.value = false;
      started = true;
      clearGestureUnlock();
      await fadeTo(1, FADE_IN_MS);
      if (abortIfStale()) return;
    }
  } catch (error) {
    if (isActionActive()) {
      globalState.isPlaying.value = false;
    }
    console.error('[MeditationPlayer] Failed to start playback:', error);
  } finally {
    if (isActionActive()) {
      globalState.isBuffering.value = false;
    }
  }

  if (started && isActionActive()) {
    if (timerMinutes !== undefined) {
      setTimer(timerMinutes);
    } else if (globalState.timerMinutes.value) {
      resumeTimer();
    } else if (globalState.preferredTimerMinutes.value) {
      setTimer(globalState.preferredTimerMinutes.value);
    }
  }
}

async function toggle(track: MeditationTrackDto, timerMinutes?: number | null) {
  if (!globalState.playbackAllowed.value) return;
  if (globalState.isPlaying.value) {
    await pause();
    return;
  }
  await play(track, timerMinutes);
}

function setRepeat(enabled: boolean) {
  globalState.isRepeating.value = enabled;
  if (globalState.playbackMode === 'webaudio' && globalState.audioSource) {
    globalState.audioSource.loop =
      Boolean(globalState.currentTrack.value?.isLoop) || enabled;
  } else if (globalState.audio) {
    globalState.audio.loop =
      Boolean(globalState.currentTrack.value?.isLoop) || enabled;
  }
}

function toggleRepeat() {
  setRepeat(!globalState.isRepeating.value);
}

function seekBy(deltaSeconds: number) {
  if (globalState.playbackMode === 'webaudio') {
    const duration = globalState.audioBuffer?.duration;
    if (!duration) return;
    const next = Math.min(
      Math.max(0, getWebAudioCurrentTime() + deltaSeconds),
      duration
    );
    seekTo(next);
    return;
  }

  const audio = globalState.audio;
  if (!audio || !Number.isFinite(audio.duration)) return;
  const next = Math.min(
    Math.max(0, audio.currentTime + deltaSeconds),
    audio.duration
  );
  audio.currentTime = next;
  globalState.currentTime.value = next;
}

function seekTo(positionSeconds: number) {
  if (globalState.playbackMode === 'webaudio') {
    const duration = globalState.audioBuffer?.duration;
    if (!duration) return;
    const next = Math.min(Math.max(0, positionSeconds), duration);
    globalState.webAudioOffset = next;
    globalState.currentTime.value = next;
    if (globalState.audioSource) {
      stopWebAudioSource();
      const source = createWebAudioSource(next);
      if (source) {
        globalState.isPlaying.value = true;
      }
    }
    return;
  }

  const audio = globalState.audio;
  if (!audio || !Number.isFinite(audio.duration)) return;
  const next = Math.min(Math.max(0, positionSeconds), audio.duration);
  audio.currentTime = next;
  globalState.currentTime.value = next;
}

function acknowledgeSession() {
  globalState.sessionEnded.value = false;
}

function setQueue(ids: string[], key?: string | null) {
  globalState.queueIds.value = Array.from(new Set(ids));
  globalState.queueKey.value = key ?? null;
}

function clearQueue() {
  globalState.queueIds.value = [];
  globalState.queueKey.value = null;
}

export function useMeditationPlayer() {
  // Регистрируем слушатель жестов заранее, чтобы автозапуск был стабильнее.
  ensureGlobalGestureUnlock();
  ensureVisibilityListener();
  ensureAppStateListener();
  ensurePlaybackAudioSessionType();
  return {
    currentTrack: computed(() => globalState.currentTrack.value),
    isPlaying: computed(() => globalState.isPlaying.value),
    isBuffering: computed(() => globalState.isBuffering.value),
    isRepeating: computed(() => globalState.isRepeating.value),
    currentTime: computed(() => globalState.currentTime.value),
    duration: computed(() => globalState.duration.value),
    timerMinutes: computed(() => globalState.timerMinutes.value),
    timerRemainingMs: computed(() => globalState.timerRemainingMs.value),
    preferredTimerMinutes: computed(
      () => globalState.preferredTimerMinutes.value
    ),
    sessionEnded: computed(() => globalState.sessionEnded.value),
    queueIds: computed(() => globalState.queueIds.value),
    queueKey: computed(() => globalState.queueKey.value),
    play,
    pause,
    stop,
    toggle,
    setTimer,
    setPreferredTimer,
    clearTimer,
    seekBy,
    seekTo,
    setRepeat,
    toggleRepeat,
    acknowledgeSession,
    setQueue,
    clearQueue,
    setPlaybackAllowed,
  };
}
