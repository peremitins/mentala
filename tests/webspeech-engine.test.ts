import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ResultHandler = (event: {
  resultIndex: number;
  results: FakeSpeechRecognitionResult[];
}) => void;

type FakeSpeechRecognitionResult = {
  0: { transcript: string };
  isFinal: boolean;
};

const recognitionInstances: FakeSpeechRecognition[] = [];

class FakeSpeechRecognition {
  lang = '';
  interimResults = false;
  continuous = false;
  onresult: ResultHandler | null = null;
  onerror: ((event: { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();

  constructor() {
    recognitionInstances.push(this);
  }

  emitResult(transcript: string, isFinal: boolean) {
    this.onresult?.({
      resultIndex: 0,
      results: [
        {
          0: { transcript },
          isFinal,
        },
      ],
    });
  }

  emitEnd() {
    this.onend?.();
  }
}

describe('createWebSpeechEngine', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    recognitionInstances.length = 0;
    setActivePinia(createPinia());
    vi.stubGlobal('useRuntimeConfig', () => ({
      public: {
        speechDefaultEngine: 'webspeech',
      },
    }));
    vi.stubGlobal('window', {
      SpeechRecognition: FakeSpeechRecognition,
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('не перезапускает recognition сразу после final в continuous-режиме', async () => {
    const { createWebSpeechEngine } = await import(
      '../app/composables/speech/engine.webspeech'
    );
    const { useSpeechStore } = await import('../app/stores/speech');

    const engine = createWebSpeechEngine();
    const onFinal = vi.fn();
    engine.onFinal(onFinal);

    await engine.start({ continuousMode: true, silenceMs: 60_000 });
    recognitionInstances[0].emitResult('один', true);
    vi.advanceTimersByTime(120);

    expect(onFinal).toHaveBeenCalledWith('один');
    expect(recognitionInstances).toHaveLength(1);
    expect(recognitionInstances[0].abort).not.toHaveBeenCalled();
    expect(useSpeechStore().isListening).toBe(true);
  });

  it('перезапускает recognition после onend, если речь была недавно', async () => {
    const { createWebSpeechEngine } = await import(
      '../app/composables/speech/engine.webspeech'
    );

    const engine = createWebSpeechEngine();
    await engine.start({ continuousMode: true, silenceMs: 60_000 });

    recognitionInstances[0].emitResult('один', false);
    recognitionInstances[0].emitEnd();
    vi.advanceTimersByTime(120);

    expect(recognitionInstances).toHaveLength(2);
    expect(recognitionInstances[1].start).toHaveBeenCalledTimes(1);
  });

  it('не перезапускает recognition без речи', async () => {
    const { createWebSpeechEngine } = await import(
      '../app/composables/speech/engine.webspeech'
    );
    const { useSpeechStore } = await import('../app/stores/speech');

    const engine = createWebSpeechEngine();
    await engine.start({ continuousMode: true, silenceMs: 500 });

    vi.advanceTimersByTime(100);
    recognitionInstances[0].emitEnd();
    vi.advanceTimersByTime(120);

    expect(recognitionInstances).toHaveLength(1);
    expect(useSpeechStore().isListening).toBe(false);
    expect(recognitionInstances[0].stop).toHaveBeenCalledTimes(1);
  });
});
