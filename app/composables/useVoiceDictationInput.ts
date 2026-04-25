import { computed, nextTick, onScopeDispose, ref, watch } from 'vue';
import { useSpeechEngine } from '@/app/composables/useSpeechEngine';
import {
  useMicPermissionGate,
  type MicPermissionState,
} from '@/app/composables/useMicPermissionGate';
import {
  useSceneAudioFocus,
  type SceneAudioFocusLock,
} from '@/app/composables/useSceneAudioFocus';
import { useSpeechStore } from '@/app/stores/speech';

interface VoiceDictationFinalPayload {
  finalText: string;
  mergedText: string;
}

interface UseVoiceDictationInputOptions {
  getValue: () => string | null | undefined;
  setValue: (value: string) => void;
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
  const { settings, start, stop, onPartial, onFinal, onError } =
    useSpeechEngine();
  const micPermissionGate = useMicPermissionGate();
  const sceneAudioFocus = useSceneAudioFocus();
  const isApplyingVoiceInput = ref(false);
  const baseText = ref('');
  const isDisposed = ref(false);
  const separator = options.separator ?? ' ';
  const lastStartPermissionState = ref<MicPermissionState>(null);
  const sessionId = ref(0);
  const activeSessionId = ref<number | null>(null);
  const dictationAudioLock = ref<SceneAudioFocusLock | null>(null);

  function hasActiveSession(): boolean {
    return activeSessionId.value !== null;
  }

  function isCurrentSessionActive(): boolean {
    return hasActiveSession() && activeSessionId.value === sessionId.value;
  }

  async function acquireDictationAudioFocus(): Promise<void> {
    if (dictationAudioLock.value) {
      return;
    }

    dictationAudioLock.value = await sceneAudioFocus.acquire(
      'speech-dictation',
      {
        // Микрофон должен получать фокус сразу. Fade сцены создаёт гонки:
        // пользователь уже начал запись, а фон ещё доигрывает или возвращается.
        withFade: false,
      }
    );
  }

  async function releaseDictationAudioFocus(): Promise<void> {
    const lock = dictationAudioLock.value;
    if (!lock) {
      return;
    }

    dictationAudioLock.value = null;
    await lock.release();
  }

  onPartial((partial) => {
    if (
      isDisposed.value ||
      !speechStore.isListening ||
      !isCurrentSessionActive()
    ) {
      return;
    }

    isApplyingVoiceInput.value = true;
    options.setValue(mergeWithBase(baseText.value, partial, separator));

    void nextTick(() => {
      isApplyingVoiceInput.value = false;
    });
  });

  onFinal((finalText) => {
    if (isDisposed.value || !isCurrentSessionActive()) return;

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

  onError((error) => {
    if (isDisposed.value) return;

    activeSessionId.value = null;
    speechStore.isListening = false;
    void releaseDictationAudioFocus();
    void micPermissionGate.handleStartFailure(error, {
      priorPermissionState: lastStartPermissionState.value,
    });
    options.onStartError?.(error);
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

  watch(
    () => speechStore.isListening,
    (isListening) => {
      if (isListening) {
        return;
      }

      activeSessionId.value = null;
      void releaseDictationAudioFocus();
    }
  );

  async function toggleListening(): Promise<void> {
    if (speechStore.isListening) {
      await stopListening();
      return;
    }

    baseText.value = normalizeText(options.getValue());
    lastStartPermissionState.value =
      await micPermissionGate.getPermissionState();

    const canStartCapture = await micPermissionGate.ensureCanStartCapture();
    if (!canStartCapture) {
      return;
    }

    try {
      await acquireDictationAudioFocus();
      // Помечаем новую сессию до native/browser start, чтобы не потерять
      // самые ранние partial callbacks после системного prompt.
      sessionId.value += 1;
      activeSessionId.value = sessionId.value;
      await start();
    } catch (error) {
      console.error('[VoiceDictationInput] Failed to start dictation:', error);
      activeSessionId.value = null;
      speechStore.isListening = false;
      baseText.value = '';
      await releaseDictationAudioFocus();
      const permissionHandled = await micPermissionGate.handleStartFailure(
        error,
        {
          priorPermissionState: lastStartPermissionState.value,
        }
      );
      if (
        permissionHandled ||
        (error as any)?.code === 'PERMISSION_DENIED_FIRST'
      ) {
        return;
      }
      options.onStartError?.(error);
    }
  }

  async function stopListening(): Promise<void> {
    activeSessionId.value = null;
    try {
      await stop();
    } finally {
      await releaseDictationAudioFocus();
      if (!normalizeText(options.getValue())) {
        baseText.value = '';
      }
    }
  }

  function clearBaseText(): void {
    baseText.value = '';
  }

  onScopeDispose(() => {
    isDisposed.value = true;
    activeSessionId.value = null;
    void releaseDictationAudioFocus();
  });

  return {
    settings,
    isListening: computed(() => speechStore.isListening),
    isApplyingVoiceInput,
    showMicDeniedModal: micPermissionGate.showMicDeniedModal,
    micDeniedDialogMode: micPermissionGate.dialogMode,
    micDeniedIsStandalonePwa: micPermissionGate.isStandalonePwa,
    toggleListening,
    stopListening,
    clearBaseText,
    openMicSettings: micPermissionGate.openMicSettings,
  };
}
