import { afterEach, describe, expect, it, vi } from 'vitest';

type PlaybackStatus = 'playing' | 'paused' | 'stopped';
type AudioPlayerCreateParams = {
  audioId: string;
  audioSource?: string;
  [key: string]: unknown;
};
type ReadyCallback = () => void;
type EndCallback = () => void;
type StatusCallback = (result: { status: PlaybackStatus }) => void;
type AudioPlayerMockOptions = {
  deferFirstInitialize?: boolean;
  platform?: 'ios' | 'android';
};

function setWindow() {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: {},
  });
}

function createAudioPlayerMock(options: AudioPlayerMockOptions = {}) {
  const readyCallbacks = new Map<string, ReadyCallback>();
  const endCallbacks = new Map<string, EndCallback>();
  const statusCallbacks = new Map<string, StatusCallback>();
  const pendingInitializeCallbacks = new Map<string, () => void>();
  let initializeCount = 0;

  const audioPlayer = {
    create: vi.fn(async (params: AudioPlayerCreateParams) => {
      void params;
      return { success: true };
    }),
    initialize: vi.fn(async ({ audioId }: { audioId: string }) => {
      initializeCount += 1;
      if (options.deferFirstInitialize && initializeCount === 1) {
        await new Promise<void>((resolve) => {
          pendingInitializeCallbacks.set(audioId, resolve);
        });
      }
      readyCallbacks.get(audioId)?.();
      return { success: true };
    }),
    changeAudioSource: vi.fn(async () => undefined),
    changeMetadata: vi.fn(async () => undefined),
    updateMetadata: vi.fn(async () => undefined),
    getDuration: vi.fn(async ({ audioId }: { audioId: string }) => ({
      duration: audioId.includes('midnight') ? -1 : 454,
    })),
    getCurrentTime: vi.fn(async () => ({ currentTime: 0 })),
    play: vi.fn(async () => undefined),
    pause: vi.fn(async () => undefined),
    seek: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    scheduleStop: vi.fn(async () => undefined),
    clearScheduledStop: vi.fn(async () => undefined),
    setVolume: vi.fn(async () => undefined),
    setRate: vi.fn(async () => undefined),
    isPlaying: vi.fn(async () => ({ isPlaying: false })),
    destroy: vi.fn(async () => undefined),
    onAppGainsFocus: vi.fn(async () => ({ callbackId: 'app-gains-focus' })),
    onAppLosesFocus: vi.fn(async () => ({ callbackId: 'app-loses-focus' })),
    onAudioReady: vi.fn(
      async ({ audioId }: { audioId: string }, callback: ReadyCallback) => {
        readyCallbacks.set(audioId, callback);
        return { callbackId: `ready-${audioId}` };
      }
    ),
    onAudioEnd: vi.fn(
      async ({ audioId }: { audioId: string }, callback: EndCallback) => {
        endCallbacks.set(audioId, callback);
        return { callbackId: `end-${audioId}` };
      }
    ),
    onPlaybackStatusChange: vi.fn(
      async ({ audioId }: { audioId: string }, callback: StatusCallback) => {
        statusCallbacks.set(audioId, callback);
        return { callbackId: `status-${audioId}` };
      }
    ),
    onMetadataUpdate: vi.fn(async () => ({ callbackId: 'metadata' })),
    emitEnd(audioId: string) {
      endCallbacks.get(audioId)?.();
    },
    emitStatus(audioId: string, status: PlaybackStatus) {
      statusCallbacks.get(audioId)?.({ status });
    },
    resolveInitialize(audioId: string) {
      pendingInitializeCallbacks.get(audioId)?.();
      pendingInitializeCallbacks.delete(audioId);
    },
  };

  return audioPlayer;
}

function getCreatedAudioId(
  audioPlayer: ReturnType<typeof createAudioPlayerMock>,
  index = 0
) {
  const params = audioPlayer.create.mock.calls[index]?.[0];
  if (!params) {
    throw new Error(`Expected AudioPlayer.create call at index ${index}`);
  }
  return params.audioId;
}

async function setupService(options: AudioPlayerMockOptions = {}) {
  const audioPlayer = createAudioPlayerMock(options);
  const platform = options.platform ?? 'ios';

  vi.doMock('@capacitor/core', () => ({
    Capacitor: {
      isNativePlatform: () => true,
      getPlatform: () => platform,
      isPluginAvailable: (name: string) => name === 'AudioPlayer',
    },
  }));

  vi.doMock('@mediagrid/capacitor-native-audio', () => ({
    AudioPlayer: audioPlayer,
  }));

  const { NativeAudioService } = await import(
    '../app/services/audio/nativeAudio.service'
  );

  return {
    NativeAudioService,
    audioPlayer,
  };
}

async function flushAsyncAudioCallback() {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

const loopTrack = {
  id: 'midnight-calm',
  url: 'https://media.mentala.app/meditations/audio/nature/midnight-calm.2240f8b8.m4a',
  title: 'Ночная тишина',
  category: 'meditation' as const,
  isLoop: true,
  durationMs: 180_000,
};

const nonLoopTrack = {
  id: 'ocean-slow',
  url: 'https://media.mentala.app/meditations/audio/nature/ocean-slow.f308203e.m4a',
  title: 'Дыхание океана',
  category: 'meditation' as const,
  isLoop: false,
  durationMs: 454_000,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  delete (globalThis as Record<string, unknown>).window;
});

describe('NativeAudioService MediaGrid AudioPlayer', () => {
  it('создаёт loop-трек как native loop source с background notification', async () => {
    setWindow();
    const { NativeAudioService, audioPlayer } = await setupService();
    const service = new NativeAudioService();

    try {
      await service.play(loopTrack, { loop: true, volume: 1 });
    } finally {
      await service.destroy();
    }

    expect(audioPlayer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        audioId: expect.stringMatching(/^meditation_midnight-calm_\d+$/),
        audioSource: loopTrack.url,
        friendlyTitle: 'Ночная тишина',
        useForNotification: true,
        loop: true,
        showSeekBackward: false,
        showSeekForward: false,
      })
    );
    const audioId = getCreatedAudioId(audioPlayer);
    expect(audioPlayer.initialize).toHaveBeenCalledWith({
      audioId,
    });
    expect(audioPlayer.play).toHaveBeenCalledWith({
      audioId,
    });
    expect(audioPlayer.getDuration).not.toHaveBeenCalled();
    expect(audioPlayer.getCurrentTime).not.toHaveBeenCalled();
  });

  it('разводит audioId для сцены и медитации разными namespace', async () => {
    setWindow();
    const { NativeAudioService, audioPlayer } = await setupService();
    const service = new NativeAudioService({ audioIdNamespace: 'scene' });

    try {
      await service.play(loopTrack, { loop: true, volume: 1 });
    } finally {
      await service.destroy();
    }

    expect(audioPlayer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        audioId: expect.stringMatching(/^scene_midnight-calm_\d+$/),
        audioSource: loopTrack.url,
      })
    );
  });

  it('для обычного трека не включает native loop и повторяет через onAudioEnd', async () => {
    setWindow();
    const { NativeAudioService, audioPlayer } = await setupService();
    const service = new NativeAudioService();

    try {
      await service.play(nonLoopTrack, { loop: true, volume: 1 });
      const audioId = getCreatedAudioId(audioPlayer);
      audioPlayer.emitEnd(audioId);
      await flushAsyncAudioCallback();
    } finally {
      await service.destroy();
    }

    expect(audioPlayer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        audioId: expect.stringMatching(/^meditation_ocean-slow_\d+$/),
        audioSource: nonLoopTrack.url,
        useForNotification: true,
        loop: false,
        showSeekBackward: false,
        showSeekForward: false,
      })
    );
    const audioId = getCreatedAudioId(audioPlayer);
    expect(audioPlayer.seek).toHaveBeenCalledWith({
      audioId,
      timeInSeconds: 0,
    });
    expect(audioPlayer.play).toHaveBeenCalledTimes(2);
  });

  it('при переключении трека уничтожает предыдущий source перед созданием нового', async () => {
    setWindow();
    const { NativeAudioService, audioPlayer } = await setupService();
    const service = new NativeAudioService();

    try {
      await service.play(loopTrack, { loop: true, volume: 1 });
      await service.play(nonLoopTrack, { loop: true, volume: 1 });
    } finally {
      await service.destroy();
    }

    const firstAudioId = getCreatedAudioId(audioPlayer);
    expect(audioPlayer.destroy).toHaveBeenCalledWith({
      audioId: firstAudioId,
    });
    expect(audioPlayer.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        audioId: expect.stringMatching(/^meditation_ocean-slow_\d+$/),
        audioSource: nonLoopTrack.url,
        loop: false,
      })
    );
  });

  it('умеет стартовать пересозданный обычный source с сохранённой позиции', async () => {
    setWindow();
    const { NativeAudioService, audioPlayer } = await setupService();
    const service = new NativeAudioService();

    try {
      await service.play(nonLoopTrack, {
        loop: false,
        volume: 1,
        startPositionMs: 62_000,
      });
    } finally {
      await service.destroy();
    }

    const audioId = getCreatedAudioId(audioPlayer);
    expect(audioPlayer.seek).toHaveBeenCalledWith({
      audioId,
      timeInSeconds: 62,
    });
    expect(audioPlayer.seek.mock.invocationCallOrder[0]).toBeLessThan(
      audioPlayer.play.mock.invocationCallOrder[0]
    );
  });

  it('ставит и очищает native scheduled stop для Android sleep timer', async () => {
    setWindow();
    const { NativeAudioService, audioPlayer } = await setupService({
      platform: 'android',
    });
    const service = new NativeAudioService();

    try {
      await service.play(nonLoopTrack, { loop: true, volume: 1 });
      const audioId = getCreatedAudioId(audioPlayer);

      await service.scheduleStop(10_000);
      await service.clearScheduledStop();

      expect(audioPlayer.scheduleStop).toHaveBeenCalledWith({
        audioId,
        delayMs: 10_000,
      });
      expect(audioPlayer.clearScheduledStop).toHaveBeenCalledWith({
        audioId,
      });
    } finally {
      await service.destroy();
    }
  });

  it('не вызывает Android-only scheduled stop на iOS', async () => {
    setWindow();
    const { NativeAudioService, audioPlayer } = await setupService({
      platform: 'ios',
    });
    const service = new NativeAudioService();

    try {
      await service.play(nonLoopTrack, { loop: true, volume: 1 });

      await service.scheduleStop(10_000);
      await service.clearScheduledStop();

      expect(audioPlayer.scheduleStop).not.toHaveBeenCalled();
      expect(audioPlayer.clearScheduledStop).not.toHaveBeenCalled();
    } finally {
      await service.destroy();
    }
  });

  it('не запускает stale source, если пользователь переключил трек во время initialize', async () => {
    setWindow();
    const { NativeAudioService, audioPlayer } = await setupService({
      deferFirstInitialize: true,
    });
    const service = new NativeAudioService();

    try {
      const stalePlayPromise = service.play(loopTrack, {
        loop: true,
        volume: 1,
      });
      await flushAsyncAudioCallback();
      const staleAudioId = getCreatedAudioId(audioPlayer);

      const activePlayPromise = service.play(nonLoopTrack, {
        loop: true,
        volume: 1,
      });
      await flushAsyncAudioCallback();
      const activeAudioId = getCreatedAudioId(audioPlayer, 1);

      audioPlayer.resolveInitialize(staleAudioId);
      await Promise.all([stalePlayPromise, activePlayPromise]);

      expect(audioPlayer.destroy).toHaveBeenCalledWith({
        audioId: staleAudioId,
      });
      expect(audioPlayer.play).not.toHaveBeenCalledWith({
        audioId: staleAudioId,
      });
      expect(audioPlayer.play).toHaveBeenCalledWith({
        audioId: activeAudioId,
      });
    } finally {
      await service.destroy();
    }
  });

  it('не применяет устаревший pause после быстрого resume', async () => {
    vi.useFakeTimers();
    setWindow();
    const { NativeAudioService, audioPlayer } = await setupService();
    const service = new NativeAudioService();

    try {
      await service.play(nonLoopTrack, { loop: true, volume: 1 });
      const audioId = getCreatedAudioId(audioPlayer);
      audioPlayer.play.mockClear();
      audioPlayer.pause.mockClear();

      const pausePromise = service.pause({ fadeOutMs: 120 });
      await Promise.resolve();
      const resumePromise = service.resume({ fadeInMs: 0 });

      await vi.advanceTimersByTimeAsync(200);
      await Promise.all([pausePromise, resumePromise]);

      expect(audioPlayer.pause).not.toHaveBeenCalled();
      expect(audioPlayer.play).toHaveBeenCalledWith({ audioId });
      expect(service.getSnapshot().isPlaying).toBe(true);
    } finally {
      await service.destroy();
      vi.useRealTimers();
    }
  });

  it('не читает duration у нового source из stale progress tick после переключения', async () => {
    setWindow();
    const { NativeAudioService, audioPlayer } = await setupService();
    const service = new NativeAudioService();
    const pollProgressTick = (
      service as unknown as { pollProgressTick: () => Promise<void> }
    ).pollProgressTick.bind(service);
    let releaseCurrentTime: (() => void) | null = null;

    try {
      await service.play(nonLoopTrack, { loop: true, volume: 1 });
      const staleAudioId = getCreatedAudioId(audioPlayer);
      audioPlayer.getDuration.mockClear();
      audioPlayer.getCurrentTime.mockImplementationOnce(
        async ({ audioId }: { audioId: string }) => {
          expect(audioId).toBe(staleAudioId);
          await new Promise<void>((resolve) => {
            releaseCurrentTime = resolve;
          });
          return { currentTime: 5 };
        }
      );

      const stalePollPromise = pollProgressTick();
      await flushAsyncAudioCallback();
      const activePlayPromise = service.play(loopTrack, {
        loop: true,
        volume: 1,
      });
      await flushAsyncAudioCallback();
      const activeAudioId = getCreatedAudioId(audioPlayer, 1);

      expect(releaseCurrentTime).toBeTypeOf('function');
      releaseCurrentTime?.();
      await Promise.all([stalePollPromise, activePlayPromise]);

      expect(audioPlayer.getDuration).not.toHaveBeenCalledWith({
        audioId: activeAudioId,
      });
      expect(audioPlayer.getCurrentTime).not.toHaveBeenCalledWith({
        audioId: activeAudioId,
      });
    } finally {
      await service.destroy();
    }
  });
});
