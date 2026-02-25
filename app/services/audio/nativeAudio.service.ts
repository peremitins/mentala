import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import type {
  CompletedEvent as NativeCompleteEvent,
  ConfigureOptions,
  CurrentTimeEvent as NativeCurrentTimeEvent,
  NativeAudio as NativeAudioPlugin,
  NotificationMetadata,
  PreloadOptions,
} from '@capgo/native-audio';
import {
  startAudioForegroundService,
  stopAudioForegroundService,
} from '@/app/services/audio/androidForegroundBridge';
import { resolveNativeAudioPlatformProfile } from '@/app/services/audio/nativeAudio.platform';
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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function toSeconds(ms: number) {
  return Math.max(0, ms) / 1000;
}

function toMs(seconds: number) {
  return Math.max(0, seconds) * 1000;
}

function toAssetId(trackId: string) {
  return `meditation_${trackId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

type FilesystemRuntimeModule = typeof import('@capacitor/filesystem');

export class NativeAudioService implements AudioService {
  private readonly platformProfile = resolveNativeAudioPlatformProfile();
  private nativeAudio: NativeAudioPlugin | null = null;
  private initialized = false;
  private listeners = new Set<AudioServiceEventHandler>();
  private listenerHandles: PluginListenerHandle[] = [];
  private activeTrack: AudioServiceTrack | null = null;
  private activeAssetId: string | null = null;
  private activeAssetIsRemote = false;
  private positionMs = 0;
  private durationMs = 0;
  private isPlaying = false;
  private isBuffering = false;
  private volume = 1;
  private rate = 1;
  private currentVolume = 1;
  private autoReplayEnabled = false;
  private usingNativeLoop = false;
  private completeGuard = false;
  private fadeOperationId = 0;
  private durationResolveTaskId = 0;
  private progressPollInterval: ReturnType<typeof setInterval> | null = null;
  private progressPollTickInFlight = false;
  private positionClockStartedAtMs = 0;
  private positionClockAnchorMs = 0;
  private lastSeekAtMs = 0;
  private pendingSeekTargetMs: number | null = null;
  private pendingSeekExpiresAtMs = 0;

  async init(): Promise<void> {
    if (this.initialized) return;
    if (!Capacitor.isPluginAvailable('NativeAudio')) {
      throw new Error('NativeAudio plugin is not available on this platform');
    }

    const module = await import('@capgo/native-audio');
    this.nativeAudio = module.NativeAudio;
    await this.registerListeners();
    await this.configureEngine();
    this.initialized = true;
  }

  async load(track: AudioServiceTrack): Promise<void> {
    await this.init();
    if (!this.nativeAudio) {
      throw new Error('NativeAudio bridge is not initialized');
    }

    const previousAssetId = this.activeAssetId;
    const nextAssetId = toAssetId(track.id);
    const hasSameAsset =
      previousAssetId === nextAssetId && this.activeTrack?.url === track.url;

    if (hasSameAsset) {
      this.activeTrack = track;
      this.activeAssetId = nextAssetId;
      if (this.durationMs <= 0) {
        this.durationMs = this.getTrackDurationFallbackMs(track);
      }
      this.emit({
        type: 'ready',
        trackId: track.id,
        durationMs: this.durationMs,
      });
      return;
    }

    this.durationResolveTaskId += 1;
    const durationResolveTaskId = this.durationResolveTaskId;
    this.fadeOperationId += 1;
    this.activeTrack = track;
    this.activeAssetId = nextAssetId;
    this.positionMs = 0;
    this.clearPendingSeekState();
    this.stopPositionClock();
    this.isPlaying = false;
    this.setBuffering(track.id, true);
    await this.safeStopAndUnloadAsset(previousAssetId);

    try {
      const source = await this.resolveTrackSource(track);
      this.activeAssetIsRemote = source.isRemote;

      const preloadOptions: PreloadOptions = {
        assetId: nextAssetId,
        assetPath: source.assetPath,
        isUrl: source.isUrl,
        audioChannelNum: 1,
        volume: this.volume,
      };

      const metadata: NotificationMetadata = {
        title: track.title,
        artist:
          track.category === 'breathing' ? 'Breathing Practice' : 'Meditation',
      };
      if (track.artworkUrl) {
        metadata.artworkUrl = track.artworkUrl;
      }
      preloadOptions.notificationMetadata = metadata;

      await this.nativeAudio.preload(preloadOptions);
      const nativeDurationMs = await this.safeReadDurationMs(nextAssetId);
      const fallbackDurationMs = this.getTrackDurationFallbackMs(track);
      this.durationMs =
        nativeDurationMs > 0 ? nativeDurationMs : fallbackDurationMs;
      this.currentVolume = this.volume;
      this.emit({
        type: 'ready',
        trackId: track.id,
        durationMs: this.durationMs,
      });

      if (nativeDurationMs <= 0) {
        // Дожидаемся, пока нативный движок дочитает metadata удалённого файла.
        void this.resolveDurationFromNative(
          nextAssetId,
          track.id,
          durationResolveTaskId
        );
      }
    } catch (error: unknown) {
      this.emitError(track.id, error);
      throw error;
    } finally {
      this.setBuffering(track.id, false);
    }
  }

  async play(
    track: AudioServiceTrack,
    options: AudioServicePlayOptions = {}
  ): Promise<void> {
    await this.init();
    if (!this.nativeAudio) {
      throw new Error('NativeAudio bridge is not initialized');
    }

    await this.load(track);
    if (!this.activeAssetId) {
      throw new Error('Asset is not prepared for playback');
    }

    const shouldLoop = Boolean(track.isLoop) || Boolean(options.loop);
    this.autoReplayEnabled = shouldLoop;
    this.usingNativeLoop = Boolean(track.isLoop) && shouldLoop;

    if (typeof options.volume === 'number') {
      this.volume = clamp(options.volume, 0, 1);
    }
    if (typeof options.rate === 'number') {
      this.rate = clamp(options.rate, 0.5, 2);
    }

    const activeAssetId = this.activeAssetId;
    const fadeInMs = Math.max(0, Math.floor(options.fadeInMs ?? 0));
    const durationResolveTaskId = this.durationResolveTaskId;
    this.fadeOperationId += 1;
    this.setBuffering(track.id, true);
    await startAudioForegroundService({
      title: track.title,
      subtitle:
        track.category === 'breathing' ? 'Дыхательная практика' : 'Медитация',
    });

    try {
      await this.nativeAudio.setRate({
        assetId: activeAssetId,
        rate: this.rate,
      });

      if (fadeInMs > 0) {
        await this.applyVolume(activeAssetId, 0);
      } else {
        await this.applyVolume(activeAssetId, this.volume);
      }

      if (this.usingNativeLoop) {
        await this.startNativeLoopPlayback(activeAssetId);
      } else {
        await this.nativeAudio.play({
          assetId: activeAssetId,
        });
      }

      this.isPlaying = true;
      if (this.shouldUsePositionClockFallback()) {
        this.startPositionClock(this.positionMs);
      }
      this.setBuffering(track.id, false);
      this.startProgressPolling();
      this.emit({
        type: 'playing',
        trackId: track.id,
        positionMs: this.positionMs,
        durationMs: this.durationMs,
      });

      if (fadeInMs > 0) {
        // Fade делаем в фоне, чтобы UI сразу получил факт старта воспроизведения.
        void this.fadeToVolume(activeAssetId, this.volume, fadeInMs).catch(
          () => {
            // При смене трека fade может быть прерван — это нормальный сценарий.
          }
        );
      }

      if (this.durationMs <= 0) {
        void this.resolveDurationFromNative(
          activeAssetId,
          track.id,
          durationResolveTaskId
        );
      }
    } catch (error: unknown) {
      this.setBuffering(track.id, false);
      await stopAudioForegroundService();
      this.emitError(track.id, error);
      throw error;
    }
  }

  async pause(options: AudioServicePauseOptions = {}): Promise<void> {
    if (!this.nativeAudio || !this.activeAssetId || !this.activeTrack) return;

    const activeAssetId = this.activeAssetId;
    const activeTrackId = this.activeTrack.id;
    const fadeOutMs = Math.max(0, Math.floor(options.fadeOutMs ?? 0));

    this.fadeOperationId += 1;

    if (fadeOutMs > 0) {
      await this.fadeToVolume(activeAssetId, 0, fadeOutMs);
    }

    await this.nativeAudio.pause({ assetId: activeAssetId });

    this.isPlaying = false;
    this.stopProgressPolling();
    const pausedPositionMs = await this.safeReadCurrentTimeMs(activeAssetId);
    this.positionMs =
      pausedPositionMs > 0
        ? pausedPositionMs
        : this.shouldUsePositionClockFallback()
          ? this.estimateCurrentPositionMs()
          : this.positionMs;
    this.clearPendingSeekState();
    this.stopPositionClock();
    this.setBuffering(activeTrackId, false);
    this.emit({
      type: 'paused',
      trackId: activeTrackId,
      positionMs: this.positionMs,
    });

    await stopAudioForegroundService();
  }

  async resume(options: AudioServiceResumeOptions = {}): Promise<void> {
    if (!this.nativeAudio || !this.activeAssetId || !this.activeTrack) return;

    const activeAssetId = this.activeAssetId;
    const activeTrackId = this.activeTrack.id;
    const fadeInMs = Math.max(0, Math.floor(options.fadeInMs ?? 0));
    const durationResolveTaskId = this.durationResolveTaskId;

    this.fadeOperationId += 1;
    this.setBuffering(activeTrackId, true);

    await startAudioForegroundService({
      title: this.activeTrack.title,
      subtitle:
        this.activeTrack.category === 'breathing'
          ? 'Дыхательная практика'
          : 'Медитация',
    });

    try {
      if (fadeInMs > 0) {
        await this.applyVolume(activeAssetId, 0);
      }

      await this.nativeAudio.resume({ assetId: activeAssetId });

      this.isPlaying = true;
      if (this.shouldUsePositionClockFallback()) {
        this.startPositionClock(this.positionMs);
      }
      this.setBuffering(activeTrackId, false);
      this.startProgressPolling();
      this.emit({
        type: 'playing',
        trackId: activeTrackId,
        positionMs: this.positionMs,
        durationMs: this.durationMs,
      });

      if (fadeInMs > 0) {
        // Не блокируем resume для UI-индикаторов.
        void this.fadeToVolume(activeAssetId, this.volume, fadeInMs).catch(
          () => {
            // Прерывание fade при stop/pause не является ошибкой.
          }
        );
      } else if (this.currentVolume <= 0) {
        await this.applyVolume(activeAssetId, this.volume);
      }

      if (this.durationMs <= 0) {
        void this.resolveDurationFromNative(
          activeAssetId,
          activeTrackId,
          durationResolveTaskId
        );
      }
    } catch (error) {
      this.setBuffering(activeTrackId, false);
      await stopAudioForegroundService();
      throw error;
    }
  }

  async stop(options: AudioServiceStopOptions = {}): Promise<void> {
    if (!this.nativeAudio || !this.activeAssetId || !this.activeTrack) return;

    const activeAssetId = this.activeAssetId;
    const activeTrackId = this.activeTrack.id;
    const fadeOutMs = Math.max(0, Math.floor(options.fadeOutMs ?? 0));

    this.fadeOperationId += 1;
    // Явный stop не должен триггерить автоповтор по complete-событию.
    this.autoReplayEnabled = false;
    this.usingNativeLoop = false;
    this.completeGuard = true;

    try {
      if (fadeOutMs > 0) {
        await this.fadeToVolume(activeAssetId, 0, fadeOutMs);
      }

      await this.nativeAudio.stop({
        assetId: activeAssetId,
      });

      // Важно для Android: после явного stop удаляем asset из нативного плеера.
      // Иначе ExoPlayer может самовосстановиться по audio-focus и дать "призрачный"
      // рестарт трека при уже закрытом mini-player.
      await this.safeCall(() =>
        this.nativeAudio!.unload({
          assetId: activeAssetId,
        })
      );
    } finally {
      this.completeGuard = false;
    }

    this.isPlaying = false;
    this.stopProgressPolling();
    this.positionMs = 0;
    this.clearPendingSeekState();
    this.stopPositionClock();
    this.activeAssetId = null;
    this.activeTrack = null;
    this.activeAssetIsRemote = false;
    this.durationMs = 0;
    this.durationResolveTaskId += 1;
    this.currentVolume = this.volume;
    this.setBuffering(activeTrackId, false);
    this.emit({
      type: 'stopped',
      trackId: activeTrackId,
    });

    await stopAudioForegroundService();
  }

  async seek(ms: number): Promise<void> {
    if (!this.nativeAudio || !this.activeAssetId || !this.activeTrack) return;

    const nextMs = clamp(
      Math.floor(ms),
      0,
      this.durationMs || Number.MAX_SAFE_INTEGER
    );
    this.lastSeekAtMs = Date.now();
    this.markSeekPending(nextMs);
    if (this.shouldUseSeekPlayFallback()) {
      // На iOS для remote-аудио play(time) обычно надёжнее setCurrentTime.
      await this.seekWithPlayFallback(nextMs);
    } else {
      await this.nativeAudio.setCurrentTime({
        assetId: this.activeAssetId,
        time: toSeconds(nextMs),
      });
    }

    const resolvedMs = await this.resolveSeekPositionMs(nextMs);
    this.positionMs = resolvedMs;
    if (this.platformProfile.shouldResolveSeekPositionFromNative) {
      this.confirmPendingSeekPosition(resolvedMs);
    }
    if (this.isPlaying && this.shouldUsePositionClockFallback()) {
      this.startPositionClock(this.positionMs);
    } else {
      this.stopPositionClock();
    }

    if (this.isPlaying) {
      this.emit({
        type: 'playing',
        trackId: this.activeTrack.id,
        positionMs: this.positionMs,
        durationMs: this.durationMs,
      });
      return;
    }

    this.emit({
      type: 'paused',
      trackId: this.activeTrack.id,
      positionMs: this.positionMs,
    });
  }

  async setLoop(enabled: boolean): Promise<void> {
    this.autoReplayEnabled = enabled;
    if (!this.nativeAudio || !this.activeAssetId || !this.activeTrack) return;

    if (!this.activeTrack.isLoop) {
      // Для non-loop треков повтор обрабатывается через complete listener.
      return;
    }

    if (enabled && this.isPlaying && !this.usingNativeLoop) {
      this.usingNativeLoop = true;
      await this.nativeAudio.loop({
        assetId: this.activeAssetId,
      });
      return;
    }

    if (!enabled && this.isPlaying && this.usingNativeLoop) {
      // Плагин не даёт прямого "unloop", поэтому переключаемся на обычный play с текущей позиции.
      const resumeMs = this.positionMs;
      this.usingNativeLoop = false;
      await this.nativeAudio.stop({ assetId: this.activeAssetId });
      await this.applyVolume(this.activeAssetId, this.volume);
      await this.nativeAudio.play({
        assetId: this.activeAssetId,
        time: toSeconds(resumeMs),
      });
      this.isPlaying = true;
      this.emit({
        type: 'playing',
        trackId: this.activeTrack.id,
        positionMs: this.positionMs,
        durationMs: this.durationMs,
      });
    }
  }

  async setVolume(value: number, fadeMs = 0): Promise<void> {
    const nextVolume = clamp(value, 0, 1);
    this.volume = nextVolume;
    if (!this.nativeAudio || !this.activeAssetId) return;

    const durationMs = Math.max(0, Math.floor(fadeMs));
    if (durationMs > 0) {
      await this.fadeToVolume(this.activeAssetId, nextVolume, durationMs);
      return;
    }

    await this.applyVolume(this.activeAssetId, nextVolume);
  }

  async setRate(rate: number): Promise<void> {
    const nextRate = clamp(rate, 0.5, 2);
    this.rate = nextRate;
    if (!this.nativeAudio || !this.activeAssetId) return;

    await this.nativeAudio.setRate({
      assetId: this.activeAssetId,
      rate: nextRate,
    });
  }

  getSnapshot(): AudioServiceSnapshot {
    const effectivePositionMs =
      this.isPlaying && this.shouldUsePositionClockFallback()
        ? Math.max(this.positionMs, this.estimateCurrentPositionMs())
        : this.positionMs;

    return {
      trackId: this.activeTrack?.id ?? null,
      positionMs: effectivePositionMs,
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
    this.fadeOperationId += 1;

    if (this.nativeAudio && this.activeAssetId) {
      await this.safeCall(() =>
        this.nativeAudio!.stop({ assetId: this.activeAssetId as string })
      );
      await this.safeCall(() =>
        this.nativeAudio!.unload({ assetId: this.activeAssetId as string })
      );
    }

    for (const handle of this.listenerHandles) {
      await this.safeCall(() => handle.remove());
    }
    this.listenerHandles = [];

    if (this.nativeAudio?.deinitPlugin) {
      await this.safeCall(() => this.nativeAudio!.deinitPlugin!());
    }

    await stopAudioForegroundService();

    this.nativeAudio = null;
    this.initialized = false;
    this.activeTrack = null;
    this.activeAssetId = null;
    this.activeAssetIsRemote = false;
    this.durationResolveTaskId += 1;
    this.stopProgressPolling();
    this.positionMs = 0;
    this.clearPendingSeekState();
    this.durationMs = 0;
    this.stopPositionClock();
    this.isPlaying = false;
    this.isBuffering = false;
    this.currentVolume = this.volume;
    this.autoReplayEnabled = false;
    this.usingNativeLoop = false;
    this.completeGuard = false;
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

  private async configureEngine() {
    if (!this.nativeAudio || !Capacitor.isNativePlatform()) return;

    const platform = Capacitor.getPlatform();
    const options: ConfigureOptions = {
      focus: true,
      showNotification: true,
      background: true,
    };

    if (platform === 'ios') {
      options.ignoreSilent = true;
    }

    await this.nativeAudio.configure(options);
  }

  private async registerListeners() {
    if (!this.nativeAudio) return;

    const completeHandle = await this.nativeAudio.addListener(
      'complete',
      (event) => {
        void this.handleCompleteEvent(event);
      }
    );
    this.listenerHandles.push(completeHandle);

    const currentTimeHandle = await this.nativeAudio.addListener(
      'currentTime',
      (event) => {
        this.handleCurrentTimeEvent(event);
      }
    );
    this.listenerHandles.push(currentTimeHandle);
  }

  private handleCurrentTimeEvent(event: NativeCurrentTimeEvent) {
    if (!this.activeAssetId || event.assetId !== this.activeAssetId) return;
    if (!this.activeTrack) return;

    const nativePositionMs = Math.max(0, Math.round(toMs(event.currentTime)));
    this.applyNativePosition(nativePositionMs);

    if (this.durationMs <= 0) {
      const fallbackDurationMs = this.getTrackDurationFallbackMs(
        this.activeTrack
      );
      if (fallbackDurationMs > 0) {
        this.durationMs = fallbackDurationMs;
        this.emit({
          type: 'ready',
          trackId: this.activeTrack.id,
          durationMs: this.durationMs,
        });
      } else {
        void this.resolveDurationFromNative(
          this.activeAssetId,
          this.activeTrack.id,
          this.durationResolveTaskId
        );
      }
    }

    if (this.isBuffering && this.positionMs > 0) {
      this.setBuffering(this.activeTrack.id, false);
    }

    if (!this.isPlaying) return;
    this.emit({
      type: 'playing',
      trackId: this.activeTrack.id,
      positionMs: this.positionMs,
      durationMs: this.durationMs,
    });
  }

  private async handleCompleteEvent(event: NativeCompleteEvent) {
    if (this.completeGuard) return;
    if (!this.activeAssetId || event.assetId !== this.activeAssetId) return;
    if (!this.activeTrack || !this.nativeAudio) return;

    // Для нативного loop complete обычно не приходит, но страхуемся.
    if (this.usingNativeLoop) {
      this.completeGuard = true;
      try {
        await this.nativeAudio.loop({
          assetId: this.activeAssetId,
        });
      } finally {
        this.completeGuard = false;
      }
      return;
    }

    if (this.autoReplayEnabled) {
      this.completeGuard = true;
      try {
        await this.nativeAudio.play({
          assetId: this.activeAssetId,
          time: 0,
        });
        await this.applyVolume(this.activeAssetId, this.volume);
        this.positionMs = 0;
        this.clearPendingSeekState();
        this.isPlaying = true;
        if (this.shouldUsePositionClockFallback()) {
          this.startPositionClock(0);
        } else {
          this.stopPositionClock();
        }
        this.startProgressPolling();
      } finally {
        this.completeGuard = false;
      }
      return;
    }

    this.isPlaying = false;
    this.stopProgressPolling();
    this.positionMs = 0;
    this.clearPendingSeekState();
    this.stopPositionClock();
    this.setBuffering(this.activeTrack.id, false);
    this.emit({
      type: 'ended',
      trackId: this.activeTrack.id,
    });
    await stopAudioForegroundService();
  }

  private setBuffering(trackId: string, isBuffering: boolean) {
    this.isBuffering = isBuffering;
    this.emit({
      type: 'buffering',
      trackId,
      isBuffering,
    });
  }

  private async readDurationMs(assetId: string) {
    if (!this.nativeAudio) return 0;
    const { duration } = await this.nativeAudio.getDuration({ assetId });
    return Math.max(0, Math.round(toMs(duration)));
  }

  private async safeReadDurationMs(assetId: string) {
    try {
      return await this.readDurationMs(assetId);
    } catch {
      // Ошибка чтения метаданных не должна срывать старт воспроизведения.
      return 0;
    }
  }

  private async safeReadCurrentTimeMs(assetId: string) {
    try {
      return await this.readCurrentTimeMs(assetId);
    } catch {
      return this.positionMs;
    }
  }

  private async readCurrentTimeMs(assetId: string) {
    if (!this.nativeAudio) return 0;
    const { currentTime } = await this.nativeAudio.getCurrentTime({ assetId });
    return Math.max(0, Math.round(toMs(currentTime)));
  }

  private async safeStopAndUnloadAsset(assetId: string | null) {
    if (!this.nativeAudio || !assetId) return;

    await this.safeCall(() => this.nativeAudio!.stop({ assetId }));
    await this.safeCall(() => this.nativeAudio!.unload({ assetId }));
  }

  private async safeCall(callback: () => Promise<void>) {
    try {
      await callback();
    } catch {
      // Техническая очистка не должна падать наружу.
    }
  }

  private getTrackDurationFallbackMs(track: AudioServiceTrack | null) {
    if (!track || typeof track.durationMs !== 'number') return 0;
    return Math.max(0, Math.floor(track.durationMs));
  }

  private async applyVolume(assetId: string, value: number) {
    if (!this.nativeAudio) return;

    const normalized = clamp(value, 0, 1);
    await this.nativeAudio.setVolume({
      assetId,
      volume: normalized,
    });
    this.currentVolume = normalized;
  }

  private async fadeToVolume(
    assetId: string,
    targetVolume: number,
    durationMs: number
  ) {
    const normalizedDurationMs = Math.max(0, Math.floor(durationMs));
    if (normalizedDurationMs <= 0) {
      await this.applyVolume(assetId, targetVolume);
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

      const progress = step / steps;
      const nextVolume = startVolume + (endVolume - startVolume) * progress;
      await this.applyVolume(assetId, nextVolume);

      if (step < steps) {
        await this.delay(stepDelayMs);
      }
    }
  }

  private async delay(ms: number) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, Math.max(0, ms));
    });
  }

  private async startNativeLoopPlayback(assetId: string) {
    if (!this.nativeAudio) return;

    if (this.platformProfile.kind === 'ios') {
      // На iOS сначала делаем обычный play, чтобы гарантированно обновился
      // MPNowPlayingInfo / Remote Command Center, затем переключаем в loop.
      await this.nativeAudio.play({ assetId });
      if (this.platformProfile.nowPlayingPrimeDelayMs > 0) {
        await this.delay(this.platformProfile.nowPlayingPrimeDelayMs);
      }
      await this.nativeAudio.loop({ assetId });
      return;
    }

    // На Android сразу используем loop(), чтобы не разрывать seek/progress
    // двойным стартом (play -> loop).
    await this.nativeAudio.loop({ assetId });
  }

  private startProgressPolling() {
    this.stopProgressPolling();
    if (!this.shouldUseProgressPollingFallback()) return;
    this.progressPollTickInFlight = false;
    this.progressPollInterval = setInterval(() => {
      void this.pollProgressTick();
    }, 250);
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
    if (!this.nativeAudio || !this.activeAssetId || !this.activeTrack) return;

    this.progressPollTickInFlight = true;
    try {
      const nativePositionMs = await this.safeReadCurrentTimeMs(
        this.activeAssetId
      );
      this.applyNativePosition(nativePositionMs);

      if (this.durationMs <= 0) {
        const nextDurationMs = await this.safeReadDurationMs(
          this.activeAssetId
        );
        if (nextDurationMs > 0) {
          this.durationMs = nextDurationMs;
          this.emit({
            type: 'ready',
            trackId: this.activeTrack.id,
            durationMs: this.durationMs,
          });
        }
      }

      if (this.isBuffering && this.positionMs > 0) {
        this.setBuffering(this.activeTrack.id, false);
      }

      this.emit({
        type: 'playing',
        trackId: this.activeTrack.id,
        positionMs: this.positionMs,
        durationMs: this.durationMs,
      });
    } finally {
      this.progressPollTickInFlight = false;
    }
  }

  private async resolveSeekPositionMs(targetMs: number) {
    if (!this.nativeAudio || !this.activeAssetId) {
      return targetMs;
    }

    if (!this.platformProfile.shouldResolveSeekPositionFromNative) {
      return targetMs;
    }

    let nextMs = await this.safeReadCurrentTimeMs(this.activeAssetId);
    if (this.shouldRetrySeekWithPlayFallback(targetMs, nextMs)) {
      nextMs = await this.seekWithPlayFallback(targetMs);
    }

    if (!Number.isFinite(nextMs) || nextMs < 0) {
      return targetMs;
    }

    if (
      this.shouldUseSeekPlayFallback() &&
      Math.abs(nextMs - targetMs) > 1500
    ) {
      // Если iOS всё ещё отдаёт неверную позицию, фиксируем ожидаемую позицию для UI.
      return targetMs;
    }

    return nextMs;
  }

  private shouldRetrySeekWithPlayFallback(targetMs: number, actualMs: number) {
    if (!this.shouldUseSeekPlayFallback()) return false;
    if (!Number.isFinite(actualMs) || actualMs < 0) return true;
    return Math.abs(actualMs - targetMs) > 1500;
  }

  private shouldUseSeekPlayFallback() {
    return this.platformProfile.shouldUseSeekPlayFallback(
      this.activeAssetIsRemote
    );
  }

  private shouldUsePositionClockFallback() {
    return this.platformProfile.shouldUsePositionClockFallback(
      this.activeTrack
    );
  }

  private shouldUseProgressPollingFallback() {
    return this.platformProfile.useProgressPollingFallback;
  }

  private async seekWithPlayFallback(targetMs: number) {
    if (!this.nativeAudio || !this.activeAssetId) return targetMs;

    const resumeAfterSeek = this.isPlaying;
    await this.nativeAudio.play({
      assetId: this.activeAssetId,
      time: toSeconds(targetMs),
    });

    if (!resumeAfterSeek) {
      await this.nativeAudio.pause({ assetId: this.activeAssetId });
    }

    const resolvedMs = await this.safeReadCurrentTimeMs(this.activeAssetId);
    if (!Number.isFinite(resolvedMs) || resolvedMs < 0) {
      return targetMs;
    }
    return resolvedMs;
  }

  private async resolveDurationFromNative(
    assetId: string,
    trackId: string,
    taskId: number
  ) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (taskId !== this.durationResolveTaskId) return;
      if (!this.activeAssetId || this.activeAssetId !== assetId) return;
      if (!this.activeTrack || this.activeTrack.id !== trackId) return;

      const nativeDurationMs = await this.safeReadDurationMs(assetId);
      if (nativeDurationMs > 0) {
        if (nativeDurationMs !== this.durationMs) {
          this.durationMs = nativeDurationMs;
          this.emit({
            type: 'ready',
            trackId,
            durationMs: this.durationMs,
          });
        }

        if (this.isPlaying) {
          const livePositionMs = await this.safeReadCurrentTimeMs(assetId);
          this.applyNativePosition(livePositionMs);
          this.emit({
            type: 'playing',
            trackId,
            positionMs: this.positionMs,
            durationMs: this.durationMs,
          });
        }
        return;
      }

      await this.delay(200 + attempt * 150);
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
    if (this.durationMs > 0) {
      return Math.min(Math.round(nextMs), this.durationMs);
    }
    return Math.max(0, Math.round(nextMs));
  }

  private applyNativePosition(nativePositionMs: number) {
    const nextMs = Math.max(0, Math.round(nativePositionMs));

    if (this.shouldIgnorePendingSeekNoise(nextMs)) {
      return;
    }

    this.confirmPendingSeekPosition(nextMs);

    if (this.shouldUsePositionClockFallback()) {
      if (nextMs > 0 || this.positionMs <= 0) {
        this.positionMs = nextMs;
        this.startPositionClock(nextMs);
      } else if (this.isPlaying) {
        // Если iOS временно отдаёт "0", продолжаем плавный отсчёт от локальных часов.
        this.positionMs = this.estimateCurrentPositionMs();
      }
      return;
    }

    if (this.shouldIgnoreUnexpectedReset(nextMs)) {
      return;
    }

    this.positionMs = nextMs;
  }

  private shouldIgnoreUnexpectedReset(nextMs: number) {
    if (!this.isPlaying) return false;
    if (nextMs > 120) return false;
    if (this.positionMs < 900) return false;
    if (this.pendingSeekTargetMs !== null) return false;
    if (this.wasRecentSeek()) return false;
    if (this.isExpectedLoopWrap(nextMs)) return false;
    return true;
  }

  private isExpectedLoopWrap(nextMs: number) {
    if (!this.autoReplayEnabled) return false;
    if (this.durationMs <= 0) return false;

    const wrapThresholdMs = Math.min(
      1500,
      Math.max(600, this.durationMs * 0.1)
    );
    return (
      this.positionMs >= this.durationMs - wrapThresholdMs &&
      nextMs <= wrapThresholdMs
    );
  }

  private wasRecentSeek() {
    return Date.now() - this.lastSeekAtMs < 1500;
  }

  private markSeekPending(targetMs: number) {
    this.pendingSeekTargetMs = Math.max(0, Math.floor(targetMs));
    this.pendingSeekExpiresAtMs =
      Date.now() + this.platformProfile.seekSettleWindowMs;
  }

  private clearPendingSeekState() {
    this.pendingSeekTargetMs = null;
    this.pendingSeekExpiresAtMs = 0;
  }

  private confirmPendingSeekPosition(positionMs: number) {
    if (this.pendingSeekTargetMs === null) return;

    const target = this.pendingSeekTargetMs;
    const toleranceMs = Math.max(1200, Math.round(this.rate * 700));
    if (Math.abs(positionMs - target) <= toleranceMs) {
      this.clearPendingSeekState();
      return;
    }

    if (Date.now() > this.pendingSeekExpiresAtMs) {
      this.clearPendingSeekState();
    }
  }

  private shouldIgnorePendingSeekNoise(nextMs: number) {
    const pendingTarget = this.pendingSeekTargetMs;
    if (pendingTarget === null) return false;

    if (Date.now() > this.pendingSeekExpiresAtMs) {
      this.clearPendingSeekState();
      return false;
    }

    const toleranceMs = Math.max(1400, Math.round(this.rate * 900));
    if (Math.abs(nextMs - pendingTarget) <= toleranceMs) {
      return false;
    }

    // Пока seek не подтвердился, отбрасываем регрессивные/старые позиции
    // (часто 0 или значение до seek на Android ExoPlayer bridge).
    return true;
  }

  private async resolveTrackSource(track: AudioServiceTrack) {
    if (!this.shouldUseIosLoopLocalCache(track)) {
      return {
        assetPath: track.url,
        isUrl: true,
        isRemote: this.isHttpUrl(track.url),
      };
    }

    const cachedSource = await this.prepareIosLoopCachedSource(track.url);
    if (cachedSource) {
      return {
        assetPath: cachedSource,
        isUrl: true,
        isRemote: false,
      };
    }

    return {
      assetPath: track.url,
      isUrl: true,
      isRemote: true,
    };
  }

  private shouldUseIosLoopLocalCache(track: AudioServiceTrack) {
    return (
      this.platformProfile.kind === 'ios' &&
      Boolean(track.isLoop) &&
      this.isHttpUrl(track.url) &&
      Capacitor.isPluginAvailable('Filesystem')
    );
  }

  private isHttpUrl(url: string) {
    return /^https?:\/\//i.test(url);
  }

  private async prepareIosLoopCachedSource(url: string) {
    try {
      const filesystemModule = (await import(
        '@capacitor/filesystem'
      )) as FilesystemRuntimeModule;
      const cachePath = this.buildIosLoopCachePath(url);

      const hasCachedFile = await this.hasFilesystemEntry(
        filesystemModule,
        cachePath
      );
      if (!hasCachedFile) {
        await this.downloadAudioToCache(filesystemModule, cachePath, url);
      }

      const { uri } = await filesystemModule.Filesystem.getUri({
        path: cachePath,
        directory: filesystemModule.Directory.Cache,
      });
      return typeof uri === 'string' && uri.length > 0 ? uri : null;
    } catch (error) {
      console.warn(
        '[NativeAudioService] iOS loop cache fallback to remote source:',
        error
      );
      return null;
    }
  }

  private buildIosLoopCachePath(url: string) {
    const extension = this.extractFileExtension(url);
    const hash = this.hashString(url);
    return `native-audio/loop-cache/${hash}.${extension}`;
  }

  private extractFileExtension(url: string) {
    try {
      const parsed = new URL(url);
      const lastSegment = parsed.pathname.split('/').pop() ?? '';
      const extension = lastSegment.split('.').pop()?.toLowerCase() ?? '';
      if (/^[a-z0-9]{2,6}$/.test(extension)) {
        return extension;
      }
    } catch {
      // Если URL не распарсился — используем безопасный дефолт.
    }
    return 'm4a';
  }

  private hashString(input: string) {
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  private async hasFilesystemEntry(
    filesystemModule: FilesystemRuntimeModule,
    path: string
  ) {
    try {
      await filesystemModule.Filesystem.stat({
        path,
        directory: filesystemModule.Directory.Cache,
      });
      return true;
    } catch {
      return false;
    }
  }

  private async downloadAudioToCache(
    filesystemModule: FilesystemRuntimeModule,
    path: string,
    url: string
  ) {
    if (typeof filesystemModule.Filesystem.downloadFile === 'function') {
      await filesystemModule.Filesystem.downloadFile({
        url,
        path,
        directory: filesystemModule.Directory.Cache,
        recursive: true,
      });
      return;
    }

    // Fallback для сред, где downloadFile недоступен.
    const response = await fetch(url, {
      cache: 'force-cache',
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error(
        `Failed to download loop track: ${response.status} ${response.statusText}`
      );
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength <= 0) {
      throw new Error('Loop track download returned empty payload');
    }

    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = '';
    for (let index = 0; index < bytes.length; index += chunkSize) {
      const chunk = bytes.subarray(index, index + chunkSize);
      binary += String.fromCharCode(...chunk);
    }

    await filesystemModule.Filesystem.writeFile({
      path,
      data: btoa(binary),
      directory: filesystemModule.Directory.Cache,
      recursive: true,
    });
  }
}
