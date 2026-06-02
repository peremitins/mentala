import { computed, onScopeDispose, ref } from 'vue';
import {
  countCharsWithoutSpaces,
  SESSION_SUMMARY_FORCE_MIN_USER_MESSAGES,
  SESSION_SUMMARY_MIN_DURATION_SECONDS,
  SESSION_SUMMARY_MIN_QUALIFYING_MESSAGES,
  SESSION_SUMMARY_MIN_USER_MESSAGES,
  SESSION_SUMMARY_QUALIFYING_MIN_CHARS,
  useChatStore,
} from '@/app/stores/chat';
import { useSubscriptionStore } from '@/app/stores/subscription';
import { useSpeechStore } from '@/app/stores/speech';
import { useTTS } from '@/app/composables/useTTS';

/**
 * Lifecycle-обёртка над chat store: реактивные eligibility-getters, тикер времени,
 * orchestrator finalize() со всеми сопутствующими stop-вызовами (TTS / stream / mic).
 *
 * См. .docs/audit_chat_lifecycle.md — полный inventory триггеров и ресурсов.
 *
 * НЕ регистрирует слушателей `visibilitychange` / `pagehide` / Capacitor `appStateChange` —
 * они уже есть в `app/plugins/session-finish.client.ts` как глобальная страховка.
 *
 * Использование:
 *   const chatSession = useChatSession();
 *   chatSession.startIfNeeded();           // lazy старт billing-сессии (по факту делает chat.startTherapySession внутри chat.sendMessage)
 *   await chatSession.finalize({ reason: 'manual_summary' });
 *   chatSession.isEligible.value;          // готов ли диалог к подведению итога
 *   chatSession.eligibilityProgress.value; // для UI прогресс-индикатора в Roadmap
 *
 * `onScopeDispose` defensively вызывает `finalize({ reason: 'unmount' })`. Это покрывает
 * сценарий «пользователь нажал назад / закрыл шаг Roadmap» — текстовая часть гарантированно
 * закрыта, а realtime/voice освобождаются через свои composable.
 */

export type ChatSessionFinalizeReason =
  | 'manual_summary'
  | 'roadmap_next'
  | 'unmount'
  | 'logout';

export type ChatSessionFinalizeResult = {
  eligible: boolean;
  triggered: boolean;
};

export type ChatEligibilityProgress = {
  messages: { current: number; target: number; satisfied: boolean };
  duration: { currentSec: number; targetSec: number; satisfied: boolean };
  qualifying: { current: number; target: number; satisfied: boolean };
  forceBypass: { current: number; target: number; satisfied: boolean };
};

// Dev-runtime флаг — синхронно с chat-store (см. IS_DEVELOPMENT_RUNTIME там).
// В dev-режиме eligibility работает по OR-логике с очень мягкими порогами,
// чтобы локально не нужно было общаться 3 минуты для прохождения шага.
const IS_DEV_RUNTIME =
  import.meta.dev || process.env.NUXT_PUBLIC_IS_DEV === 'true';

// Dev OR-пороги: достаточно ОДНОГО из условий, чтобы кнопка стала активной.
// Минимальные пороги, чтобы локально кнопка активировалась практически
// сразу после старта диалога.
const DEV_OR_MIN_MESSAGES = 1;
const DEV_OR_MIN_DURATION_SEC = 30;

export type UseChatSessionOptions = {
  /**
   * Если true — `onScopeDispose` не вызывает defensive `finalize({ reason: 'unmount' })`.
   *
   * Нужен для embedded-режима внутри Roadmap-шага: ChatRoom unmount'ится при
   * переключении на следующий action в том же шаге, но billing-сессию закрывать
   * нельзя — пользователь продолжает работать в чате на новой странице или
   * завершает Roadmap-шаг через explicit `finalize({ reason: 'roadmap_next' })`.
   *
   * Глобальный плагин `session-finish.client.ts` всё равно ловит pagehide/visibility,
   * так что обязательного finalize при настоящем уходе со страницы не теряем.
   */
  skipDisposeFinalize?: boolean;
  /**
   * Override порогов eligibility для конкретной сессии (например, Roadmap-шаг
   * задаёт `minQualifyingMessages=3` и `minDurationSec=180`). Если не передано —
   * используются глобальные SESSION_SUMMARY_MIN_* константы.
   *
   * Important: пороги override'ятся целиком, не «не меньше». Если в blueprint
   * указано минимум 1 минута, eligibility сработает через 1 минуту, даже если
   * глобальный prod-минимум 4 минуты — это by design (Roadmap-шаги короткие).
   */
  eligibilityOverrides?: {
    minMessages?: number;
    minDurationSec?: number;
    minQualifying?: number;
    /**
     * Минимум символов без пробелов для «содержательного» сообщения.
     * По умолчанию SESSION_SUMMARY_QUALIFYING_MIN_CHARS (80 в prod, 5 в dev).
     * В Roadmap-режиме можно снизить до 30-40, чтобы короткие но осмысленные
     * ответы засчитывались как qualifying.
     */
    qualifyingMinChars?: number;
  };
  /**
   * Если true — eligibility активируется по OR-логике (любое одно из условий
   * достаточно), а не AND. Используется в embedded-режиме (Roadmap-шаг):
   * пользователь должен иметь возможность завершить шаг хотя бы по времени,
   * даже если сообщения короткие, и наоборот.
   *
   * В dev OR-логика включается автоматически независимо от этого флага.
   */
  useOrLogic?: boolean;
};

export function useChatSession(options?: UseChatSessionOptions) {
  const chat = useChatStore();
  const speechStore = useSpeechStore();
  const { stop: stopTTS } = useTTS();

  // Тикер раз в секунду нужен, чтобы computed liveDurationSeconds пересчитывался без
  // активности пользователя (eligibility должна активироваться по факту прошедшего
  // времени, даже если последнее сообщение было минуту назад).
  const tickerNow = ref(Date.now());
  let tickerInterval: ReturnType<typeof setInterval> | null = null;
  let isFinalizing = false;

  function startTicker() {
    if (tickerInterval) return;
    tickerInterval = setInterval(() => {
      tickerNow.value = Date.now();
    }, 1000);
  }

  function stopTicker() {
    if (tickerInterval) {
      clearInterval(tickerInterval);
      tickerInterval = null;
    }
  }

  startTicker();

  const liveDurationSeconds = computed(() => {
    if (!chat.sessionStartedAt) return 0;
    const startMs = new Date(chat.sessionStartedAt).getTime();
    const lastActivityMs = chat.lastActivityAt
      ? new Date(chat.lastActivityAt).getTime()
      : 0;
    const nowMs = Math.max(tickerNow.value, lastActivityMs);
    return Math.max(0, Math.floor((nowMs - startMs) / 1000));
  });

  const userMessagesCount = computed(() => chat.userMessagesCount);

  // Если override для qualifyingMinChars не задан — используем глобальный
  // store-getter (по умолчанию prod=80, dev=5). С override считаем собственным
  // фильтром, не трогая глобальный chat.qualifyingUserMessagesCount.
  const qualifyingMinChars =
    options?.eligibilityOverrides?.qualifyingMinChars ??
    SESSION_SUMMARY_QUALIFYING_MIN_CHARS;
  const qualifyingUserMessagesCount = computed(() => {
    if (options?.eligibilityOverrides?.qualifyingMinChars == null) {
      return chat.qualifyingUserMessagesCount;
    }
    return chat.messages.filter(
      (m) =>
        m.role === 'user' &&
        countCharsWithoutSpaces(m.content) >= qualifyingMinChars
    ).length;
  });

  const minMessages =
    options?.eligibilityOverrides?.minMessages ??
    SESSION_SUMMARY_MIN_USER_MESSAGES;
  const minDurationSec =
    options?.eligibilityOverrides?.minDurationSec ??
    SESSION_SUMMARY_MIN_DURATION_SECONDS;
  const minQualifying =
    options?.eligibilityOverrides?.minQualifying ??
    SESSION_SUMMARY_MIN_QUALIFYING_MESSAGES;
  const forceMinMessages = SESSION_SUMMARY_FORCE_MIN_USER_MESSAGES;

  const isEligible = computed(() => {
    if (userMessagesCount.value >= forceMinMessages) return true;

    // Dev-runtime: простые OR-пороги «1 минута ИЛИ 3 сообщения», чтобы
    // локально не приходилось вести длинный разговор на каждом шаге.
    // forceMinMessages выше уже сработал для очень длинных сессий.
    if (IS_DEV_RUNTIME) {
      return (
        userMessagesCount.value >= DEV_OR_MIN_MESSAGES ||
        liveDurationSeconds.value >= DEV_OR_MIN_DURATION_SEC
      );
    }

    // Prod embedded (Roadmap): OR-логика по порогам blueprint'а. Если у
    // пользователя 3 содержательных сообщения ИЛИ он провёл в разговоре
    // минимум minDurationSec — шаг можно завершить. Это менее строго чем
    // глобальный prod-чат (AND), потому что Roadmap-шаги короткие
    // и фиксированные по теме.
    if (options?.useOrLogic) {
      return (
        qualifyingUserMessagesCount.value >= minQualifying ||
        liveDurationSeconds.value >= minDurationSec
      );
    }

    // Prod page-mode: классическая AND-логика (5 сообщений + 4 минуты
    // + 3 содержательных), синхронно с серверным sessionSummaryUser.
    return (
      userMessagesCount.value >= minMessages &&
      liveDurationSeconds.value >= minDurationSec &&
      qualifyingUserMessagesCount.value >= minQualifying
    );
  });

  const eligibilityProgress = computed<ChatEligibilityProgress>(() => ({
    messages: {
      current: userMessagesCount.value,
      target: minMessages,
      satisfied: userMessagesCount.value >= minMessages,
    },
    duration: {
      currentSec: liveDurationSeconds.value,
      targetSec: minDurationSec,
      satisfied: liveDurationSeconds.value >= minDurationSec,
    },
    qualifying: {
      current: qualifyingUserMessagesCount.value,
      target: minQualifying,
      satisfied: qualifyingUserMessagesCount.value >= minQualifying,
    },
    forceBypass: {
      current: userMessagesCount.value,
      target: forceMinMessages,
      satisfied: userMessagesCount.value >= forceMinMessages,
    },
  }));

  /**
   * Lazy-старт client-side `sessionId` (не billing-сессии).
   * billing-сессия (therapySession) открывается chat-store автоматически при первом
   * sendMessage; этот метод нужен для случаев, когда страница хочет заранее иметь client sessionId
   * (например, чтобы передать его в auto-start приветствия).
   */
  function startIfNeeded(): void {
    if (!chat.sessionId) {
      chat.startSession();
    }
  }

  /**
   * Останавливает текстовый stream, TTS и микрофон в правильном порядке.
   * Используется и при finalize, и при handoff text → realtime voice.
   */
  async function releaseRuntimeResources(): Promise<void> {
    chat.stopChatStream();
    stopTTS();
    if (speechStore.isListening) {
      // useSpeechEngine.stop() обрабатывает scene-audio focus сам; здесь нужен
      // только impulse-stop, не дожидаясь финального callback'а.
      const { useSpeechEngine } = await import(
        '@/app/composables/useSpeechEngine'
      );
      const { stop: stopMic } = useSpeechEngine();
      await stopMic();
    }
  }

  /**
   * Центральный orchestrator завершения сессии.
   * Сам результат суммаризации зависит от eligibility:
   *  - eligible + therapySessionId есть → сервер строит summary;
   *  - eligible=false → просто закрываем billing-сессию.
   *
   * После завершения чистим клиентский кеш подписки (минуты обновились).
   */
  async function finalize(params: {
    reason: ChatSessionFinalizeReason;
  }): Promise<ChatSessionFinalizeResult> {
    if (isFinalizing) {
      return { eligible: false, triggered: false };
    }
    isFinalizing = true;

    try {
      await releaseRuntimeResources();

      // chat.endSessionAndSummarize принимает API-триггеры summary.
      // Map нашему расширенному reason → серверному значению.
      const storeTrigger: 'manual' | 'roadmap_next' | 'logout' | 'app-hidden' =
        params.reason === 'logout'
          ? 'logout'
          : params.reason === 'roadmap_next'
            ? 'roadmap_next'
            : params.reason === 'unmount'
              ? 'app-hidden'
              : 'manual';

      // КРИТИЧНО для Roadmap (reason='roadmap_next'): у Roadmap ai_chat шага
      // свои пороги eligibility (props.minQualifyingMessages / props.minDurationSec),
      // которые мягче глобальных (prod: 5 user / 240 сек / 3 qualifying). Без
      // явного override store-getter `isEligibleForSummary` вернёт false и
      // summary не отправится на сервер → пустая страница «История сессий».
      // Здесь у нас уже есть локальный `isEligible` computed по Roadmap-thresholds —
      // пробрасываем его как override. Для остальных reason override не нужен.
      const eligibilityOverride: boolean | undefined =
        params.reason === 'roadmap_next' ? isEligible.value : undefined;
      const metricsOverride =
        params.reason === 'roadmap_next'
          ? {
              userMessagesCount: userMessagesCount.value,
              qualifyingUserMessagesCount: qualifyingUserMessagesCount.value,
              durationSeconds: liveDurationSeconds.value,
              sessionStartedAt: chat.sessionStartedAt
                ? new Date(chat.sessionStartedAt).toISOString()
                : undefined,
            }
          : undefined;

      const result = await chat.endSessionAndSummarize({
        trigger: storeTrigger,
        eligibilityOverride,
        metricsOverride,
      });

      // Минуты биллинга могли измениться — сбрасываем кеш подписки, чтобы при
      // следующем заходе пользователь увидел свежие лимиты.
      try {
        const subscriptionStore = useSubscriptionStore();
        subscriptionStore.invalidateCache();
      } catch (error) {
        console.error(
          '[useChatSession] Failed to invalidate subscription cache:',
          error
        );
      }

      return result;
    } finally {
      isFinalizing = false;
    }
  }

  // Defensive cleanup: если ChatRoom/page unmount'ится без явного finalize
  // (back-навигация, переход через bottom nav), мы всё равно закрываем billing-сессию.
  // Глобальный плагин session-finish.client.ts тоже сделает endTherapySession при
  // visibilitychange/pagehide, но page-level закрытие при router navigation он не ловит.
  //
  // skipDisposeFinalize: см. UseChatSessionOptions — для embedded-режима unmount
  // ChatRoom происходит при переключении actions внутри Roadmap-шага, и finalize
  // тут не нужен.
  onScopeDispose(() => {
    stopTicker();
    if (options?.skipDisposeFinalize) {
      return;
    }
    // finalize асинхронна, но запрос end уходит через keepalive-fetch — он переживёт
    // unmount даже без await. Не блокируем dispose Promise'ом.
    void finalize({ reason: 'unmount' }).catch((error) => {
      console.error(
        '[useChatSession] finalize on dispose failed (non-blocking):',
        error
      );
    });
  });

  return {
    // state
    isEligible,
    liveDurationSeconds,
    userMessagesCount,
    qualifyingUserMessagesCount,
    eligibilityProgress,

    // thresholds (для UI tooltip)
    minMessages,
    minDurationSec,
    minQualifying,
    forceMinMessages,

    // actions
    startIfNeeded,
    finalize,
    releaseRuntimeResources,
  };
}
