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

const RECENT_DUPLICATE_SPEECH_CHUNK_MS = 3_000;

function normalizeText(value: string | null | undefined): string {
  return (value || '').trim();
}

function normalizeSpeechText(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function mergeWithBase(base: string, chunk: string, separator: string): string {
  const normalizedBase = normalizeText(base);
  const normalizedChunk = normalizeSpeechText(chunk);

  if (!normalizedBase) return normalizedChunk;
  if (!normalizedChunk) return normalizedBase;

  return `${normalizedBase}${separator}${normalizedChunk}`;
}

function appendSpeechChunk(current: string, chunk: string): string {
  const normalizedCurrent = normalizeSpeechText(current);
  const normalizedChunk = normalizeSpeechText(chunk);

  if (!normalizedCurrent) return normalizedChunk;
  if (!normalizedChunk) return normalizedCurrent;

  return `${normalizedCurrent} ${normalizedChunk}`;
}

function hasSpeechBoundary(value: string, index: number): boolean {
  const nextChar = value[index];
  return !nextChar || /[\s,.!?;:]/.test(nextChar);
}

function normalizeSpeechToken(value: string | undefined): string {
  return (value || '').replace(/^[\s,.!?;:]+|[\s,.!?;:]+$/g, '').toLowerCase();
}

function collapsePreviewLeadingDuplicate(
  incoming: string,
  previewDelta: string
): string {
  const normalizedIncoming = normalizeSpeechText(incoming);
  const normalizedPreview = normalizeSpeechText(previewDelta);

  if (!normalizedIncoming || !normalizedPreview) return normalizedIncoming;

  const previewFirstToken = normalizeSpeechToken(
    normalizedPreview.split(' ')[0]
  );
  const incomingParts = normalizedIncoming.split(' ');
  const incomingFirstToken = normalizeSpeechToken(incomingParts[0]);
  const incomingSecondToken = normalizeSpeechToken(incomingParts[1]);

  if (
    incomingParts.length < 2 ||
    !previewFirstToken ||
    incomingFirstToken !== previewFirstToken ||
    incomingSecondToken !== incomingFirstToken
  ) {
    return normalizedIncoming;
  }

  // Некоторые движки после partial-preview возвращают final с повтором первого
  // слова нового фрагмента: partial "три" -> final "три три четыре".
  return [incomingParts[0], ...incomingParts.slice(2)].join(' ');
}

let activeDictationOwner: symbol | null = null;

export function useVoiceDictationInput(options: UseVoiceDictationInputOptions) {
  const speechStore = useSpeechStore();
  const { settings, start, stop, onPartial, onFinal, onError } =
    useSpeechEngine();
  const micPermissionGate = useMicPermissionGate();
  const sceneAudioFocus = useSceneAudioFocus();
  const isApplyingVoiceInput = ref(false);
  const baseText = ref('');
  const sessionTranscript = ref('');
  const isDisposed = ref(false);
  const separator = options.separator ?? ' ';
  const lastStartPermissionState = ref<MicPermissionState>(null);
  const sessionId = ref(0);
  const activeSessionId = ref<number | null>(null);
  const dictationAudioLock = ref<SceneAudioFocusLock | null>(null);
  const lastAcceptedSpeechChunk = ref('');
  const lastAcceptedSpeechChunkAtMs = ref(0);
  const lastPreviewSpeechDelta = ref('');
  // Mobile-браузеры (особенно Android Chrome / Google Speech) в continuous
  // mode выдают «много final-ов», каждый cumulative ОТНОСИТЕЛЬНО ТЕКУЩЕЙ
  // фразы (не от начала session). Чтобы строить дельту корректно, отдельно
  // от sessionTranscript трекаем «последний полный final-текст». Сбрасываем
  // когда incoming не start'ится с предыдущего — это сигнал «новая фраза».
  const lastFinalText = ref('');
  const instanceId = Symbol('voice-dictation-input');

  function hasActiveSession(): boolean {
    return (
      activeDictationOwner === instanceId && activeSessionId.value !== null
    );
  }

  function isCurrentSessionActive(): boolean {
    return hasActiveSession() && activeSessionId.value === sessionId.value;
  }

  function clearActiveSession(): void {
    if (activeDictationOwner === instanceId) {
      activeDictationOwner = null;
    }
    activeSessionId.value = null;
  }

  function resetSessionTranscript(): void {
    sessionTranscript.value = '';
    lastAcceptedSpeechChunk.value = '';
    lastAcceptedSpeechChunkAtMs.value = 0;
    lastPreviewSpeechDelta.value = '';
    lastFinalText.value = '';
  }

  /**
   * Вычисляет дельту chunk'а относительно `lastFinalText` (последний полный
   * final-текст этой dictation session).
   *
   * Если chunk начинается с lastFinalText (regardless of case) — это
   * cumulative продолжение текущей фразы, берём только хвост и обновляем
   * lastFinalText до полного chunk'а. Так фраза «напиши», «напиши
   * конкретный», «напиши конкретный триггер» вставляется правильно одна
   * за другой без дублей.
   *
   * Если chunk НЕ начинается с lastFinalText — это новая фраза (после
   * паузы или после restart recognition'а). Используем chunk целиком,
   * обновляем lastFinalText.
   *
   * Возвращает дельту для добавления в sessionTranscript.
   */
  function extractFinalDelta(normalizedChunk: string): string {
    if (!normalizedChunk) return '';

    // Защита от повторной вставки уже принятого текста: некоторые движки
    // присылают final, который cumulative относительно всего sessionTranscript
    // (а не только последней фразы). Берём только новый хвост.
    const acceptedTranscript = normalizeSpeechText(sessionTranscript.value);
    if (acceptedTranscript) {
      const acceptedLower = acceptedTranscript.toLowerCase();
      const chunkLower = normalizedChunk.toLowerCase();

      if (chunkLower === acceptedLower) {
        lastFinalText.value = normalizedChunk;
        return '';
      }

      if (
        chunkLower.startsWith(`${acceptedLower} `) ||
        (chunkLower.startsWith(acceptedLower) &&
          hasSpeechBoundary(normalizedChunk, acceptedTranscript.length))
      ) {
        lastFinalText.value = normalizedChunk;
        return normalizedChunk.slice(acceptedTranscript.length).trim();
      }
    }

    const prev = lastFinalText.value;
    if (!prev) {
      lastFinalText.value = normalizedChunk;
      return normalizedChunk;
    }
    const prevLower = prev.toLowerCase();
    const chunkLower = normalizedChunk.toLowerCase();
    if (chunkLower === prevLower) {
      // Тот же текст — дубль, ничего нового.
      return '';
    }
    if (
      chunkLower.startsWith(`${prevLower} `) ||
      (chunkLower.startsWith(prevLower) &&
        hasSpeechBoundary(normalizedChunk, prev.length))
    ) {
      const tail = normalizedChunk.slice(prev.length).trim();
      lastFinalText.value = normalizedChunk;
      return tail;
    }
    // Новая фраза — recognition сбросил буфер или начал новую отдельную
    // фразу после паузы.
    lastFinalText.value = normalizedChunk;
    return normalizedChunk;
  }

  /**
   * Версия для partial-event'ов. Логика та же что у extractFinalDelta,
   * но БЕЗ обновления `lastFinalText` — preview не должен влиять на
   * tracking уже принятых finals.
   */
  function extractPartialDelta(normalizedChunk: string): string {
    if (!normalizedChunk) return '';
    const prev = lastFinalText.value;
    if (!prev) return normalizedChunk;
    const prevLower = prev.toLowerCase();
    const chunkLower = normalizedChunk.toLowerCase();
    if (chunkLower === prevLower) return '';
    if (
      chunkLower.startsWith(`${prevLower} `) ||
      (chunkLower.startsWith(prevLower) &&
        hasSpeechBoundary(normalizedChunk, prev.length))
    ) {
      return normalizedChunk.slice(prev.length).trim();
    }
    return normalizedChunk;
  }

  function isRecentDuplicateSpeechChunk(chunk: string): boolean {
    const normalizedChunk = normalizeSpeechText(chunk);
    if (!normalizedChunk || !lastAcceptedSpeechChunk.value) return false;
    if (normalizedChunk.toLowerCase() !== lastAcceptedSpeechChunk.value) {
      return false;
    }
    return (
      Date.now() - lastAcceptedSpeechChunkAtMs.value <=
      RECENT_DUPLICATE_SPEECH_CHUNK_MS
    );
  }

  function acceptSpeechChunk(chunk: string): void {
    const normalizedChunk = normalizeSpeechText(chunk);
    if (!normalizedChunk) return;

    sessionTranscript.value = appendSpeechChunk(
      sessionTranscript.value,
      normalizedChunk
    );
    lastAcceptedSpeechChunk.value = normalizedChunk.toLowerCase();
    lastAcceptedSpeechChunkAtMs.value = Date.now();
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

  const stopPartialListener = onPartial((partial) => {
    if (
      isDisposed.value ||
      !speechStore.isListening ||
      !isCurrentSessionActive()
    ) {
      return;
    }

    const normalizedPartial = normalizeSpeechText(partial);
    const partialDelta = extractPartialDelta(normalizedPartial);
    const isDuplicatePartial = isRecentDuplicateSpeechChunk(partialDelta);
    lastPreviewSpeechDelta.value = isDuplicatePartial ? '' : partialDelta;
    const previewTranscript = isDuplicatePartial
      ? sessionTranscript.value
      : appendSpeechChunk(sessionTranscript.value, partialDelta);

    isApplyingVoiceInput.value = true;
    options.setValue(
      mergeWithBase(baseText.value, previewTranscript, separator)
    );

    void nextTick(() => {
      isApplyingVoiceInput.value = false;
    });
  });

  const stopFinalListener = onFinal((finalText) => {
    if (isDisposed.value || !isCurrentSessionActive()) return;

    const normalizedFinal = normalizeSpeechText(finalText);
    if (!normalizedFinal) return;

    const rawFinalDelta = extractFinalDelta(normalizedFinal);
    const finalDelta = collapsePreviewLeadingDuplicate(
      rawFinalDelta,
      lastPreviewSpeechDelta.value
    );
    lastPreviewSpeechDelta.value = '';

    if (!finalDelta) return;
    if (isRecentDuplicateSpeechChunk(finalDelta)) return;

    acceptSpeechChunk(finalDelta);

    isApplyingVoiceInput.value = true;
    const merged = mergeWithBase(
      baseText.value,
      sessionTranscript.value,
      separator
    );
    options.setValue(merged);

    if (options.onFinalTranscription) {
      void Promise.resolve(
        options.onFinalTranscription({
          finalText: finalDelta,
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

  const stopErrorListener = onError((error) => {
    if (isDisposed.value || !isCurrentSessionActive()) return;

    clearActiveSession();
    void stop();
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
        resetSessionTranscript();
      }
    }
  );

  watch(
    () => speechStore.isListening,
    (isListening) => {
      if (isListening) {
        return;
      }

      clearActiveSession();
      void releaseDictationAudioFocus();
    }
  );

  async function toggleListening(): Promise<void> {
    if (speechStore.isListening) {
      // Глобально движок уже слушает. Может быть наша же сессия (тогда просто
      // выключаем диктовку) или другая textarea на странице — тогда корректно
      // останавливаем её и стартуем свою, чтобы микрофон не оставался занят
      // невидимым инстансом и текст шёл именно в эту textarea.
      if (isCurrentSessionActive()) {
        await stopListening();
        return;
      }
      try {
        await stop();
      } catch (error) {
        console.warn(
          '[VoiceDictationInput] Failed to stop previous dictation session:',
          error
        );
      }
    }

    baseText.value = normalizeText(options.getValue());
    resetSessionTranscript();
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
      activeDictationOwner = instanceId;
      activeSessionId.value = sessionId.value;
      // continuousMode: true — диктовка не останавливается после first final
      // (mobile-браузеры выдают final быстро). Native engine (Capacitor) уже
      // имеет аналогичное поведение по умолчанию.
      await start({ continuousMode: true });
    } catch (error) {
      console.error('[VoiceDictationInput] Failed to start dictation:', error);
      clearActiveSession();
      speechStore.isListening = false;
      baseText.value = '';
      resetSessionTranscript();
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
    clearActiveSession();
    try {
      await stop();
    } finally {
      await releaseDictationAudioFocus();
      if (!normalizeText(options.getValue())) {
        baseText.value = '';
        resetSessionTranscript();
      }
    }
  }

  function clearBaseText(): void {
    baseText.value = '';
    resetSessionTranscript();
  }

  onScopeDispose(() => {
    isDisposed.value = true;
    stopPartialListener();
    stopFinalListener();
    stopErrorListener();
    const shouldStopActiveEngine = isCurrentSessionActive();
    clearActiveSession();
    if (shouldStopActiveEngine) {
      void stop();
    }
    void releaseDictationAudioFocus();
  });

  return {
    settings,
    // Visual indicator активной диктовки именно ЭТОГО инстанса. Раньше здесь
    // возвращался глобальный `speechStore.isListening`, из-за чего при двух
    // и более composer'ах на странице (например, structured_form с тремя
    // textarea) иконки микрофона «активировались» во всех одновременно,
    // хотя транскрипция шла только в последний стартовавший. Теперь иконка
    // подсвечивается только в той textarea, чья сессия реально пишет.
    isListening: computed(
      () => speechStore.isListening && isCurrentSessionActive()
    ),
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
