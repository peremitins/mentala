import { ref } from 'vue';
import { isDocumentAvailable } from '@/app/utils/document';
import { resolveMediaUrl } from '@/app/utils/media';
import type { SceneTrack } from '@/app/lib/sceneSelectionCatalog';

const FADE_IN_MS = 1200;
const FADE_OUT_MS = 1200;
const PLAY_START_TIMEOUT_MS = 1200;
// На мобильных даём больше времени на старт (медленные сети/буферизация).
const PLAY_START_TIMEOUT_MOBILE_MS = 5000;
// В режиме обоев все сцены должны повторяться бесконечно.
const SCENE_LOOP_ENABLED = true;

type PlaybackMode = 'html' | 'webaudio';

type PendingPlay = {
  scene: SceneTrack;
};

function getUserAgent() {
  if (typeof navigator === 'undefined') return '';
  return navigator.userAgent || '';
}

function isMobileUserAgent() {
  const ua = getUserAgent();
  if (!ua) return false;
  return /iphone|ipad|ipod|android/i.test(ua);
}

function shouldPreferWebAudio(scene: SceneTrack | null) {
  if (!isWebAudioAvailable()) return false;
  // Для loop-треков всегда используем WebAudio для бесшовного зацикливания
  if (scene?.isLoop) return true;
  // На мобильных WebAudio часто нестабилен и более затратный по CPU.
  if (isMobileUserAgent()) return false;
  return true;
}

function getPlayStartTimeoutMs() {
  return isMobileUserAgent()
    ? PLAY_START_TIMEOUT_MOBILE_MS
    : PLAY_START_TIMEOUT_MS;
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
  currentScene: ref<SceneTrack | null>(null),
  isPlaying: ref(false),
  isBuffering: ref(false),
  volume: ref(0.7),
  fadeInterval: null as ReturnType<typeof setInterval> | null,
  pendingPlay: null as PendingPlay | null,
  gestureUnlockCleanup: null as (() => void) | null,
  globalUnlockCleanup: null as (() => void) | null,
  backgroundPlayMinutes: ref(0),
  backgroundTimeout: null as ReturnType<typeof setTimeout> | null,
  visibilityBound: false,
  appStateBound: false,
  isBackgrounded: false,
  wasPlayingBeforeBackground: false,
  isSuspended: ref(false),
  wasPlayingBeforeSuspend: false,
  playbackAllowed: ref(true),
  audioUnlocked: false,
  playbackActionId: 0,
};

function clampNumber(value: number, min: number, max: number) {
  const safe = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, safe));
}

async function setPlaybackAllowed(allowed: boolean) {
  globalState.playbackAllowed.value = allowed;
  if (allowed) return;
  // На публичных экранах полностью блокируем запуск звука и чистим хвосты.
  clearGestureUnlock();
  await stop(false);
}

function clearGestureUnlock() {
  if (globalState.gestureUnlockCleanup) {
    globalState.gestureUnlockCleanup();
    globalState.gestureUnlockCleanup = null;
  }
  globalState.pendingPlay = null;
}

async function unlockAudioContext(): Promise<boolean> {
  if (!isDocumentAvailable() || typeof window === 'undefined') return false;
  const context = ensureAudioContext();
  if (!context) return false;

  if (context.state === 'running') {
    globalState.audioUnlocked = true;
    return true;
  }

  try {
    await context.resume();
  } catch {
    return false;
  }

  const state = context.state as AudioContextState;
  if (state === 'running') {
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
    void (async () => {
      // Разрешаем запуск WebAudio только после пользовательского жеста.
      const unlocked = await unlockAudioContext();
      if (!unlocked) return;

      const pending = globalState.pendingPlay;
      if (pending) {
        clearGestureUnlock();
        await play(pending.scene);
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

function scheduleGestureUnlock(scene: SceneTrack) {
  if (!isDocumentAvailable() || typeof window === 'undefined') return;
  if (!globalState.playbackAllowed.value) return;
  clearGestureUnlock();
  ensureGlobalGestureUnlock();

  globalState.pendingPlay = { scene };

  const handler = () => {
    void (async () => {
      const pending = globalState.pendingPlay;
      clearGestureUnlock();
      if (!pending) return;
      await unlockAudioContext();
      await play(pending.scene);
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

function clearFade() {
  if (globalState.fadeInterval) {
    clearInterval(globalState.fadeInterval);
    globalState.fadeInterval = null;
  }
}

function bumpPlaybackActionId() {
  // Нужен для защиты от гонок при быстром переключении сцен.
  globalState.playbackActionId += 1;
  return globalState.playbackActionId;
}

function isActionActive(actionId: number) {
  return actionId === globalState.playbackActionId;
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

  clearFade();
  const startVolume = audio.volume;
  const steps = Math.max(1, Math.floor(durationMs / 50));
  const delta = (targetVolume - startVolume) / steps;
  let step = 0;

  await new Promise<void>((resolve) => {
    globalState.fadeInterval = setInterval(() => {
      step += 1;
      const next = clampNumber(startVolume + delta * step, 0, 1);
      audio.volume = next;
      if (step >= steps) {
        clearFade();
        resolve();
      }
    }, durationMs / steps);
  });
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
    const result = await Promise.race([
      playPromise.then(() => 'started' as const),
      playingPromise,
      new Promise<'timeout'>((resolve) => {
        timeoutId = setTimeout(
          () => resolve('timeout'),
          getPlayStartTimeoutMs()
        );
      }),
    ]);
    if (result === 'timeout') {
      try {
        audio.pause();
      } catch {
        // Игнорируем, если уже не играет.
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

function cleanupAudio() {
  const audio = globalState.audio;
  if (!audio) return;
  audio.onended = null;
  audio.onerror = null;
}

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

function ensureAudioContext(): AudioContext | null {
  const ctor = getAudioContextCtor();
  if (!ctor) return null;
  if (!globalState.audioContext) {
    globalState.audioContext = new ctor();
  }
  return globalState.audioContext;
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
  // Добавляем таймаут для предотвращения зависания на мобильных
  const controller = new AbortController();
  const timeoutMs = isMobileUserAgent() ? 30000 : 15000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to load audio: ${response.status}`);
    }

    // Проверяем размер файла перед загрузкой на мобильных
    const contentLength = response.headers.get('content-length');
    const MAX_SIZE_MB = 50;
    if (contentLength && isMobileUserAgent()) {
      const sizeMB = parseInt(contentLength, 10) / (1024 * 1024);
      if (sizeMB > MAX_SIZE_MB) {
        throw new Error(
          `Audio file too large for mobile: ${sizeMB.toFixed(2)}MB`
        );
      }
    }

    const arrayBuffer = await response.arrayBuffer();

    // Дополнительная проверка размера после загрузки
    if (isMobileUserAgent()) {
      const sizeMB = arrayBuffer.byteLength / (1024 * 1024);
      if (sizeMB > MAX_SIZE_MB) {
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

async function prepareWebAudioScene(
  scene: SceneTrack
): Promise<AudioBuffer | null> {
  if (!globalState.audioUnlocked) {
    // Не создаём контекст до первого жеста, чтобы избежать autoplay‑ошибок.
    return null;
  }

  const context = ensureAudioContext();
  if (!context) return null;

  if (context.state === 'suspended') {
    if (!globalState.audioUnlocked) {
      // Ждём пользовательский жест, чтобы снять блокировку автозапуска.
      return null;
    }
    try {
      await context.resume();
    } catch {
      return null;
    }
  }
  if (context.state !== 'running') {
    return null;
  }

  const url = resolveMediaUrl(scene.audioPath);
  if (!url) return null;
  if (!globalState.audioBuffer || globalState.audioBufferUrl !== url) {
    globalState.audioBuffer = await loadAudioBuffer(url, context);
    globalState.audioBufferUrl = url;
  }

  ensureAudioGain(context);
  return globalState.audioBuffer;
}

function stopWebAudioSource() {
  if (!globalState.audioSource) return;
  try {
    globalState.audioSource.stop();
  } catch {
    // Источник мог быть уже остановлен.
  }
  try {
    globalState.audioSource.disconnect();
  } catch {
    // Игнорируем повторное отключение.
  }
  globalState.audioSource = null;
}

function stopDetachedAudio(audio: HTMLAudioElement) {
  try {
    audio.pause();
  } catch {
    // Игнорируем, если уже остановлено.
  }
}

function stopDetachedWebAudio(source: AudioBufferSourceNode) {
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

function createWebAudioSource(
  offsetSeconds: number
): AudioBufferSourceNode | null {
  const context = globalState.audioContext;
  const buffer = globalState.audioBuffer;
  const gain = globalState.audioGain;
  if (!context || !buffer || !gain) return null;

  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = SCENE_LOOP_ENABLED;
  if (buffer.duration > 0) {
    source.loopStart = 0;
    source.loopEnd = buffer.duration;
  }
  source.connect(gain);
  source.onended = () => {
    if (globalState.audioSource !== source) return;
    globalState.isPlaying.value = false;
  };

  globalState.audioSource = source;
  globalState.webAudioStartTime = context.currentTime;
  const safeOffset = Math.min(Math.max(0, offsetSeconds), buffer.duration || 0);
  source.start(0, safeOffset);
  return source;
}

function clearBackgroundTimeout() {
  if (globalState.backgroundTimeout) {
    clearTimeout(globalState.backgroundTimeout);
    globalState.backgroundTimeout = null;
  }
}

async function scheduleBackgroundStop() {
  clearBackgroundTimeout();
  const minutes = globalState.backgroundPlayMinutes.value;
  if (!minutes) {
    await stop(true);
    return;
  }
  globalState.backgroundTimeout = setTimeout(
    () => {
      void stop(true);
    },
    minutes * 60 * 1000
  );
}

function handleVisibilityChange() {
  if (!isDocumentAvailable() || typeof document === 'undefined') return;
  if (document.visibilityState === 'hidden') {
    void handleBackgroundEnter();
    return;
  }
  void handleBackgroundExit();
}

function ensureVisibilityListener() {
  if (!isDocumentAvailable() || typeof document === 'undefined') return;
  if (globalState.visibilityBound) return;
  document.addEventListener('visibilitychange', handleVisibilityChange);
  globalState.visibilityBound = true;
}

async function handleAppStateChange(isActive: boolean) {
  if (!isActive) {
    void handleBackgroundEnter();
    return;
  }
  await handleBackgroundExit();
}

function ensureAppStateListener() {
  if (globalState.appStateBound) return;
  globalState.appStateBound = true;
  import('@capacitor/app')
    .then(({ App }) => {
      App.addListener('appStateChange', ({ isActive }) => {
        void handleAppStateChange(isActive);
      });
    })
    .catch(() => {
      // На Web и без Capacitor опираемся на visibilitychange.
    });
}

function shouldResumeOnForeground(scene: SceneTrack | null) {
  if (!scene) return false;
  if (!scene.audioPath) return false;
  if (globalState.isSuspended.value) return false;
  if (globalState.isBackgrounded) return false;
  if (globalState.volume.value <= 0) return false;
  return true;
}

function isPlaybackPaused() {
  if (globalState.playbackMode === 'webaudio') {
    const context = globalState.audioContext;
    if (!context) return true;
    return context.state !== 'running';
  }
  if (globalState.playbackMode === 'html') {
    const audio = globalState.audio;
    if (!audio) return true;
    return audio.paused;
  }
  return true;
}

async function attemptForegroundResume() {
  if (!globalState.playbackAllowed.value) return;
  const scene = globalState.currentScene.value;
  if (!scene) return;
  if (!shouldResumeOnForeground(scene)) return;
  if (globalState.isBuffering.value) return;
  const needsResume = !globalState.isPlaying.value || isPlaybackPaused();
  if (!needsResume) return;
  await play(scene);
}

async function handleBackgroundEnter() {
  globalState.isBackgrounded = true;
  globalState.wasPlayingBeforeBackground = globalState.isPlaying.value;
  clearBackgroundTimeout();
  const minutes = globalState.backgroundPlayMinutes.value;
  // Если таймер не задан — в фоне звук не воспроизводим.
  if (!minutes) {
    if (globalState.isPlaying.value) {
      await pause(true);
    }
    if (
      globalState.audioContext &&
      globalState.audioContext.state === 'running'
    ) {
      try {
        await globalState.audioContext.suspend();
      } catch {
        // Игнорируем сбой при приостановке контекста.
      }
    }
    return;
  }
  // Разрешён фон на N минут — играем дальше и ставим таймер остановки.
  await scheduleBackgroundStop();
}

async function handleBackgroundExit() {
  globalState.isBackgrounded = false;
  clearBackgroundTimeout();
  await attemptForegroundResume();
}

async function pause(withFade = true) {
  bumpPlaybackActionId();
  clearGestureUnlock();
  globalState.isBuffering.value = false;
  if (globalState.playbackMode === 'webaudio') {
    if (withFade) {
      await fadeTo(0, FADE_OUT_MS);
    }
    updateWebAudioOffset();
    stopWebAudioSource();
    globalState.isPlaying.value = false;
    return;
  }

  const audio = globalState.audio;
  if (!audio) return;
  if (withFade) {
    await fadeTo(0, FADE_OUT_MS);
  }
  try {
    audio.pause();
  } catch {
    // Игнорируем ошибку паузы.
  }
  globalState.isPlaying.value = false;
}

async function stop(withFade = true, options: { keepActionId?: boolean } = {}) {
  if (!options.keepActionId) {
    bumpPlaybackActionId();
  }
  clearGestureUnlock();
  clearBackgroundTimeout();
  globalState.isBuffering.value = false;
  if (globalState.playbackMode === 'webaudio') {
    if (withFade) {
      await fadeTo(0, FADE_OUT_MS);
    }
    stopWebAudioSource();
    globalState.webAudioOffset = 0;
    globalState.isPlaying.value = false;
    globalState.playbackMode = null;

    // Очищаем WebAudio буферы для освобождения памяти (критично для мобильных)
    if (isMobileUserAgent()) {
      globalState.audioBuffer = null;
      globalState.audioBufferUrl = '';
    }

    return;
  }

  const audio = globalState.audio;
  if (!audio) return;
  if (withFade) {
    await fadeTo(0, FADE_OUT_MS);
  }
  try {
    audio.pause();
  } catch {
    // Игнорируем ошибку остановки.
  }
  audio.currentTime = 0;
  cleanupAudio();
  globalState.isPlaying.value = false;
  globalState.playbackMode = null;
}

async function play(scene: SceneTrack) {
  const actionId = bumpPlaybackActionId();
  if (!isDocumentAvailable()) return;
  if (typeof Audio === 'undefined') return;
  if (!globalState.playbackAllowed.value) {
    // Защита от автозапуска на публичных маршрутах.
    clearGestureUnlock();
    globalState.isBuffering.value = false;
    return;
  }
  ensureGlobalGestureUnlock();
  ensureVisibilityListener();
  ensureAppStateListener();

  const sameScene = globalState.currentScene.value?.id === scene.id;
  if (!sameScene) {
    // Обновляем выбранную сцену и сбрасываем старый звук перед проигрыванием.
    await stop(false, { keepActionId: true });
    if (!isActionActive(actionId)) return;
    globalState.audio = null;
    globalState.audioBuffer = null;
    globalState.audioBufferUrl = '';
    globalState.webAudioOffset = 0;
    globalState.playbackMode = null;
    globalState.currentScene.value = scene;
  }

  // Для loop-треков всегда используем WebAudio для бесшовного зацикливания
  const shouldUseWebAudio = Boolean(scene.isLoop) && isWebAudioAvailable();
  if (shouldUseWebAudio) {
    const unlocked = await unlockAudioContext();
    if (!unlocked) {
      // Для лупов не падаем на HTML, чтобы не было слышимого шва.
      globalState.isPlaying.value = false;
      globalState.isBuffering.value = false;
      scheduleGestureUnlock(scene);
      return;
    }
  }

  const preferWebAudio = shouldPreferWebAudio(scene);
  let mode: PlaybackMode = preferWebAudio ? 'webaudio' : 'html';

  // Если это loop-трек, принудительно используем WebAudio
  if (scene.isLoop && isWebAudioAvailable()) {
    mode = 'webaudio';
  }

  if (mode === 'webaudio') {
    try {
      const buffer = await prepareWebAudioScene(scene);
      if (!isActionActive(actionId)) return;
      if (!buffer) {
        // Если WebAudio не удалось загрузить и это не loop-трек, пробуем HTML
        if (!scene.isLoop) {
          mode = 'html';
        } else {
          // Для loop-треков не падаем на HTML
          globalState.isBuffering.value = false;
          scheduleGestureUnlock(scene);
          return;
        }
      } else {
        globalState.playbackMode = 'webaudio';
        globalState.isBuffering.value = true;
        if (!globalState.audioSource) {
          const source = createWebAudioSource(globalState.webAudioOffset);
          if (!isActionActive(actionId) && source) {
            stopDetachedWebAudio(source);
            return;
          }
        }
        globalState.isPlaying.value = true;
        globalState.isBuffering.value = false;
        clearGestureUnlock();
        await fadeTo(globalState.volume.value, FADE_IN_MS);
        if (!isActionActive(actionId)) return;
        return;
      }
    } catch (error) {
      console.error('[SceneAudio] Ошибка WebAudio:', error);
      // Если WebAudio не удалось и это не loop-трек, пробуем HTML
      if (!scene.isLoop) {
        mode = 'html';
      } else {
        globalState.isBuffering.value = false;
        scheduleGestureUnlock(scene);
        return;
      }
    }
  }

  if (mode === 'html') {
    if (
      !sameScene ||
      globalState.playbackMode !== 'html' ||
      !globalState.audio
    ) {
      const audioUrl = resolveMediaUrl(scene.audioPath);
      if (!audioUrl) return;
      const audio = new Audio(audioUrl);
      audio.loop = SCENE_LOOP_ENABLED;
      audio.preload = 'auto';
      audio.volume = 0;
      audio.onerror = () => {
        globalState.isBuffering.value = false;
        globalState.isPlaying.value = false;
        console.error('[SceneAudio] Audio error:', {
          sceneId: scene.id,
          src: audio.currentSrc || audio.src,
          code: audio.error?.code,
        });
      };
      globalState.audio = audio;
    }

    const audio = globalState.audio;
    if (!audio) return;

    globalState.playbackMode = 'html';
    globalState.isBuffering.value = true;

    // Ждём готовности файла перед воспроизведением (критично для мобильных)
    if (audio.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
      try {
        await new Promise<void>((resolve, reject) => {
          const timeoutMs = isMobileUserAgent() ? 30000 : 15000;
          const timeoutId = setTimeout(() => {
            audio.removeEventListener('canplaythrough', onCanPlay);
            audio.removeEventListener('error', onError);
            reject(new Error(`Audio load timeout after ${timeoutMs}ms`));
          }, timeoutMs);

          const onCanPlay = () => {
            clearTimeout(timeoutId);
            audio.removeEventListener('canplaythrough', onCanPlay);
            audio.removeEventListener('error', onError);
            resolve();
          };

          const onError = () => {
            clearTimeout(timeoutId);
            audio.removeEventListener('canplaythrough', onCanPlay);
            audio.removeEventListener('error', onError);
            reject(
              new Error(`Audio load error: ${audio.error?.code || 'unknown'}`)
            );
          };

          if (audio.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
            clearTimeout(timeoutId);
            resolve();
            return;
          }

          audio.addEventListener('canplaythrough', onCanPlay, { once: true });
          audio.addEventListener('error', onError, { once: true });
        });
      } catch (error) {
        console.error('[SceneAudio] Audio ready check failed:', error);
        if (!isActionActive(actionId)) {
          stopDetachedAudio(audio);
          return;
        }
        // Пробуем воспроизвести даже если не все данные загружены
      }
    }

    if (!isActionActive(actionId)) {
      stopDetachedAudio(audio);
      return;
    }

    const playbackResult = await attemptHtmlPlayback(audio);
    if (!isActionActive(actionId)) {
      stopDetachedAudio(audio);
      return;
    }
    if (!playbackResult.started) {
      globalState.isBuffering.value = false;
      if (playbackResult.timedOut) {
        console.error(
          '[SceneAudio] Playback timeout, file may be corrupted or too large'
        );
        // Пробуем перезагрузить файл
        if (audio.src) {
          audio.load();
        }
      }
      scheduleGestureUnlock(scene);
      return;
    }

    globalState.isBuffering.value = false;
    globalState.isPlaying.value = true;
    clearGestureUnlock();
    await fadeTo(globalState.volume.value, FADE_IN_MS);
    if (!isActionActive(actionId)) {
      stopDetachedAudio(audio);
      return;
    }
  }
}

async function setScene(scene: SceneTrack | null) {
  if (!scene) return;
  const sameScene = globalState.currentScene.value?.id === scene.id;
  if (sameScene) return;
  // Меняем сцену без автозапуска (важно для режима, когда медитация активна).
  await stop(false);
  // Сбрасываем старый Audio, чтобы при возобновлении гарантированно стартовала новая сцена.
  globalState.audio = null;
  globalState.audioBuffer = null;
  globalState.audioBufferUrl = '';
  globalState.webAudioOffset = 0;
  globalState.playbackMode = null;
  globalState.currentScene.value = scene;
}

function setVolume(value: number) {
  const clamped = clampNumber(value, 0, 1);
  globalState.volume.value = clamped;
  if (globalState.playbackMode === 'webaudio' && globalState.audioGain) {
    // В WebAudio громкость управляется через GainNode.
    globalState.audioGain.gain.value = clamped;
  }
  if (globalState.audio) {
    globalState.audio.volume = clamped;
  }
}

function setBackgroundPlayMinutes(minutes: number) {
  const clamped = clampNumber(minutes, 0, 60);
  globalState.backgroundPlayMinutes.value = clamped;
  if (!isDocumentAvailable() || typeof document === 'undefined') return;
  if (document.visibilityState === 'hidden') {
    void handleBackgroundEnter();
  } else {
    clearBackgroundTimeout();
  }
}

async function suspend() {
  if (globalState.isSuspended.value) return;
  globalState.isSuspended.value = true;
  globalState.wasPlayingBeforeSuspend = globalState.isPlaying.value;
  if (globalState.isPlaying.value) {
    await pause(true);
  }
}

async function resume() {
  if (!globalState.isSuspended.value) return;
  globalState.isSuspended.value = false;
  if (!globalState.playbackAllowed.value) return;
  if (globalState.wasPlayingBeforeSuspend && globalState.currentScene.value) {
    await play(globalState.currentScene.value);
  }
}

export function useSceneAudio() {
  // Регистрируем слушатель жестов заранее, чтобы после логина звук стартовал сразу.
  ensureGlobalGestureUnlock();
  return {
    currentScene: globalState.currentScene,
    isPlaying: globalState.isPlaying,
    isBuffering: globalState.isBuffering,
    play,
    pause,
    stop,
    setScene,
    setVolume,
    setBackgroundPlayMinutes,
    suspend,
    resume,
    setPlaybackAllowed,
  };
}
