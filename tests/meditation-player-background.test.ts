import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type AppStateChangeListener = (state: {
  isActive: boolean;
}) => void | Promise<void>;

class NativeAudioServiceMock {
  static instances: NativeAudioServiceMock[] = [];

  stopCalls = 0;
  scheduleStopCalls: number[] = [];
  clearScheduledStopCalls = 0;
  private snapshot = {
    trackId: null as string | null,
    positionMs: 0,
    durationMs: 0,
    isPlaying: false,
    isBuffering: false,
  };

  constructor() {
    NativeAudioServiceMock.instances.push(this);
  }

  async init() {
    return undefined;
  }

  subscribe() {
    return () => undefined;
  }

  getSnapshot() {
    return { ...this.snapshot };
  }

  async play(track: { id: string; durationMs?: number | null }) {
    this.snapshot = {
      trackId: track.id,
      positionMs: 0,
      durationMs: track.durationMs ?? 0,
      isPlaying: true,
      isBuffering: false,
    };
  }

  async pause() {
    this.snapshot = {
      ...this.snapshot,
      isPlaying: false,
    };
  }

  async resume() {
    this.snapshot = {
      ...this.snapshot,
      isPlaying: true,
    };
  }

  async stop() {
    this.stopCalls += 1;
    this.snapshot = {
      trackId: null,
      positionMs: 0,
      durationMs: 0,
      isPlaying: false,
      isBuffering: false,
    };
  }

  async destroy() {
    return undefined;
  }

  async seek() {
    return undefined;
  }

  async setLoop() {
    return undefined;
  }

  async setVolume() {
    return undefined;
  }

  async setRate() {
    return undefined;
  }

  async scheduleStop(delayMs: number) {
    this.scheduleStopCalls.push(delayMs);
  }

  async clearScheduledStop() {
    this.clearScheduledStopCalls += 1;
  }
}

const track = {
  id: 'ocean-slow',
  title: 'Дыхание океана',
  audioPath: '/meditations/audio/nature/ocean-slow.f308203e.m4a',
  coverPath: '/meditations/covers/ocean-slow.fd27232b.webp',
  durationSeconds: 600,
  isLoop: false,
};

function setDomEnvironment() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://app.mentala.test',
  });

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: dom.window,
  });

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: dom.window.document,
  });

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    value: dom.window.navigator,
  });

  Object.defineProperty(globalThis, 'HTMLElement', {
    configurable: true,
    writable: true,
    value: dom.window.HTMLElement,
  });

  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });

  Object.defineProperty(window, 'Capacitor', {
    configurable: true,
    value: {
      isNativePlatform: () => true,
    },
  });
}

async function flushAsyncWork() {
  await Promise.resolve();
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

async function setup() {
  NativeAudioServiceMock.instances = [];
  setDomEnvironment();

  let appStateChangeListener: AppStateChangeListener | null = null;

  vi.doMock('@capacitor/core', () => ({
    Capacitor: {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
      isPluginAvailable: (name: string) => name === 'AudioPlayer',
    },
  }));

  vi.doMock('@capacitor/app', () => ({
    App: {
      addListener: vi.fn(
        async (eventName: string, listener: AppStateChangeListener) => {
          if (eventName === 'appStateChange') {
            appStateChangeListener = listener;
          }
          return {
            remove: vi.fn(async () => undefined),
          };
        }
      ),
    },
  }));

  vi.doMock('@/app/services/audio/nativeAudio.service', () => ({
    NativeAudioService: NativeAudioServiceMock,
  }));

  vi.doMock('@/app/composables/useSceneAudio', () => ({
    useSceneAudio: () => ({
      suspend: vi.fn(async () => undefined),
    }),
  }));

  vi.doMock('@/app/utils/document', () => ({
    isDocumentAvailable: () => true,
  }));

  vi.doMock('@/app/utils/media', () => ({
    resolveMediaUrl: (path?: string | null) =>
      path ? `https://media.mentala.test${path}` : '',
  }));

  vi.stubGlobal('useRuntimeConfig', () => ({
    public: {
      featureNativeMeditationAudioEnabled: true,
    },
  }));

  const { useMeditationPlayer } = await import(
    '../app/composables/useMeditationPlayer'
  );

  return {
    player: useMeditationPlayer(),
    getNativeService: () => {
      const service = NativeAudioServiceMock.instances.at(-1);
      if (!service) {
        throw new Error('NativeAudioServiceMock was not created');
      }
      return service;
    },
    getAppStateChangeListener: () => {
      if (!appStateChangeListener) {
        throw new Error('appStateChange listener was not registered');
      }
      return appStateChangeListener;
    },
  };
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).document;
  delete (globalThis as Record<string, unknown>).navigator;
  delete (globalThis as Record<string, unknown>).HTMLElement;
});

describe('useMeditationPlayer background behavior', () => {
  it('останавливает native playback сразу при background без таймера', async () => {
    const { player, getNativeService, getAppStateChangeListener } =
      await setup();

    await player.play(track, null);
    await flushAsyncWork();

    const service = getNativeService();
    expect(player.currentTrack.value?.id).toBe(track.id);

    await getAppStateChangeListener()({ isActive: false });
    await flushAsyncWork();

    expect(service.stopCalls).toBe(1);
    expect(player.currentTrack.value).toBeNull();
    expect(player.isPlaying.value).toBe(false);
  });

  it('не останавливает playback при background, если sleep timer включён', async () => {
    const { player, getNativeService, getAppStateChangeListener } =
      await setup();

    await player.play(track, 5);
    await flushAsyncWork();

    const service = getNativeService();
    expect(service.scheduleStopCalls[0]).toBeGreaterThan(299_000);

    await getAppStateChangeListener()({ isActive: false });
    await flushAsyncWork();

    expect(service.stopCalls).toBe(0);
    expect(player.currentTrack.value?.id).toBe(track.id);
    expect(player.timerMinutes.value).toBe(5);
  });

  it('ставит roadmap sleep timer на 60 минут без изменения preferred timer', async () => {
    const { player, getNativeService, getAppStateChangeListener } =
      await setup();

    player.setPreferredTimer(5);
    await player.play(track, {
      timerMinutes: 60,
      persistPreferredTimer: false,
    });
    await flushAsyncWork();

    const service = getNativeService();
    expect(service.scheduleStopCalls[0]).toBeGreaterThan(3_599_000);
    expect(player.timerMinutes.value).toBe(60);
    expect(player.preferredTimerMinutes.value).toBe(5);
    expect(player.currentTrack.value?.id).toBe(track.id);

    await getAppStateChangeListener()({ isActive: false });
    await flushAsyncWork();

    expect(service.stopCalls).toBe(0);
    expect(player.currentTrack.value?.id).toBe(track.id);
    expect(player.isPlaying.value).toBe(true);
  });
});
