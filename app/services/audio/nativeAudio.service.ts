import { Capacitor } from '@capacitor/core';
import type { AudioPlayerPlugin } from '@mediagrid/capacitor-native-audio';
import type {
  AudioService,
  AudioServiceEvent,
  AudioServiceEventHandler,
  AudioServicePauseOptions,
  AudioServicePlayOptions,
  AudioServiceResumeOptions,
  AudioServiceSnapshot,
  AudioServiceStopOptions,
  AudioServiceTrack,
} from '@/app/services/audio/audio.types';

const READY_WAIT_TIMEOUT_MS = 1800;
const PROGRESS_POLL_MS = 500;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function toSeconds(ms: number) {
  return Math.max(0, ms) / 1000;
}

function toMs(seconds: number) {
  return Math.max(0, seconds) * 1000;
}

type NativeAudioServiceOptions = {
  audioIdNamespace?: string;
};

function normalizeAudioIdPart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function toAudioId(namespace: string, trackId: string, loadTaskId: number) {
  return `${normalizeAudioIdPart(namespace)}_${normalizeAudioIdPart(trackId)}_${loadTaskId}`;
}

function normalizeDurationMs(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value);
}

type PlaybackStatus = 'playing' | 'paused' | 'stopped';

type AudioPlayerWithScheduledStop = AudioPlayerPlugin & {
  scheduleStop?: (params: {
    audioId: string;
    delayMs: number;
  }) => Promise<void>;
  clearScheduledStop?: (params: { audioId: string }) => Promise<void>;
};

type ReadyWaiter = {
  resolve: () => void;
};

export class NativeAudioService implements AudioService {
  private readonly audioIdNamespace: string;
  private audioPlayer: AudioPlayerPlugin | null = null;
  private initialized = false;
  private listeners = new Set<AudioServiceEventHandler>();
  private activeTrack: AudioServiceTrack | null = null;
  private activeAudioId: string | null = null;
  private activeSourceReady = false;
  private activeTrackUsesNativeLoop = false;
  private activeTrackUsesNotification = true;
  private activeTrackIsBackgroundMusic = false;
  private positionMs = 0;
  private durationMs = 0;
  private isPlaying = false;
  private isBuffering = false;
  private volume = 1;
  private rate = 1;
  private currentVolume = 1;
  private autoReplayEnabled = false;
  private fadeOperationId = 0;
  private loadTaskId = 0;
  private progressPollInterval: ReturnType<typeof setInterval> | null = null;
  private progressPollTickInFlight = false;
  private positionClockStartedAtMs = 0;
  private positionClockAnchorMs = 0;
  private readyWaiters = new Map<string, ReadyWaiter>();
  private suppressEndEvent = false;
  private suppressStatusEvent = false;
  private playbackCommandId = 0;

  constructor(options: NativeAudioServiceOptions = {}) {
    this.audioIdNamespace = options.audioIdNamespace ?? 'meditation';
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    if (!Capacitor.isPluginAvailable('AudioPlayer')) {
      throw new Error('AudioPlayer plugin is not available on this platform');
    }

    const module = await import('@mediagrid/capacitor-native-audio');
    this.audioPlayer = module.AudioPlayer;
    this.initialized = true;
  }

  async load(track: AudioServiceTrack): Promise<void> {
    await this.init();
    if (!this.audioPlayer) {
      throw new Error('AudioPlayer bridge is not initialized');
    }

    const nextUsesNativeLoop = Boolean(track.isLoop);
    const nextUsesNotification = track.useForNotification !== false;
    const nextIsBackgroundMusic = Boolean(track.isBackgroundMusic);
    const sameSource =
      this.activeSourceReady &&
      this.activeTrack?.id === track.id &&
      this.activeTrack?.url === track.url &&
      this.activeTrackUsesNativeLoop === nextUsesNativeLoop &&
      this.activeTrackUsesNotification === nextUsesNotification &&
      this.activeTrackIsBackgroundMusic === nextIsBackgroundMusic;

    if (sameSource) {
      this.activeTrack = track;
      this.durationMs ||= this.getTrackDurationFallbackMs(track);
      this.emit({
        type: 'ready',
        trackId: track.id,
        durationMs: this.durationMs,
      });
      return;
    }

    this.loadTaskId += 1;
    const currentLoadTaskId = this.loadTaskId;
    const nextAudioId = toAudioId(
      this.audioIdNamespace,
      track.id,
      currentLoadTaskId
    );
    await this.destroyActiveAudioSource();

    this.fadeOperationId += 1;
    this.activeTrack = track;
    this.activeAudioId = nextAudioId;
    this.activeSourceReady = false;
    this.activeTrackUsesNativeLoop = nextUsesNativeLoop;
    this.activeTrackUsesNotification = nextUsesNotification;
    this.activeTrackIsBackgroundMusic = nextIsBackgroundMusic;
    this.positionMs = 0;
    this.durationMs = this.getTrackDurationFallbackMs(track);
    this.currentVolume = this.volume;
    this.isPlaying = false;
    this.stopPositionClock();
    this.setBuffering(track.id, true);

    try {
      await this.audioPlayer.create({
        audioId: nextAudioId,
        audioSource: track.url,
        friendlyTitle: track.title,
        albumTitle: 'Ментала',
        artistName:
          track.category === 'breathing'
            ? 'Дыхательная практика'
            : track.category === 'scene'
              ? 'Атмосфера'
              : 'Медитация',
        useForNotification: nextUsesNotification,
        isBackgroundMusic: nextIsBackgroundMusic,
        artworkSource: track.artworkUrl ?? undefined,
        loop: nextUsesNativeLoop,
        showSeekBackward: nextUsesNotification ? false : undefined,
        showSeekForward: nextUsesNotification ? false : undefined,
        seekBackwardTime: 15,
        seekForwardTime: 15,
      });

      await this.registerAudioSourceCallbacks(nextAudioId);

      const readyPromise = this.waitForReady(nextAudioId);
      await this.audioPlayer.initialize({ audioId: nextAudioId });
      await Promise.race([readyPromise, this.delay(READY_WAIT_TIMEOUT_MS)]);

      if (!this.isLoadTaskActive(currentLoadTaskId, nextAudioId)) {
        await this.safeStopAndDestroyAudioSource(nextAudioId);
        return;
      }
      this.activeSourceReady = true;
      await this.refreshDuration(nextAudioId);
      this.emit({
        type: 'ready',
        trackId: track.id,
        durationMs: this.durationMs,
      });
    } catch (error: unknown) {
      this.emitError(track.id, error);
      await this.safeStopAndDestroyAudioSource(nextAudioId);
      if (this.activeAudioId === nextAudioId) {
        this.resetActiveSourceState();
      }
      throw error;
    } finally {
      this.readyWaiters.delete(nextAudioId);
      if (this.activeTrack?.id === track.id) {
        this.setBuffering(track.id, false);
      }
    }
  }

  async play(
    track: AudioServiceTrack,
    options: AudioServicePlayOptions = {}
  ): Promise<void> {
    await this.load(track);
    if (!this.isActiveTrack(track) || !this.activeSourceReady) {
      return;
    }
    if (!this.audioPlayer || !this.activeAudioId) {
      throw new Error('AudioPlayer source is not prepared for playback');
    }

    const activeAudioId = this.activeAudioId;
    const fadeInMs = Math.max(0, Math.floor(options.fadeInMs ?? 0));
    const startPositionMs = Math.max(
      0,
      Math.floor(options.startPositionMs ?? 0)
    );
    const commandId = this.startPlaybackCommand();
    this.autoReplayEnabled = Boolean(options.loop);

    if (typeof options.volume === 'number') {
      this.volume = clamp(options.volume, 0, 1);
    }
    if (typeof options.rate === 'number') {
      this.rate = clamp(options.rate, 0.5, 2);
    }

    this.fadeOperationId += 1;
    this.setBuffering(track.id, true);

    try {
      await this.audioPlayer.setRate({
        audioId: activeAudioId,
        rate: this.rate,
      });
      if (startPositionMs > 0 && !this.activeTrackUsesNativeLoop) {
        // Используется при iOS hard-recreate source: сохраняем позицию без
        // повторного пользовательского переключения трека.
        this.positionMs = startPositionMs;
        await this.audioPlayer.seek({
          audioId: activeAudioId,
          timeInSeconds: Math.floor(toSeconds(startPositionMs)),
        });
      }
      if (!this.isPlaybackCommandActive(commandId, activeAudioId)) return;

      if (fadeInMs > 0) {
        await this.applyVolume(activeAudioId, 0);
      } else {
        await this.applyVolume(activeAudioId, this.volume);
      }
      if (!this.isPlaybackCommandActive(commandId, activeAudioId)) return;

      this.suppressStatusEvent = true;
      try {
        await this.audioPlayer.play({ audioId: activeAudioId });
      } finally {
        this.suppressStatusEvent = false;
      }
      if (!this.isPlaybackCommandActive(commandId, activeAudioId)) return;

      this.isPlaying = true;
      this.startPositionClock(this.positionMs);
      this.startProgressPolling();
      this.setBuffering(track.id, false);
      this.emit({
        type: 'playing',
        trackId: track.id,
        positionMs: this.positionMs,
        durationMs: this.durationMs,
      });

      if (fadeInMs > 0) {
        // Fade не блокирует UI: старт уже произошёл, дальше плавно поднимаем громкость.
        void this.fadeToVolume(activeAudioId, this.volume, fadeInMs).catch(
          () => undefined
        );
      }
    } catch (error: unknown) {
      this.setBuffering(track.id, false);
      this.emitError(track.id, error);
      throw error;
    }
  }

  async pause(options: AudioServicePauseOptions = {}): Promise<void> {
    if (!this.audioPlayer || !this.activeAudioId || !this.activeTrack) return;

    const activeAudioId = this.activeAudioId;
    const activeTrackId = this.activeTrack.id;
    const fadeOutMs = Math.max(0, Math.floor(options.fadeOutMs ?? 0));
    const commandId = this.startPlaybackCommand();

    this.fadeOperationId += 1;
    if (fadeOutMs > 0) {
      await this.fadeToVolume(activeAudioId, 0, fadeOutMs);
    }
    if (!this.isPlaybackCommandActive(commandId, activeAudioId)) return;

    this.suppressStatusEvent = true;
    try {
      await this.audioPlayer.pause({ audioId: activeAudioId });
    } finally {
      this.suppressStatusEvent = false;
    }
    if (!this.isPlaybackCommandActive(commandId, activeAudioId)) return;

    await this.syncPositionFromNative(activeAudioId);
    if (!this.isPlaybackCommandActive(commandId, activeAudioId)) return;
    this.isPlaying = false;
    this.stopProgressPolling();
    this.stopPositionClock();
    this.setBuffering(activeTrackId, false);
    this.emit({
      type: 'paused',
      trackId: activeTrackId,
      positionMs: this.positionMs,
    });
  }

  async resume(options: AudioServiceResumeOptions = {}): Promise<void> {
    if (!this.audioPlayer || !this.activeAudioId || !this.activeTrack) return;

    const activeAudioId = this.activeAudioId;
    const activeTrackId = this.activeTrack.id;
    const fadeInMs = Math.max(0, Math.floor(options.fadeInMs ?? 0));
    const commandId = this.startPlaybackCommand();

    this.fadeOperationId += 1;
    this.setBuffering(activeTrackId, true);

    try {
      if (fadeInMs > 0) {
        await this.applyVolume(activeAudioId, 0);
      }
      if (!this.isPlaybackCommandActive(commandId, activeAudioId)) return;

      this.suppressStatusEvent = true;
      try {
        await this.audioPlayer.play({ audioId: activeAudioId });
      } finally {
        this.suppressStatusEvent = false;
      }
      if (!this.isPlaybackCommandActive(commandId, activeAudioId)) return;

      this.isPlaying = true;
      this.startPositionClock(this.positionMs);
      this.startProgressPolling();
      this.setBuffering(activeTrackId, false);
      this.emit({
        type: 'playing',
        trackId: activeTrackId,
        positionMs: this.positionMs,
        durationMs: this.durationMs,
      });

      if (fadeInMs > 0) {
        void this.fadeToVolume(activeAudioId, this.volume, fadeInMs).catch(
          () => undefined
        );
      } else if (this.currentVolume <= 0) {
        await this.applyVolume(activeAudioId, this.volume);
      }
    } catch (error) {
      this.setBuffering(activeTrackId, false);
      throw error;
    }
  }

  async stop(options: AudioServiceStopOptions = {}): Promise<void> {
    if (!this.audioPlayer || !this.activeAudioId || !this.activeTrack) return;

    const activeAudioId = this.activeAudioId;
    const activeTrackId = this.activeTrack.id;
    const fadeOutMs = Math.max(0, Math.floor(options.fadeOutMs ?? 0));
    const commandId = this.startPlaybackCommand();

    this.fadeOperationId += 1;
    this.autoReplayEnabled = false;
    this.suppressEndEvent = true;
    this.suppressStatusEvent = true;

    try {
      if (fadeOutMs > 0) {
        await this.fadeToVolume(activeAudioId, 0, fadeOutMs);
      }
      if (!this.isPlaybackCommandActive(commandId, activeAudioId)) return;
      await this.clearScheduledStopForAudioSource(activeAudioId);
      await this.audioPlayer.stop({ audioId: activeAudioId });
      await this.audioPlayer.destroy({ audioId: activeAudioId });
    } finally {
      this.suppressEndEvent = false;
      this.suppressStatusEvent = false;
    }

    this.resetActiveSourceState();
    this.setBuffering(activeTrackId, false);
    this.emit({
      type: 'stopped',
      trackId: activeTrackId,
    });
  }

  async seek(ms: number): Promise<void> {
    if (!this.audioPlayer || !this.activeAudioId || !this.activeTrack) return;

    const activeAudioId = this.activeAudioId;
    const activeTrack = this.activeTrack;
    const nextMs = clamp(
      Math.floor(ms),
      0,
      this.durationMs || Number.MAX_SAFE_INTEGER
    );
    this.positionMs = nextMs;
    this.startPositionClock(nextMs);

    await this.audioPlayer.seek({
      audioId: activeAudioId,
      timeInSeconds: Math.floor(toSeconds(nextMs)),
    });

    if (!this.isActiveAudioSource(activeAudioId, activeTrack)) return;

    await this.syncPositionFromNative(activeAudioId);
    if (!this.isActiveAudioSource(activeAudioId, activeTrack)) return;

    if (this.isPlaying) {
      this.emit({
        type: 'playing',
        trackId: this.activeTrack.id,
        positionMs: this.positionMs,
        durationMs: this.durationMs,
      });
    } else {
      this.emit({
        type: 'paused',
        trackId: this.activeTrack.id,
        positionMs: this.positionMs,
      });
    }
  }

  async setLoop(enabled: boolean): Promise<void> {
    // MediaGrid фиксирует native loop при create(). Для обычных треков repeat
    // реализуем через onAudioEnd, а настоящие loop-треки всегда создаём loop=true.
    this.autoReplayEnabled = enabled;
  }

  async setVolume(value: number, fadeMs = 0): Promise<void> {
    const nextVolume = clamp(value, 0, 1);
    this.volume = nextVolume;
    if (!this.audioPlayer || !this.activeAudioId) return;

    const durationMs = Math.max(0, Math.floor(fadeMs));
    if (durationMs > 0) {
      await this.fadeToVolume(this.activeAudioId, nextVolume, durationMs);
      return;
    }

    await this.applyVolume(this.activeAudioId, nextVolume);
  }

  async setRate(rate: number): Promise<void> {
    const nextRate = clamp(rate, 0.5, 2);
    this.rate = nextRate;
    if (!this.audioPlayer || !this.activeAudioId) return;

    await this.audioPlayer.setRate({
      audioId: this.activeAudioId,
      rate: nextRate,
    });
  }

  async scheduleStop(delayMs: number): Promise<void> {
    if (!this.supportsNativeScheduledStop()) return;
    if (!this.audioPlayer || !this.activeAudioId) return;
    await this.scheduleStopForAudioSource(this.activeAudioId, delayMs);
  }

  async clearScheduledStop(): Promise<void> {
    if (!this.supportsNativeScheduledStop()) return;
    if (!this.audioPlayer || !this.activeAudioId) return;
    await this.clearScheduledStopForAudioSource(this.activeAudioId);
  }

  getSnapshot(): AudioServiceSnapshot {
    return {
      trackId: this.activeTrack?.id ?? null,
      positionMs: this.isPlaying
        ? this.estimateCurrentPositionMs()
        : this.positionMs,
      durationMs: this.durationMs,
      isPlaying: this.isPlaying,
      isBuffering: this.isBuffering,
    };
  }

  subscribe(handler: AudioServiceEventHandler): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  async destroy(): Promise<void> {
    this.startPlaybackCommand();
    this.fadeOperationId += 1;
    this.loadTaskId += 1;
    await this.destroyActiveAudioSource();
    this.listeners.clear();
    this.audioPlayer = null;
    this.initialized = false;
  }

  private async registerAudioSourceCallbacks(audioId: string) {
    if (!this.audioPlayer) return;

    await this.audioPlayer.onAudioReady({ audioId }, () => {
      const waiter = this.readyWaiters.get(audioId);
      if (waiter) {
        waiter.resolve();
      }
      void this.refreshDuration(audioId);
    });

    await this.audioPlayer.onAudioEnd({ audioId }, () => {
      void this.handleAudioEnd(audioId);
    });

    await this.audioPlayer.onPlaybackStatusChange({ audioId }, ({ status }) => {
      this.handlePlaybackStatus(audioId, status);
    });
  }

  private waitForReady(audioId: string) {
    return new Promise<void>((resolve) => {
      this.readyWaiters.set(audioId, {
        resolve,
      });
    });
  }

  private isLoadTaskActive(loadTaskId: number, audioId: string) {
    return this.loadTaskId === loadTaskId && this.activeAudioId === audioId;
  }

  private isActiveTrack(track: AudioServiceTrack) {
    return (
      this.activeTrack?.id === track.id && this.activeTrack.url === track.url
    );
  }

  private isActiveAudioSource(audioId: string, track: AudioServiceTrack) {
    return this.activeAudioId === audioId && this.isActiveTrack(track);
  }

  private startPlaybackCommand() {
    this.playbackCommandId += 1;
    return this.playbackCommandId;
  }

  private isPlaybackCommandActive(commandId: number, audioId: string) {
    return (
      this.playbackCommandId === commandId && this.activeAudioId === audioId
    );
  }

  private emit(event: AudioServiceEvent) {
    for (const handler of this.listeners) {
      try {
        handler(event);
      } catch (error) {
        console.error('[NativeAudioService] Listener failed:', error);
      }
    }
  }

  private emitError(trackId: string, error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown native audio error';
    this.emit({
      type: 'error',
      trackId,
      message,
    });
  }

  private setBuffering(trackId: string, isBuffering: boolean) {
    this.isBuffering = isBuffering;
    this.emit({
      type: 'buffering',
      trackId,
      isBuffering,
    });
  }

  private async refreshDuration(audioId: string) {
    if (
      !this.audioPlayer ||
      this.activeAudioId !== audioId ||
      !this.activeTrack
    )
      return;

    const fallbackDurationMs = this.getTrackDurationFallbackMs(
      this.activeTrack
    );
    if (!this.shouldReadNativeProgress(audioId)) {
      this.durationMs = fallbackDurationMs || this.durationMs;
      return;
    }

    const nativeDurationMs = await this.safeReadDurationMs(audioId);
    if (this.activeAudioId !== audioId) return;

    this.durationMs = nativeDurationMs || fallbackDurationMs || this.durationMs;
  }

  private async safeReadDurationMs(audioId: string) {
    if (!this.audioPlayer || !this.shouldReadNativeProgress(audioId)) return 0;
    try {
      const { duration } = await this.audioPlayer.getDuration({ audioId });
      return normalizeDurationMs(toMs(duration));
    } catch {
      return 0;
    }
  }

  private async syncPositionFromNative(audioId: string) {
    if (!this.audioPlayer || this.activeAudioId !== audioId) return;
    if (!this.shouldReadNativeProgress(audioId)) {
      this.positionMs = this.estimateCurrentPositionMs();
      return;
    }

    try {
      const { currentTime } = await this.audioPlayer.getCurrentTime({
        audioId,
      });
      if (this.activeAudioId !== audioId) return;

      const nativePositionMs = normalizeDurationMs(toMs(currentTime));
      if (nativePositionMs > 0 || this.positionMs <= 0) {
        this.positionMs = nativePositionMs;
        this.startPositionClock(nativePositionMs);
      }
    } catch {
      if (this.activeAudioId !== audioId) return;
      this.positionMs = this.estimateCurrentPositionMs();
    }
  }

  private shouldReadNativeProgress(audioId: string) {
    // Для native loop MediaGrid не отдаёт progress; используем DTO-duration и локальный clock.
    return (
      this.activeAudioId === audioId &&
      this.activeSourceReady &&
      !this.activeTrackUsesNativeLoop
    );
  }

  private async applyVolume(audioId: string, value: number) {
    if (!this.audioPlayer) return;
    const normalized = clamp(value, 0, 1);
    await this.audioPlayer.setVolume({
      audioId,
      volume: normalized,
    });
    this.currentVolume = normalized;
  }

  private async fadeToVolume(
    audioId: string,
    targetVolume: number,
    durationMs: number
  ) {
    const normalizedDurationMs = Math.max(0, Math.floor(durationMs));
    if (normalizedDurationMs <= 0) {
      await this.applyVolume(audioId, targetVolume);
      return;
    }

    const operationId = ++this.fadeOperationId;
    const startVolume = this.currentVolume;
    const endVolume = clamp(targetVolume, 0, 1);
    const steps = Math.max(1, Math.floor(normalizedDurationMs / 50));
    const stepDelayMs = Math.max(16, Math.floor(normalizedDurationMs / steps));

    for (let step = 1; step <= steps; step += 1) {
      if (operationId !== this.fadeOperationId) {
        return;
      }
      if (this.activeAudioId !== audioId) {
        return;
      }

      const progress = step / steps;
      const nextVolume = startVolume + (endVolume - startVolume) * progress;
      await this.applyVolume(audioId, nextVolume);

      if (step < steps) {
        await this.delay(stepDelayMs);
      }
    }
  }

  private async handleAudioEnd(audioId: string) {
    if (this.suppressEndEvent) return;
    if (
      !this.audioPlayer ||
      this.activeAudioId !== audioId ||
      !this.activeTrack
    ) {
      return;
    }

    const track = this.activeTrack;
    this.stopProgressPolling();
    this.stopPositionClock();
    this.positionMs = 0;

    if (this.autoReplayEnabled && !this.activeTrackUsesNativeLoop) {
      await this.audioPlayer.seek({ audioId, timeInSeconds: 0 });
      await this.audioPlayer.play({ audioId });
      this.isPlaying = true;
      this.startPositionClock(0);
      this.startProgressPolling();
      this.emit({
        type: 'playing',
        trackId: track.id,
        positionMs: 0,
        durationMs: this.durationMs,
      });
      return;
    }

    this.isPlaying = false;
    this.suppressStatusEvent = true;
    try {
      await this.audioPlayer.stop({ audioId });
    } finally {
      this.suppressStatusEvent = false;
    }
    this.emit({
      type: 'ended',
      trackId: track.id,
    });
  }

  private handlePlaybackStatus(audioId: string, status: PlaybackStatus) {
    if (this.suppressStatusEvent) return;
    if (this.activeAudioId !== audioId || !this.activeTrack) return;

    if (status === 'playing') {
      this.isPlaying = true;
      this.startPositionClock(this.positionMs);
      this.startProgressPolling();
      this.emit({
        type: 'playing',
        trackId: this.activeTrack.id,
        positionMs: this.positionMs,
        durationMs: this.durationMs,
      });
      return;
    }

    if (status === 'paused') {
      this.positionMs = this.estimateCurrentPositionMs();
      this.isPlaying = false;
      this.stopProgressPolling();
      this.stopPositionClock();
      this.emit({
        type: 'paused',
        trackId: this.activeTrack.id,
        positionMs: this.positionMs,
      });
      return;
    }

    this.isPlaying = false;
    this.positionMs = 0;
    this.stopProgressPolling();
    this.stopPositionClock();
    this.emit({
      type: 'stopped',
      trackId: this.activeTrack.id,
    });
  }

  private startProgressPolling() {
    this.stopProgressPolling();
    this.progressPollTickInFlight = false;
    this.progressPollInterval = setInterval(() => {
      void this.pollProgressTick();
    }, PROGRESS_POLL_MS);
  }

  private stopProgressPolling() {
    if (!this.progressPollInterval) return;
    clearInterval(this.progressPollInterval);
    this.progressPollInterval = null;
    this.progressPollTickInFlight = false;
  }

  private async pollProgressTick() {
    if (this.progressPollTickInFlight) return;
    if (!this.isPlaying) return;
    if (!this.activeAudioId || !this.activeTrack) return;

    // Фиксируем source на весь async tick: при переключении activeAudioId может смениться между native awaits.
    const audioId = this.activeAudioId;
    const track = this.activeTrack;
    this.progressPollTickInFlight = true;
    try {
      await this.syncPositionFromNative(audioId);
      if (!this.isActiveAudioSource(audioId, track)) return;

      await this.refreshDuration(audioId);
      if (!this.isActiveAudioSource(audioId, track)) return;

      this.emit({
        type: 'playing',
        trackId: track.id,
        positionMs: this.positionMs,
        durationMs: this.durationMs,
      });
    } finally {
      this.progressPollTickInFlight = false;
    }
  }

  private startPositionClock(anchorMs: number) {
    this.positionClockAnchorMs = Math.max(0, Math.floor(anchorMs));
    this.positionClockStartedAtMs = Date.now();
  }

  private stopPositionClock() {
    this.positionClockAnchorMs = this.positionMs;
    this.positionClockStartedAtMs = 0;
  }

  private estimateCurrentPositionMs() {
    if (!this.isPlaying || this.positionClockStartedAtMs <= 0) {
      return this.positionMs;
    }

    const elapsedMs = Math.max(0, Date.now() - this.positionClockStartedAtMs);
    const nextMs = this.positionClockAnchorMs + elapsedMs * this.rate;
    if (
      this.durationMs > 0 &&
      (this.activeTrackUsesNativeLoop || this.autoReplayEnabled)
    ) {
      return Math.round(nextMs % this.durationMs);
    }
    if (this.durationMs > 0) {
      return Math.min(Math.round(nextMs), this.durationMs);
    }
    return Math.max(0, Math.round(nextMs));
  }

  private getTrackDurationFallbackMs(track: AudioServiceTrack | null) {
    if (!track || typeof track.durationMs !== 'number') return 0;
    return Math.max(0, Math.floor(track.durationMs));
  }

  private async destroyActiveAudioSource() {
    if (!this.audioPlayer || !this.activeAudioId) {
      this.resetActiveSourceState();
      return;
    }

    const audioId = this.activeAudioId;
    this.suppressEndEvent = true;
    this.suppressStatusEvent = true;
    try {
      await this.safeStopAndDestroyAudioSource(audioId);
    } finally {
      this.suppressEndEvent = false;
      this.suppressStatusEvent = false;
    }
    this.resetActiveSourceState();
  }

  private resetActiveSourceState() {
    this.resolveAndClearReadyWaiters();
    this.stopProgressPolling();
    this.stopPositionClock();
    this.activeTrack = null;
    this.activeAudioId = null;
    this.activeSourceReady = false;
    this.activeTrackUsesNativeLoop = false;
    this.activeTrackUsesNotification = true;
    this.activeTrackIsBackgroundMusic = false;
    this.positionMs = 0;
    this.durationMs = 0;
    this.isPlaying = false;
    this.isBuffering = false;
    this.currentVolume = this.volume;
    this.autoReplayEnabled = false;
  }

  private async safeStopAndDestroyAudioSource(audioId: string) {
    if (!this.audioPlayer) return;
    await this.safeCall(() => this.clearScheduledStopForAudioSource(audioId));
    await this.safeCall(() => this.audioPlayer!.stop({ audioId }));
    await this.safeCall(() => this.audioPlayer!.destroy({ audioId }));
  }

  private async scheduleStopForAudioSource(audioId: string, delayMs: number) {
    if (!this.supportsNativeScheduledStop()) return;
    if (!this.audioPlayer) return;
    const audioPlayer = this.audioPlayer as AudioPlayerWithScheduledStop;
    if (typeof audioPlayer.scheduleStop !== 'function') return;
    await audioPlayer.scheduleStop({
      audioId,
      delayMs: Math.max(0, Math.floor(delayMs)),
    });
  }

  private async clearScheduledStopForAudioSource(audioId: string) {
    if (!this.supportsNativeScheduledStop()) return;
    if (!this.audioPlayer) return;
    const audioPlayer = this.audioPlayer as AudioPlayerWithScheduledStop;
    if (typeof audioPlayer.clearScheduledStop !== 'function') return;
    await audioPlayer.clearScheduledStop({ audioId });
  }

  private supportsNativeScheduledStop() {
    try {
      // Этот метод добавлен патчем только на Android: iOS оставляем на штатном JS-timer flow.
      return Capacitor.getPlatform() === 'android';
    } catch {
      return false;
    }
  }

  private resolveAndClearReadyWaiters() {
    for (const waiter of this.readyWaiters.values()) {
      waiter.resolve();
    }
    this.readyWaiters.clear();
  }

  private async safeCall(callback: () => Promise<void>) {
    try {
      await callback();
    } catch {
      // Техническая очистка не должна падать наружу.
    }
  }

  private async delay(ms: number) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, Math.max(0, ms));
    });
  }
}
