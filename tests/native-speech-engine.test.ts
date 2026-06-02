import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ListenerMap = Record<string, ((payload?: any) => void) | undefined>;

const listeners: ListenerMap = {};

const speechRecognitionMock = {
  checkPermissions: vi.fn(async () => ({ speechRecognition: 'granted' })),
  requestPermissions: vi.fn(),
  removeAllListeners: vi.fn(async () => {
    for (const key of Object.keys(listeners)) {
      delete listeners[key];
    }
  }),
  addListener: vi.fn((eventName: string, callback: (payload?: any) => void) => {
    listeners[eventName] = callback;
  }),
  start: vi.fn(async () => undefined),
  stop: vi.fn(async () => undefined),
};

describe('createNativeEngine', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    for (const key of Object.keys(listeners)) {
      delete listeners[key];
    }
    speechRecognitionMock.checkPermissions.mockClear();
    speechRecognitionMock.requestPermissions.mockClear();
    speechRecognitionMock.removeAllListeners.mockClear();
    speechRecognitionMock.addListener.mockClear();
    speechRecognitionMock.start.mockClear();
    speechRecognitionMock.stop.mockClear();
    setActivePinia(createPinia());
    vi.stubGlobal('useRuntimeConfig', () => ({
      public: {
        speechDefaultEngine: 'native',
      },
    }));
    vi.doMock('@capacitor/core', () => ({
      Capacitor: {
        getPlatform: () => 'android',
      },
    }));
    vi.doMock('@capacitor-community/speech-recognition', () => ({
      SpeechRecognition: speechRecognitionMock,
    }));
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('не продлевает silence timeout native auto-restart без новой речи', async () => {
    const { createNativeEngine } = await import(
      '../app/composables/speech/engine.native'
    );
    const { useSpeechStore } = await import('../app/stores/speech');

    const engine = createNativeEngine();
    await engine.start({ silenceMs: 500 });

    expect(speechRecognitionMock.start).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    listeners.end?.();
    vi.advanceTimersByTime(300);
    await Promise.resolve();

    expect(speechRecognitionMock.start).toHaveBeenCalledTimes(2);
    expect(useSpeechStore().isListening).toBe(true);

    vi.advanceTimersByTime(100);
    await Promise.resolve();

    expect(useSpeechStore().isListening).toBe(false);
    expect(speechRecognitionMock.stop).toHaveBeenCalledTimes(1);
  });

  it('не дублирует final после паузы и auto-restart', async () => {
    const { createNativeEngine } = await import(
      '../app/composables/speech/engine.native'
    );

    const engine = createNativeEngine();
    const onFinal = vi.fn();
    engine.onFinal(onFinal);

    await engine.start({ silenceMs: 1_000 });

    listeners.partialResults?.({ matches: ['привет'] });
    listeners.result?.({ matches: ['привет'] });
    listeners.end?.();
    vi.advanceTimersByTime(300);
    await Promise.resolve();

    expect(onFinal).toHaveBeenCalledTimes(1);
    expect(onFinal).toHaveBeenCalledWith('привет');
    expect(speechRecognitionMock.start).toHaveBeenCalledTimes(2);
  });
});
