import { Capacitor } from '@capacitor/core';
import { onScopeDispose, watch, type Ref } from 'vue';
import { isDocumentAvailable } from '@/app/utils/document';

type RealtimeVoiceStatusLike =
  | 'idle'
  | 'starting'
  | 'active'
  | 'stopping'
  | 'error';

type HapticImpactStyle = 'light' | 'medium' | 'heavy';
type HapticNotificationKind = 'success' | 'warning' | 'error';

export function useRealtimeVoiceCallFeedback(params: {
  status: Ref<RealtimeVoiceStatusLike>;
  errorMessage: Ref<string | null>;
}) {
  const READY_CUE_PATH = '/chat_on.wav';
  let audioContext: AudioContext | null = null;
  let connectingToneTimer: ReturnType<typeof setInterval> | null = null;
  let connectingToneActive = false;
  let lastNotifiedError = '';
  let readyCueBuffer: AudioBuffer | null = null;
  let readyCueBufferPromise: Promise<AudioBuffer | null> | null = null;
  let readyCueAudioElement: HTMLAudioElement | null = null;

  function canUseBrowserAudio(): boolean {
    return (
      !process.server && isDocumentAvailable() && typeof window !== 'undefined'
    );
  }

  function getAudioContextCtor(): typeof AudioContext | null {
    if (!canUseBrowserAudio()) {
      return null;
    }

    return (
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext ||
      null
    );
  }

  async function ensureAudioContext(): Promise<AudioContext | null> {
    const ctor = getAudioContextCtor();
    if (!ctor) {
      return null;
    }

    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new ctor();
    }

    if (audioContext.state !== 'running') {
      try {
        await audioContext.resume();
      } catch (error) {
        console.error(
          '[RealtimeVoiceCallFeedback] Failed to resume audio context:',
          error
        );
      }
    }

    return audioContext;
  }

  function resolveReadyCueUrl(): string | null {
    if (!canUseBrowserAudio()) {
      return null;
    }

    try {
      return new URL(READY_CUE_PATH, window.location.origin).toString();
    } catch (error) {
      console.error(
        '[RealtimeVoiceCallFeedback] Failed to resolve ready cue URL:',
        error
      );
      return null;
    }
  }

  function ensureReadyCueAudioElement(): HTMLAudioElement | null {
    if (!canUseBrowserAudio()) {
      return null;
    }

    if (!readyCueAudioElement) {
      const url = resolveReadyCueUrl();
      if (!url) {
        return null;
      }

      readyCueAudioElement = new Audio(url);
      readyCueAudioElement.preload = 'auto';
      readyCueAudioElement.setAttribute('playsinline', 'true');
    }

    return readyCueAudioElement;
  }

  async function warmReadyCueBuffer(): Promise<AudioBuffer | null> {
    if (readyCueBuffer) {
      return readyCueBuffer;
    }

    if (readyCueBufferPromise) {
      return readyCueBufferPromise;
    }

    readyCueBufferPromise = (async () => {
      const url = resolveReadyCueUrl();
      if (!url) {
        return null;
      }

      const context = await ensureAudioContext();
      if (!context) {
        return null;
      }

      try {
        const response = await fetch(url, { cache: 'force-cache' });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const sourceBuffer = await response.arrayBuffer();
        const decodedBuffer = await context.decodeAudioData(
          sourceBuffer.slice(0)
        );

        readyCueBuffer = decodedBuffer;
        return decodedBuffer;
      } catch (error) {
        console.error(
          '[RealtimeVoiceCallFeedback] Failed to preload ready cue buffer:',
          error
        );
        return null;
      } finally {
        readyCueBufferPromise = null;
      }
    })();

    return readyCueBufferPromise;
  }

  async function warmReadyCueAssets() {
    const audio = ensureReadyCueAudioElement();
    if (audio) {
      try {
        audio.load();
      } catch (error) {
        console.error(
          '[RealtimeVoiceCallFeedback] Failed to preload ready cue element:',
          error
        );
      }
    }

    await warmReadyCueBuffer();
  }

  function scheduleTonePulse(
    context: AudioContext,
    startAt: number,
    durationSeconds: number
  ) {
    const gain = context.createGain();
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.018, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSeconds);

    const firstOscillator = context.createOscillator();
    const secondOscillator = context.createOscillator();

    firstOscillator.type = 'sine';
    secondOscillator.type = 'sine';
    firstOscillator.frequency.setValueAtTime(440, startAt);
    secondOscillator.frequency.setValueAtTime(554.37, startAt);

    firstOscillator.connect(gain);
    secondOscillator.connect(gain);

    const dispose = () => {
      try {
        firstOscillator.disconnect();
        secondOscillator.disconnect();
        gain.disconnect();
      } catch {
        // Ничего не делаем: узлы могли уже быть удалены браузером.
      }
    };

    secondOscillator.addEventListener('ended', dispose, { once: true });

    firstOscillator.start(startAt);
    secondOscillator.start(startAt);
    firstOscillator.stop(startAt + durationSeconds);
    secondOscillator.stop(startAt + durationSeconds);
  }

  function playConnectingPulse(context: AudioContext) {
    const pulseStart = context.currentTime + 0.01;
    scheduleTonePulse(context, pulseStart, 0.18);
    scheduleTonePulse(context, pulseStart + 0.34, 0.18);
  }

  async function startConnectingTone() {
    if (connectingToneActive) {
      return;
    }

    const context = await ensureAudioContext();
    if (!context) {
      return;
    }

    connectingToneActive = true;
    playConnectingPulse(context);
    void warmReadyCueAssets();

    connectingToneTimer = setInterval(() => {
      if (!audioContext || !connectingToneActive) {
        return;
      }

      playConnectingPulse(audioContext);
    }, 1_650);
  }

  function resetReadyCuePlayback() {
    if (!readyCueAudioElement) {
      return;
    }

    try {
      readyCueAudioElement.pause();
      readyCueAudioElement.currentTime = 0;
    } catch (error) {
      console.error(
        '[RealtimeVoiceCallFeedback] Failed to reset ready cue playback:',
        error
      );
    }
  }

  function stopConnectingTone() {
    connectingToneActive = false;

    if (connectingToneTimer) {
      clearInterval(connectingToneTimer);
      connectingToneTimer = null;
    }

    if (audioContext && audioContext.state === 'running') {
      void audioContext.suspend().catch((error) => {
        console.error(
          '[RealtimeVoiceCallFeedback] Failed to suspend audio context:',
          error
        );
      });
    }
  }

  function resetAllAudioFeedback() {
    stopConnectingTone();
    resetReadyCuePlayback();
  }

  async function playReadyCueWithAudioBuffer(): Promise<boolean> {
    const context = await ensureAudioContext();
    if (!context) {
      return false;
    }

    const buffer = await warmReadyCueBuffer();
    if (!buffer) {
      return false;
    }

    try {
      const source = context.createBufferSource();
      const gain = context.createGain();
      const startAt = context.currentTime + 0.01;

      source.buffer = buffer;
      source.connect(gain);
      gain.connect(context.destination);
      gain.gain.setValueAtTime(0.92, startAt);

      const dispose = () => {
        try {
          source.disconnect();
          gain.disconnect();
        } catch {
          // Узлы могли уже быть освобождены браузером.
        }
      };

      source.addEventListener('ended', dispose, { once: true });
      source.start(startAt);

      return true;
    } catch (error) {
      console.error(
        '[RealtimeVoiceCallFeedback] Failed to play ready cue via AudioContext:',
        error
      );
      return false;
    }
  }

  async function playReadyCueWithHtmlAudio(): Promise<boolean> {
    const audio = ensureReadyCueAudioElement();
    if (!audio) {
      return false;
    }

    try {
      audio.pause();
      audio.currentTime = 0;
      await audio.play();
      return true;
    } catch (error) {
      console.error(
        '[RealtimeVoiceCallFeedback] Failed to play ready cue via HTMLAudioElement:',
        error
      );
      return false;
    }
  }

  async function playReadyCue(): Promise<void> {
    if (await playReadyCueWithAudioBuffer()) {
      return;
    }

    if (await playReadyCueWithHtmlAudio()) {
      return;
    }

    const context = await ensureAudioContext();
    if (context) {
      playConnectingPulse(context);
    }
  }

  async function triggerImpact(style: HapticImpactStyle): Promise<void> {
    if (process.server) {
      return;
    }

    const platform = Capacitor.getPlatform();
    const isNative =
      typeof Capacitor.isNativePlatform === 'function'
        ? Capacitor.isNativePlatform()
        : platform === 'ios' || platform === 'android';

    if (isNative) {
      try {
        const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
        const impactStyle =
          style === 'light'
            ? ImpactStyle.Light
            : style === 'heavy'
              ? ImpactStyle.Heavy
              : ImpactStyle.Medium;

        await Haptics.impact({ style: impactStyle });
        return;
      } catch (error) {
        console.error(
          '[RealtimeVoiceCallFeedback] Failed to trigger impact haptics:',
          error
        );
      }
    }

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(style === 'light' ? 24 : style === 'heavy' ? 64 : 40);
      } catch (error) {
        console.error(
          '[RealtimeVoiceCallFeedback] Failed to trigger web vibration:',
          error
        );
      }
    }
  }

  async function triggerNotification(
    kind: HapticNotificationKind
  ): Promise<void> {
    if (process.server) {
      return;
    }

    const platform = Capacitor.getPlatform();
    const isNative =
      typeof Capacitor.isNativePlatform === 'function'
        ? Capacitor.isNativePlatform()
        : platform === 'ios' || platform === 'android';

    if (isNative) {
      try {
        const { Haptics, NotificationType } = await import(
          '@capacitor/haptics'
        );
        const notificationType =
          kind === 'success'
            ? NotificationType.Success
            : kind === 'warning'
              ? NotificationType.Warning
              : NotificationType.Error;

        await Haptics.notification({ type: notificationType });
        return;
      } catch (error) {
        console.error(
          '[RealtimeVoiceCallFeedback] Failed to trigger notification haptics:',
          error
        );
      }
    }

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        const vibrationPattern =
          kind === 'success'
            ? [24, 20, 24]
            : kind === 'warning'
              ? [40, 24, 40]
              : [60, 28, 60];
        navigator.vibrate(vibrationPattern);
      } catch (error) {
        console.error(
          '[RealtimeVoiceCallFeedback] Failed to trigger notification vibration:',
          error
        );
      }
    }
  }

  async function notifyCallIntent(): Promise<void> {
    lastNotifiedError = '';
    await triggerImpact('light');
    void warmReadyCueAssets();
  }

  async function notifyHangupIntent(): Promise<void> {
    await triggerImpact('medium');
  }

  async function notifyUnavailableIntent(): Promise<void> {
    await triggerNotification('warning');
  }

  watch(
    () => params.status.value,
    (nextStatus, previousStatus) => {
      if (nextStatus === 'starting') {
        void startConnectingTone();
        return;
      }

      resetAllAudioFeedback();

      if (previousStatus === 'starting' && nextStatus === 'active') {
        void Promise.allSettled([
          playReadyCue(),
          triggerNotification('success'),
        ]);
      }
    }
  );

  watch(
    () => params.errorMessage.value,
    (nextMessage) => {
      const normalized = String(nextMessage || '').trim();
      if (!normalized) {
        lastNotifiedError = '';
        return;
      }

      resetAllAudioFeedback();

      if (normalized === lastNotifiedError) {
        return;
      }

      lastNotifiedError = normalized;
      void triggerNotification('error');
    }
  );

  onScopeDispose(() => {
    resetAllAudioFeedback();

    if (readyCueAudioElement) {
      try {
        readyCueAudioElement.pause();
        readyCueAudioElement.src = '';
      } catch (error) {
        console.error(
          '[RealtimeVoiceCallFeedback] Failed to reset ready cue element:',
          error
        );
      }

      readyCueAudioElement = null;
    }

    if (audioContext && audioContext.state !== 'closed') {
      void audioContext.close().catch((error) => {
        console.error(
          '[RealtimeVoiceCallFeedback] Failed to close audio context:',
          error
        );
      });
    }

    audioContext = null;
  });

  return {
    notifyCallIntent,
    notifyHangupIntent,
    notifyUnavailableIntent,
  };
}
