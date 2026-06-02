import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';

type SpeechCallback = (text: string) => void;

type FakeSpeechEngine = {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onPartial: ReturnType<typeof vi.fn>;
  onFinal: ReturnType<typeof vi.fn>;
  onError: ReturnType<typeof vi.fn>;
  emitPartial: (text: string) => void;
  emitFinal: (text: string) => void;
};

const fakeEngines: FakeSpeechEngine[] = [];

function createFakeSpeechEngine(): FakeSpeechEngine {
  let partialCb: SpeechCallback | null = null;
  let finalCb: SpeechCallback | null = null;

  const engine: FakeSpeechEngine = {
    start: vi.fn(async () => {
      const { useSpeechStore } = await import('../app/stores/speech');
      useSpeechStore().isListening = true;
    }),
    stop: vi.fn(async () => {
      const { useSpeechStore } = await import('../app/stores/speech');
      useSpeechStore().isListening = false;
    }),
    onPartial: vi.fn((cb: SpeechCallback) => {
      partialCb = cb;
    }),
    onFinal: vi.fn((cb: SpeechCallback) => {
      finalCb = cb;
    }),
    onError: vi.fn(() => {}),
    emitPartial: (text: string) => {
      partialCb?.(text);
    },
    emitFinal: (text: string) => {
      finalCb?.(text);
    },
  };

  fakeEngines.push(engine);
  return engine;
}

describe('useVoiceDictationInput', () => {
  beforeEach(() => {
    vi.resetModules();
    fakeEngines.length = 0;
    setActivePinia(createPinia());
    vi.stubGlobal('useRuntimeConfig', () => ({
      public: {
        speechDefaultEngine: 'webspeech',
      },
    }));
    vi.doMock('@capacitor/core', () => ({
      Capacitor: {
        getPlatform: () => 'web',
      },
    }));
    vi.doMock('@/app/composables/speech/engine.webspeech', () => ({
      createWebSpeechEngine: vi.fn(() => createFakeSpeechEngine()),
    }));
    vi.doMock('@/app/composables/useMicPermissionGate', () => ({
      useMicPermissionGate: () => ({
        showMicDeniedModal: ref(false),
        dialogMode: ref('web'),
        isStandalonePwa: ref(false),
        getPermissionState: vi.fn().mockResolvedValue('granted'),
        ensureCanStartCapture: vi.fn().mockResolvedValue(true),
        handleStartFailure: vi.fn().mockResolvedValue(false),
        openMicSettings: vi.fn(),
      }),
    }));
    vi.doMock('@/app/composables/useSceneAudioFocus', () => ({
      useSceneAudioFocus: () => ({
        acquire: vi.fn().mockResolvedValue({
          release: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('вставляет диктовку в textarea, где включили микрофон, а не в последний mounted-инстанс', async () => {
    const { useVoiceDictationInput } = await import(
      '../app/composables/useVoiceDictationInput'
    );

    const scope = effectScope();
    const state = scope.run(() => {
      const firstValue = ref('');
      const secondValue = ref('');

      const first = useVoiceDictationInput({
        getValue: () => firstValue.value,
        setValue: (value) => {
          firstValue.value = value;
        },
      });
      const second = useVoiceDictationInput({
        getValue: () => secondValue.value,
        setValue: (value) => {
          secondValue.value = value;
        },
      });

      return {
        first,
        second,
        firstValue,
        secondValue,
      };
    })!;

    await state.first.toggleListening();
    expect(fakeEngines).toHaveLength(1);

    fakeEngines[0].emitPartial('первый ответ');

    expect(state.firstValue.value).toBe('первый ответ');
    expect(state.secondValue.value).toBe('');
    expect(state.first.isListening.value).toBe(true);
    expect(state.second.isListening.value).toBe(false);

    await state.second.toggleListening();
    fakeEngines[0].emitPartial('второй ответ');

    expect(state.firstValue.value).toBe('первый ответ');
    expect(state.secondValue.value).toBe('второй ответ');
    expect(state.first.isListening.value).toBe(false);
    expect(state.second.isListening.value).toBe(true);

    scope.stop();
  });

  it('не дублирует накопленный mobile transcript внутри одной диктовки', async () => {
    const { useVoiceDictationInput } = await import(
      '../app/composables/useVoiceDictationInput'
    );

    const scope = effectScope();
    const state = scope.run(() => {
      const value = ref('');
      const finalPayloads: Array<{ finalText: string; mergedText: string }> =
        [];

      const input = useVoiceDictationInput({
        getValue: () => value.value,
        setValue: (nextValue) => {
          value.value = nextValue;
        },
        separator: '\n',
        onFinalTranscription: (payload) => {
          finalPayloads.push(payload);
        },
      });

      return {
        input,
        value,
        finalPayloads,
      };
    })!;

    await state.input.toggleListening();

    fakeEngines[0].emitPartial('один');
    expect(state.value.value).toBe('один');

    fakeEngines[0].emitFinal('один');
    fakeEngines[0].emitFinal('один');
    expect(state.value.value).toBe('один');

    fakeEngines[0].emitPartial('один два');
    expect(state.value.value).toBe('один два');

    fakeEngines[0].emitFinal('один два');
    expect(state.value.value).toBe('один два');

    fakeEngines[0].emitFinal('один два три');
    expect(state.value.value).toBe('один два три');
    fakeEngines[0].emitFinal('три');
    fakeEngines[0].emitPartial('три');
    expect(state.value.value).toBe('один два три');
    expect(state.finalPayloads.map((payload) => payload.finalText)).toEqual([
      'один',
      'два',
      'три',
    ]);

    scope.stop();
  });

  it('не дублирует первое слово после partial-preview новой фразы', async () => {
    const { useVoiceDictationInput } = await import(
      '../app/composables/useVoiceDictationInput'
    );

    const scope = effectScope();
    const state = scope.run(() => {
      const value = ref('');
      const finalPayloads: Array<{ finalText: string; mergedText: string }> =
        [];

      const input = useVoiceDictationInput({
        getValue: () => value.value,
        setValue: (nextValue) => {
          value.value = nextValue;
        },
        onFinalTranscription: (payload) => {
          finalPayloads.push(payload);
        },
      });

      return {
        input,
        value,
        finalPayloads,
      };
    })!;

    await state.input.toggleListening();

    fakeEngines[0].emitFinal('раз два');
    expect(state.value.value).toBe('раз два');

    fakeEngines[0].emitPartial('три');
    expect(state.value.value).toBe('раз два три');

    fakeEngines[0].emitFinal('три три четыре');
    expect(state.value.value).toBe('раз два три четыре');

    fakeEngines[0].emitPartial('привет');
    expect(state.value.value).toBe('раз два три четыре привет');

    fakeEngines[0].emitFinal('раз два три четыре привет привет');
    expect(state.value.value).toBe('раз два три четыре привет');
    expect(state.finalPayloads.map((payload) => payload.finalText)).toEqual([
      'раз два',
      'три четыре',
      'привет',
    ]);

    scope.stop();
  });

  it('использует separator только между старым текстом и новой сессией диктовки', async () => {
    const { useVoiceDictationInput } = await import(
      '../app/composables/useVoiceDictationInput'
    );

    const scope = effectScope();
    const state = scope.run(() => {
      const value = ref('готовая строка');

      const input = useVoiceDictationInput({
        getValue: () => value.value,
        setValue: (nextValue) => {
          value.value = nextValue;
        },
        separator: '\n',
      });

      return {
        input,
        value,
      };
    })!;

    await state.input.toggleListening();

    fakeEngines[0].emitFinal('один');
    fakeEngines[0].emitFinal('один два');

    expect(state.value.value).toBe('готовая строка\nодин два');

    scope.stop();
  });
});
