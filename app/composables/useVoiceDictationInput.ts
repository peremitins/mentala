import { computed, nextTick, onScopeDispose, ref, watch, type Ref } from 'vue';
import { useSpeechEngine } from '@/app/composables/useSpeechEngine';
import { useSpeechStore } from '@/app/stores/speech';

interface VoiceDictationFinalPayload {
  finalText: string;
  mergedText: string;
}

interface UseVoiceDictationInputOptions {
  getValue: () => string | null | undefined;
  setValue: (value: string) => void;
  isBlocked?: Ref<boolean>;
  separator?: string;
  onStartError?: (error: unknown) => void;
  onFinalTranscription?: (
    payload: VoiceDictationFinalPayload
  ) => void | Promise<void>;
}

function normalizeText(value: string | null | undefined): string {
  return (value || '').trim();
}

function mergeWithBase(base: string, chunk: string, separator: string): string {
  const normalizedBase = normalizeText(base);
  const normalizedChunk = normalizeText(chunk);

  if (!normalizedBase) return normalizedChunk;
  if (!normalizedChunk) return normalizedBase;

  return `${normalizedBase}${separator}${normalizedChunk}`;
}

export function useVoiceDictationInput(options: UseVoiceDictationInputOptions) {
  const speechStore = useSpeechStore();
  const { settings, start, stop, onPartial, onFinal } = useSpeechEngine();
  const isApplyingVoiceInput = ref(false);
  const baseText = ref('');
  const isDisposed = ref(false);
  const separator = options.separator ?? ' ';

  function isBlocked(): boolean {
    return options.isBlocked?.value === true;
  }

  onPartial((partial) => {
    if (isDisposed.value || !speechStore.isListening || isBlocked()) return;

    isApplyingVoiceInput.value = true;
    options.setValue(mergeWithBase(baseText.value, partial, separator));

    void nextTick(() => {
      isApplyingVoiceInput.value = false;
    });
  });

  onFinal((finalText) => {
    if (isDisposed.value || isBlocked()) return;

    const normalizedFinal = normalizeText(finalText);
    if (!normalizedFinal) return;

    isApplyingVoiceInput.value = true;
    const merged = mergeWithBase(baseText.value, normalizedFinal, separator);
    baseText.value = merged;
    options.setValue(merged);

    if (options.onFinalTranscription) {
      void Promise.resolve(
        options.onFinalTranscription({
          finalText: normalizedFinal,
          mergedText: merged,
        })
      ).catch((error) => {
        console.error(
          '[VoiceDictationInput] Failed to handle final transcription:',
          error
        );
      });
    }

    void nextTick(() => {
      isApplyingVoiceInput.value = false;
    });
  });

  watch(
    () => normalizeText(options.getValue()),
    (nextValue) => {
      // Сбрасываем базу, когда пользователь вручную очистил поле.
      if (isApplyingVoiceInput.value) return;
      if (nextValue.length === 0) {
        baseText.value = '';
      }
    }
  );

  async function toggleListening(): Promise<void> {
    if (speechStore.isListening) {
      await stopListening();
      return;
    }

    baseText.value = normalizeText(options.getValue());

    try {
      await start();
    } catch (error) {
      console.error('[VoiceDictationInput] Failed to start dictation:', error);
      speechStore.isListening = false;
      baseText.value = '';
      options.onStartError?.(error);
    }
  }

  async function stopListening(): Promise<void> {
    await stop();
    if (!normalizeText(options.getValue())) {
      baseText.value = '';
    }
  }

  function clearBaseText(): void {
    baseText.value = '';
  }

  onScopeDispose(() => {
    isDisposed.value = true;
  });

  return {
    settings,
    isListening: computed(() => speechStore.isListening),
    isApplyingVoiceInput,
    toggleListening,
    stopListening,
    clearBaseText,
  };
}
