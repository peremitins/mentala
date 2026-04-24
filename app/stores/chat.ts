import { defineStore } from 'pinia';
import { useLoadersStore } from '@/app/stores/loaders';
import { nanoid } from 'nanoid';
import { useRuntimeConfig } from 'nuxt/app';
import { getCsrfTokenForHeader } from '@/app/utils/csrf';
import {
  getPersistentItem,
  removePersistentItem,
  setPersistentItem,
} from '@/app/utils/persistentStorage';
import {
  ChatModeHandoffResponseDto,
  ChatResponseDto,
  ChatStreamChunkDto,
  type ChatEntryContext,
  type ChatFeedbackTopicCode,
  type SuggestedChip,
} from '@/shared/dto';
import { GetRestorableTherapySessionResponseDto } from '@/shared/dto/therapySessionRestore';
import { CHAT_STREAM_MODE } from '@/app/constants/chat';

function extractApiErrorMessage(error: any): string | null {
  const payloadMessage =
    error?.data?.message ||
    error?.data?.error?.message ||
    error?.response?._data?.message ||
    error?.response?._data?.error?.message ||
    null;

  if (typeof payloadMessage === 'string' && payloadMessage.trim().length > 0) {
    return payloadMessage.trim();
  }

  if (typeof error?.message === 'string' && error.message.trim().length > 0) {
    return error.message.trim();
  }

  return null;
}

export type ChatStoreMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  // Терапевтическая сессия, в рамках которой сгенерировано сообщение.
  therapySessionId: number | null;
  // Временные сообщения живут только на текущем экране и не сохраняются на сервере.
  transient?: boolean;
  source?: 'chat' | 'realtime';
  feedbackDisabled?: boolean;
  realtimeTurnId?: string | null;
};

export type ChatMessageFeedbackState = {
  rating: 1 | -1;
  topicCode: ChatFeedbackTopicCode | null;
  comment: string | null;
  updatedAt: string;
};

type ChatApiMessage = {
  role: 'user' | 'assistant';
  content: string;
};

// Пороги для eligibility "содержательной сессии" (ТЗ п.7.2, 7.3).
// Проверки дублируются на сервере — см. server/application/sessionSummaryUser.service.
// В dev-режиме — сниженные пороги для быстрого тестирования.
export const SESSION_SUMMARY_MIN_USER_MESSAGES = import.meta.dev ? 1 : 5;
export const SESSION_SUMMARY_MIN_DURATION_SECONDS = import.meta.dev
  ? 60
  : 4 * 60;
// Минимум символов без пробелов для "содержательного" сообщения.
// В dev снижаем до 5 чтобы любая фраза типа "привет" считалась qualifying.
export const SESSION_SUMMARY_QUALIFYING_MIN_CHARS = import.meta.dev ? 5 : 80;
export const SESSION_SUMMARY_MIN_QUALIFYING_MESSAGES = import.meta.dev ? 1 : 3;
export const SESSION_SUMMARY_FORCE_MIN_USER_MESSAGES = 15;

const PENDING_THERAPY_SESSION_ENDS_STORAGE_KEY =
  'chat.pending-therapy-session-ends';
const PENDING_THERAPY_SESSION_END_RETRY_DELAY_MS = 5_000;

type PendingTherapySessionEndRecord = {
  sessionId: number;
  createdAt: string;
};

function normalizePendingTherapySessionEnds(
  value: unknown
): PendingTherapySessionEndRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<number>();
  const normalized: PendingTherapySessionEndRecord[] = [];

  for (const item of value) {
    const sessionId =
      typeof item?.sessionId === 'number' && Number.isInteger(item.sessionId)
        ? item.sessionId
        : Number.NaN;
    const createdAt =
      typeof item?.createdAt === 'string' && item.createdAt.trim().length > 0
        ? item.createdAt
        : new Date().toISOString();

    if (!Number.isInteger(sessionId) || sessionId <= 0 || seen.has(sessionId)) {
      continue;
    }

    seen.add(sessionId);
    normalized.push({ sessionId, createdAt });
  }

  return normalized;
}

async function readPendingTherapySessionEnds(): Promise<
  PendingTherapySessionEndRecord[]
> {
  const rawValue = await getPersistentItem(
    PENDING_THERAPY_SESSION_ENDS_STORAGE_KEY
  );
  if (!rawValue) {
    return [];
  }

  try {
    return normalizePendingTherapySessionEnds(JSON.parse(rawValue));
  } catch (error) {
    console.error(
      '[Chat Store] Failed to parse pending therapy session ends:',
      error
    );
    await removePersistentItem(PENDING_THERAPY_SESSION_ENDS_STORAGE_KEY);
    return [];
  }
}

async function writePendingTherapySessionEnds(
  records: PendingTherapySessionEndRecord[]
): Promise<void> {
  if (!records.length) {
    await removePersistentItem(PENDING_THERAPY_SESSION_ENDS_STORAGE_KEY);
    return;
  }

  await setPersistentItem(
    PENDING_THERAPY_SESSION_ENDS_STORAGE_KEY,
    JSON.stringify(records)
  );
}

async function enqueuePendingTherapySessionEnd(
  sessionId: number
): Promise<void> {
  const pending = await readPendingTherapySessionEnds();
  if (pending.some((item) => item.sessionId === sessionId)) {
    return;
  }

  pending.push({
    sessionId,
    createdAt: new Date().toISOString(),
  });
  await writePendingTherapySessionEnds(pending);
}

async function removePendingTherapySessionEnd(
  sessionId: number
): Promise<void> {
  const pending = await readPendingTherapySessionEnds();
  const next = pending.filter((item) => item.sessionId !== sessionId);
  await writePendingTherapySessionEnds(next);
}

function isTerminalEndSessionStatus(status: number): boolean {
  return [400, 401, 403, 404, 409].includes(status);
}

function countCharsWithoutSpaces(text: string): number {
  if (typeof text !== 'string') return 0;
  return text.replace(/\s+/g, '').length;
}

export const useChatStore = defineStore('chat', {
  state: () => ({
    messages: [] as ChatStoreMessage[],
    userText: '' as string,
    provider: 'openai' as 'openai' | 'deepseek' | 'yandex',
    sessionId: '' as string,
    therapySessionId: null as number | null, // ID therapy сессии для биллинга
    feedbackByMessageId: {} as Record<string, ChatMessageFeedbackState>,
    feedbackSubmittingByMessageId: {} as Record<string, boolean>,
    suggestedChips: [] as SuggestedChip[],
    currentChatAbortController: null as AbortController | null,
    sessionStartedAt: null as Date | null, // Момент отправки первого user-сообщения в текущей сессии
    lastActivityAt: null as Date | null, // Время последней активности для idle timeout
    lastPingAt: null as number | null, // Последний ping на сервер (throttle)
    idleTimeoutTimer: null as ReturnType<typeof setTimeout> | null, // Таймер для idle timeout чата
    historyAnchorTherapySessionId: null as number | null, // Последняя therapy-сессия backlog, к которой привязан несуммаризованный transcript
    pendingEndSessionRetryTimer: null as ReturnType<typeof setTimeout> | null, // Отложенный retry flush для session end
    isEndingSession: false as boolean, // Флаг для предотвращения множественных вызовов endTherapySession
    isFinalizingSession: false as boolean, // Защита от повторного вызова endSessionAndSummarize
    entryContext: null as ChatEntryContext | null,
    isGenerating: false as boolean, // Флаг для отображения индикатора загрузки при генерации ответа
    lastStartSessionError: null as string | null,
  }),
  getters: {
    userMessagesCount(state): number {
      return state.messages.filter((m) => m.role === 'user').length;
    },
    qualifyingUserMessagesCount(state): number {
      return state.messages.filter(
        (m) =>
          m.role === 'user' &&
          countCharsWithoutSpaces(m.content) >=
            SESSION_SUMMARY_QUALIFYING_MIN_CHARS
      ).length;
    },
    sessionDurationSeconds(state): number {
      if (!state.sessionStartedAt) return 0;
      const startMs = new Date(state.sessionStartedAt).getTime();
      const endMs = state.lastActivityAt
        ? new Date(state.lastActivityAt).getTime()
        : Date.now();
      return Math.max(0, Math.floor((endMs - startMs) / 1000));
    },
    isEligibleForSummary(): boolean {
      if (this.userMessagesCount >= SESSION_SUMMARY_FORCE_MIN_USER_MESSAGES) {
        return true;
      }

      // Внимание: используем `>=` во всех 3 проверках — синхронно с серверной
      // логикой (server/application/sessionSummaryUser.service.ts).
      // Раньше здесь был `>` для длительности, из-за чего клиент был строже
      // сервера на 1 секунду и кнопка могла "мигать" на границе.
      return (
        this.userMessagesCount >= SESSION_SUMMARY_MIN_USER_MESSAGES &&
        this.sessionDurationSeconds >= SESSION_SUMMARY_MIN_DURATION_SECONDS &&
        this.qualifyingUserMessagesCount >=
          SESSION_SUMMARY_MIN_QUALIFYING_MESSAGES
      );
    },
  },
  actions: {
    resetTherapySessionState(sessionIdToClear?: number | null) {
      if (
        typeof sessionIdToClear === 'number' &&
        this.therapySessionId !== sessionIdToClear
      ) {
        return;
      }

      this.therapySessionId = null;
      this.lastActivityAt = null;
      this.lastPingAt = null;
      this.clearIdleTimeout();
      this.isEndingSession = false;
    },
    startSession(sessionId?: string) {
      this.sessionId = sessionId || nanoid();
      this.sessionStartedAt = null;
    },
    finishSession() {
      this.sessionId = '';
      this.suggestedChips = [];
      this.sessionStartedAt = null;
      // Завершаем therapy сессию при завершении чата (асинхронно, не блокируем)
      if (this.therapySessionId && !this.isEndingSession) {
        void this.endTherapySession();
      }
    },
    /**
     * Центральный сценарий завершения пользовательской сессии (ТЗ п.8, п.9, п.10).
     *
     * Триггеры:
     *  - 'manual'      — пользователь нажал "Завершить сессию"
     *  - 'app-hidden'  — приложение сворачивается (visibilitychange/pagehide/Capacitor pause),
     *                    когда клиентский стор фактически зачищается.
     *  - 'logout'      — legacy trigger, который сервер ещё понимает, но текущий
     *                    клиент больше не использует для user-summary.
     *
     * Суммаризация выполняется на сервере асинхронно. Клиент лишь триггерит её
     * вызовом endpoint'а, если выполнены все условия eligibility на момент вызова.
     * Стор зачищается только после попытки триггера, чтобы не потерять контекст.
     */
    async endSessionAndSummarize(params: {
      trigger: 'manual' | 'logout' | 'app-hidden';
    }): Promise<{ eligible: boolean; triggered: boolean }> {
      if (this.isFinalizingSession) {
        return { eligible: false, triggered: false };
      }
      this.isFinalizingSession = true;

      // Обновляем lastActivityAt до текущего момента: sessionDurationSeconds
      // в getter считается как (lastActivityAt - sessionStartedAt), что отстаёт
      // если юзер ждал перед нажатием кнопки. Page-level computed с тикером
      // учитывает Date.now(), а store getter — нет. Без этого eligible=false
      // при задержке между последним сообщением и нажатием "Завершить".
      if (this.sessionStartedAt) {
        this.lastActivityAt = new Date();
      }

      const eligible = this.isEligibleForSummary;
      const therapySessionId =
        this.therapySessionId ?? this.historyAnchorTherapySessionId;
      const clientSessionId = this.sessionId;
      let triggered = false;

      try {
        if (eligible && therapySessionId) {
          triggered = await this._requestSessionSummary({
            therapySessionId,
            clientSessionId,
            trigger: params.trigger,
          });
        }

        // Завершаем therapy сессию и чистим клиентское состояние — независимо от
        // результата суммаризации. Сервер продолжит работу в фоне.
        if (this.therapySessionId && !this.isEndingSession) {
          await this.endTherapySession();
        }

        this._hardClearChatClient();
      } finally {
        this.isFinalizingSession = false;
      }

      return { eligible, triggered };
    },
    /**
     * Чистая клиентская очистка состояния чата без вызовов на сервер.
     * Используется внутри endSessionAndSummarize — чтобы не дублировать endTherapySession.
     */
    _hardClearChatClient() {
      this.stopChatStream();
      this.messages = [];
      this.userText = '';
      this.suggestedChips = [];
      this.feedbackByMessageId = {};
      this.feedbackSubmittingByMessageId = {};
      this.sessionId = '';
      this.historyAnchorTherapySessionId = null;
      this.sessionStartedAt = null;
      this.entryContext = null;
    },
    /**
     * Отправляет запрос на генерацию итога сессии.
     * Для 'app-hidden' — через keepalive fetch, чтобы запрос не оборвался при закрытии вкладки.
     * Для 'manual' и legacy 'logout' — через обычный $api.
     */
    async _requestSessionSummary(params: {
      therapySessionId: number;
      clientSessionId: string;
      trigger: 'manual' | 'logout' | 'app-hidden';
    }): Promise<boolean> {
      // Собираем сообщения для fallback — на случай пустого transcript в БД
      // (realtime voice transient messages, memory-off и т.д.).
      // Отдаём только user+assistant, без системных, обрезаем до 200 последних.
      const clientMessages = this.messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-200)
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: (m.content || '').slice(0, 8000),
        }));

      const payload = {
        therapySessionId: params.therapySessionId,
        clientSessionId: params.clientSessionId || undefined,
        trigger: params.trigger,
        // Метрики передаём плоско — так ждёт CreateSessionSummaryUserRequestDto.
        // Используются сервером как fallback когда transcript в БД пустой.
        userMessagesCount: this.userMessagesCount,
        qualifyingUserMessagesCount: this.qualifyingUserMessagesCount,
        durationSeconds: this.sessionDurationSeconds,
        sessionStartedAt: this.sessionStartedAt
          ? new Date(this.sessionStartedAt).toISOString()
          : undefined,
        // Сообщения из стора — fallback для LLM.
        clientMessages: clientMessages.length > 0 ? clientMessages : undefined,
      };

      try {
        if (params.trigger === 'app-hidden') {
          // Используем keepalive fetch — аналогично endTherapySession — чтобы
          // запрос гарантированно ушёл при закрытии/сворачивании.
          const config = useRuntimeConfig();
          const baseURL = (config.public as any).apiBase || '';
          const url = `${baseURL}/api/session-summaries-user`;
          const token =
            typeof window !== 'undefined'
              ? localStorage.getItem('mentai.session.token')
              : null;
          const headers: HeadersInit = {
            'Content-Type': 'application/json',
          };
          if (token) {
            headers['X-Session-Token'] = token;
          }
          const csrf = getCsrfTokenForHeader();
          if (csrf) {
            headers['X-CSRF-Token'] = csrf;
          }
          await fetch(url, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers,
            keepalive: true,
            credentials: 'include',
          });
        } else {
          const { $api } = useNuxtApp();
          await $api('/api/session-summaries-user', {
            method: 'POST',
            body: payload,
          });
        }
        return true;
      } catch (error) {
        console.error('[Chat Store] Failed to request session summary:', error);
        return false;
      }
    },
    /**
     * Начать therapy сессию для подсчета времени (биллинг)
     */
    async startTherapySession() {
      // Если сессия уже начата, не создаем новую
      if (this.therapySessionId) {
        return;
      }

      await this.flushPendingTherapySessionEnds();

      if (!this.sessionId) {
        this.startSession();
      }

      try {
        const { $api } = useNuxtApp();
        const response = await $api<{ sessionId: number; startedAt: string }>(
          '/api/therapy/session/start',
          {
            method: 'POST',
            body: {
              chatSessionId: this.sessionId || undefined,
            },
          }
        );

        if (response?.sessionId) {
          this.therapySessionId = response.sessionId;
          this.historyAnchorTherapySessionId = response.sessionId;
          this.lastActivityAt = new Date();
          this.lastPingAt = Date.now();
          this.resetIdleTimeout();
          this.lastStartSessionError = null;
          console.log(
            '[Chat Store] Therapy session started:',
            response.sessionId
          );
        }
      } catch (error) {
        console.error('[Chat Store] Failed to start therapy session:', error);
        this.lastStartSessionError =
          extractApiErrorMessage(error) ||
          'Не удалось начать сессию (возможно нет доступа к ИИ или исчерпан лимит минут).';
        // Не блокируем работу чата, если не удалось начать сессию
      }
    },
    /**
     * Завершить therapy сессию — остановить таймер биллинга.
     *
     * Использует keepalive-fetch, чтобы запрос гарантированно ушёл
     * даже при закрытии вкладки / сворачивании приложения.
     *
     * Retry-логика: до 3 попыток с нарастающей задержкой (1с, 2с).
     * Критично: если запрос не дойдёт — пользователь потеряет лимит.
     * Retry не работает при закрытии страницы (JS-контекст уничтожается),
     * но покрывает временные сбои сети при навигации внутри приложения.
     */
    async _postEndTherapySessionRequest(
      sessionIdToEnd: number,
      options?: { keepalive?: boolean }
    ): Promise<'success' | 'terminal' | 'retry'> {
      const config = useRuntimeConfig();
      const baseURL = (config.public as any).apiBase || '';
      const url = `${baseURL}/api/therapy/session/end`;

      const token =
        typeof window !== 'undefined'
          ? localStorage.getItem('mentai.session.token')
          : null;

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) headers['X-Session-Token'] = token;
      const csrf = getCsrfTokenForHeader();
      if (csrf) headers['X-CSRF-Token'] = csrf;

      try {
        const response = await fetch(url, {
          method: 'POST',
          body: JSON.stringify({ sessionId: sessionIdToEnd }),
          headers,
          keepalive: options?.keepalive === true,
          credentials: 'include',
        });

        if (response.ok) {
          return 'success';
        }

        if (isTerminalEndSessionStatus(response.status)) {
          console.warn(
            '[Chat Store] Therapy session end returned terminal status',
            {
              sessionId: sessionIdToEnd,
              status: response.status,
            }
          );
          return 'terminal';
        }

        console.warn(
          '[Chat Store] Therapy session end returned retryable status',
          {
            sessionId: sessionIdToEnd,
            status: response.status,
          }
        );
        return 'retry';
      } catch (error) {
        console.error('[Chat Store] Failed to post therapy session end:', {
          sessionId: sessionIdToEnd,
          error,
        });
        return 'retry';
      }
    },
    _clearPendingEndSessionRetryTimer() {
      if (this.pendingEndSessionRetryTimer) {
        clearTimeout(this.pendingEndSessionRetryTimer);
        this.pendingEndSessionRetryTimer = null;
      }
    },
    _schedulePendingEndSessionRetry() {
      if (process.server || this.pendingEndSessionRetryTimer) {
        return;
      }

      this.pendingEndSessionRetryTimer = setTimeout(() => {
        this.pendingEndSessionRetryTimer = null;
        void this.flushPendingTherapySessionEnds();
      }, PENDING_THERAPY_SESSION_END_RETRY_DELAY_MS);
    },
    async flushPendingTherapySessionEnds() {
      if (process.server || this.isEndingSession) {
        return;
      }

      const pending = await readPendingTherapySessionEnds();
      if (!pending.length) {
        this._clearPendingEndSessionRetryTimer();
        return;
      }

      const remaining: PendingTherapySessionEndRecord[] = [];

      for (const item of pending) {
        const result = await this._postEndTherapySessionRequest(item.sessionId);
        if (result === 'retry') {
          remaining.push(item);
        }
      }

      await writePendingTherapySessionEnds(remaining);

      if (remaining.length) {
        this._schedulePendingEndSessionRetry();
      } else {
        this._clearPendingEndSessionRetryTimer();
      }
    },
    async endTherapySession() {
      // Защита от множественных вызовов
      if (!this.therapySessionId || this.isEndingSession) {
        return;
      }

      this.isEndingSession = true;
      const sessionIdToEnd = this.therapySessionId;
      await enqueuePendingTherapySessionEnd(sessionIdToEnd);

      try {
        const result = await this._postEndTherapySessionRequest(
          sessionIdToEnd,
          {
            keepalive: true,
          }
        );

        if (result === 'success' || result === 'terminal') {
          await removePendingTherapySessionEnd(sessionIdToEnd);
          console.log('[Chat Store] Therapy session ended:', sessionIdToEnd);
        } else {
          this._schedulePendingEndSessionRetry();
        }
      } finally {
        // Даже если сеть сейчас отвалилась, клиент обязан локально снять
        // active-сессию, иначе UI останется в сломанном состоянии.
        // Серверный retry-путь хранится в persistent queue и будет добит позже.
        if (this.therapySessionId === sessionIdToEnd) {
          this.resetTherapySessionState(sessionIdToEnd);
        }
        this.isEndingSession = false;
      }
    },
    async handoffTextSessionToRealtimeVoice() {
      if (!this.therapySessionId || this.isEndingSession) {
        return true;
      }

      const sourceTherapySessionId = this.therapySessionId;

      try {
        const { $api } = useNuxtApp();
        const response = await $api('/api/session/handoff', {
          method: 'POST',
          body: {
            sourceMode: 'text',
            targetMode: 'realtime_voice',
            sourceTherapySessionId,
          },
        });

        ChatModeHandoffResponseDto.parse(response);
        this.resetTherapySessionState(sourceTherapySessionId);
        return true;
      } catch (error) {
        console.error(
          '[Chat Store] Failed to handoff text session to realtime voice:',
          error
        );
        return false;
      }
    },
    /**
     * Обновить время последней активности и сбросить idle timeout
     */
    updateActivity() {
      this.lastActivityAt = new Date();
      this.resetIdleTimeout();

      // Пингуем сервер, чтобы обновлять last_activity_at в БД.
      // Это нужно для корректного подсчёта минут на сервере и nightly-обработки idle-сессий.
      if (!this.therapySessionId) return;

      const now = Date.now();
      // Троттлинг: не чаще 1 раза в 10 секунд
      if (this.lastPingAt && now - this.lastPingAt < 10_000) return;
      this.lastPingAt = now;

      try {
        const { $api } = useNuxtApp();
        void $api('/api/therapy/session/ping', {
          method: 'POST',
          body: { sessionId: this.therapySessionId },
        });
      } catch {
        // Игнорируем: ping не должен ломать чат
      }
    },
    /**
     * Сбросить idle timeout таймер для чата
     */
    resetIdleTimeout() {
      this.clearIdleTimeout();

      this.idleTimeoutTimer = setTimeout(() => {
        console.log(
          '[Chat Store] Chat idle timeout reached, ending therapy session'
        );
        this.endTherapySession();
      }, useRuntimeConfig().public.chatIdleTimeoutMs);
    },
    /**
     * Очистить idle timeout таймер для чата
     */
    clearIdleTimeout() {
      if (this.idleTimeoutTimer) {
        clearTimeout(this.idleTimeoutTimer);
        this.idleTimeoutTimer = null;
      }
    },
    /**
     * Очищает сообщения и сбрасывает сессию
     * Используется для возврата к приветственному экрану
     */
    clearMessages() {
      this.messages = [];
      this.userText = '';
      this.suggestedChips = [];
      this.feedbackByMessageId = {};
      this.feedbackSubmittingByMessageId = {};
      this.historyAnchorTherapySessionId = null;
      this.stopChatStream();
      // Завершаем therapy сессию перед очисткой (асинхронно, не блокируем)
      if (this.therapySessionId && !this.isEndingSession) {
        void this.endTherapySession();
      }
      this.finishSession();
    },
    async restoreActiveSessionFromServer(): Promise<boolean> {
      if (this.messages.length > 0) {
        return true;
      }

      try {
        await this.flushPendingTherapySessionEnds();

        const { $api } = useNuxtApp();
        const rawResponse = await $api('/api/therapy/session/active', {
          method: 'GET',
        });
        const response =
          GetRestorableTherapySessionResponseDto.parse(rawResponse);
        const session = response.session;

        if (!session || session.messages.length === 0) {
          return false;
        }

        this.stopChatStream();
        this.messages = session.messages.map((message) =>
          this._createMessage(message.role, message.content, {
            therapySessionId: session.therapySessionId,
          })
        );
        this.userText = '';
        this.suggestedChips = [];
        this.feedbackByMessageId = {};
        this.feedbackSubmittingByMessageId = {};
        this.lastStartSessionError = null;
        this.entryContext = null;
        this.isGenerating = false;
        this.historyAnchorTherapySessionId = session.therapySessionId;

        if (session.isEnded) {
          // Сессия уже завершена (таймер остановлен). Загружаем сообщения
          // как контекст, но сбрасываем therapySessionId — первое новое
          // сообщение автоматически создаст новую сессию (sendMessage → startTherapySession).
          this.sessionId = nanoid(); // свежий client session id
          this.therapySessionId = null;
          this.sessionStartedAt = null;
          this.lastActivityAt = null;
          this.lastPingAt = null;
          this.clearIdleTimeout();
        } else {
          // Активная сессия — восстанавливаем полностью.
          this.sessionId = session.clientSessionId || nanoid();
          this.therapySessionId = session.therapySessionId;
          this.historyAnchorTherapySessionId = session.therapySessionId;
          this.sessionStartedAt = new Date(session.sessionStartedAt);
          this.lastActivityAt = session.lastActivityAt
            ? new Date(session.lastActivityAt)
            : new Date(session.sessionStartedAt);
          this.lastPingAt = null;
          this.resetIdleTimeout();
        }

        return true;
      } catch (error) {
        console.error('[Chat Store] Failed to restore active session:', error);
        return false;
      }
    },
    clearSuggestedChips() {
      this.suggestedChips = [];
    },
    setFeedbackState(
      messageId: string,
      state: ChatMessageFeedbackState | null
    ) {
      if (!state) {
        const next = { ...this.feedbackByMessageId };
        delete next[messageId];
        this.feedbackByMessageId = next;
        return;
      }

      this.feedbackByMessageId = {
        ...this.feedbackByMessageId,
        [messageId]: state,
      };
    },
    setFeedbackSubmitting(messageId: string, isSubmitting: boolean) {
      if (isSubmitting) {
        this.feedbackSubmittingByMessageId = {
          ...this.feedbackSubmittingByMessageId,
          [messageId]: true,
        };
        return;
      }

      const next = { ...this.feedbackSubmittingByMessageId };
      delete next[messageId];
      this.feedbackSubmittingByMessageId = next;
    },
    _createMessage(
      role: ChatStoreMessage['role'],
      content: string,
      options?: Partial<
        Omit<ChatStoreMessage, 'id' | 'role' | 'content' | 'therapySessionId'>
      > & {
        therapySessionId?: number | null;
      }
    ): ChatStoreMessage {
      return {
        id: nanoid(),
        role,
        content,
        therapySessionId:
          options?.therapySessionId ?? this.therapySessionId ?? null,
        transient: options?.transient === true,
        source: options?.source || 'chat',
        feedbackDisabled: options?.feedbackDisabled === true,
        realtimeTurnId:
          typeof options?.realtimeTurnId === 'string'
            ? options.realtimeTurnId
            : null,
      };
    },
    /**
     * Создаёт runtime-сообщение с точными метаданными.
     * Используется адаптерами realtime и другими потоковыми сценариями.
     */
    addRuntimeMessage(params: {
      role: ChatStoreMessage['role'];
      content?: string;
      therapySessionId?: number | null;
      transient?: boolean;
      source?: 'chat' | 'realtime';
      feedbackDisabled?: boolean;
      realtimeTurnId?: string | null;
      id?: string | null;
    }): string {
      const message = this._createMessage(params.role, params.content || '', {
        therapySessionId: params.therapySessionId,
        transient: params.transient,
        source: params.source,
        feedbackDisabled: params.feedbackDisabled,
        realtimeTurnId: params.realtimeTurnId,
      });

      if (typeof params.id === 'string' && params.id.trim().length > 0) {
        message.id = params.id.trim();
      }

      this.messages.push(message);

      // Первый user-инпут в realtime voice тоже стартует сессию (ТЗ п.7.4).
      // Без этого `sessionDurationSeconds` остаётся 0 и кнопка "Завершить" не
      // активируется. ВАЖНО: для realtime voice сообщения помечаются transient=true
      // (не попадают в API history), но это РЕАЛЬНЫЙ пользовательский контент —
      // он должен учитываться для eligibility.
      if (params.role === 'user') {
        if (!this.sessionStartedAt) {
          this.sessionStartedAt = new Date();
        }
        // Обновляем lastActivityAt, чтобы getter sessionDurationSeconds
        // корректно пересчитывался и триггерил реактивность UI.
        this.lastActivityAt = new Date();
      }

      return message.id;
    },
    findMessageIndexById(messageId: string): number {
      return this.messages.findIndex((message) => message.id === messageId);
    },
    appendMessageContent(messageId: string, delta: string) {
      if (!delta) return;
      const idx = this.findMessageIndexById(messageId);
      if (idx < 0) return;

      const message = this.messages[idx];
      if (!message) return;
      message.content += delta;
    },
    replaceMessageContent(messageId: string, content: string) {
      const idx = this.findMessageIndexById(messageId);
      if (idx < 0) return;

      const message = this.messages[idx];
      if (!message) return;
      message.content = content;
    },
    patchMessage(
      messageId: string,
      patch: Partial<
        Omit<ChatStoreMessage, 'id' | 'role' | 'content' | 'therapySessionId'>
      > & {
        content?: string;
        therapySessionId?: number | null;
      }
    ) {
      const idx = this.findMessageIndexById(messageId);
      if (idx < 0) return;

      const message = this.messages[idx];
      if (!message) return;

      if (typeof patch.content === 'string') {
        message.content = patch.content;
      }
      if (
        typeof patch.therapySessionId === 'number' ||
        patch.therapySessionId === null
      ) {
        message.therapySessionId = patch.therapySessionId;
      }
      if (typeof patch.transient === 'boolean') {
        message.transient = patch.transient;
      }
      if (patch.source === 'chat' || patch.source === 'realtime') {
        message.source = patch.source;
      }
      if (typeof patch.feedbackDisabled === 'boolean') {
        message.feedbackDisabled = patch.feedbackDisabled;
      }
      if (
        typeof patch.realtimeTurnId === 'string' ||
        patch.realtimeTurnId === null
      ) {
        message.realtimeTurnId = patch.realtimeTurnId;
      }
    },
    removeMessage(messageId: string) {
      const idx = this.findMessageIndexById(messageId);
      if (idx < 0) return;
      this.messages.splice(idx, 1);
    },
    /**
     * Подготавливает параметры для API запроса
     * Унифицированная логика для startConversation и sendMessage
     */
    _prepareApiParams(options?: { userPrompt?: string }) {
      return {
        userPrompt: options?.userPrompt,
        lang: 'ru' as const,
        entryContext: this.entryContext,
      };
    },
    /**
     * Нормализует сообщения в сторе: гарантирует наличие client-id.
     * Нужно для случаев HMR/legacy состояния без id.
     */
    ensureMessageIds() {
      this.messages = this.messages.map((message) => {
        const nextId =
          typeof message?.id === 'string' && message.id.trim().length > 0
            ? message.id
            : nanoid();
        const nextTherapySessionId =
          typeof message?.therapySessionId === 'number' &&
          Number.isInteger(message.therapySessionId) &&
          message.therapySessionId > 0
            ? message.therapySessionId
            : null;

        return {
          id: nextId,
          role: message.role,
          content: message.content,
          therapySessionId: nextTherapySessionId,
          transient: message.transient === true,
          source: message.source === 'realtime' ? 'realtime' : 'chat',
          feedbackDisabled: message.feedbackDisabled === true,
          realtimeTurnId:
            typeof message?.realtimeTurnId === 'string'
              ? message.realtimeTurnId
              : null,
        } satisfies ChatStoreMessage;
      });
    },
    /**
     * Преобразует сообщения стора в API-пейлоад без client-id.
     */
    _toApiMessages(messages?: ChatStoreMessage[]): ChatApiMessage[] {
      const sourceMessages = messages ?? this.messages;
      return sourceMessages
        .filter((message) => message.transient !== true)
        .map((message) => ({
          role: message.role,
          content: message.content,
        }));
    },
    /**
     * Останавливает текущий chat stream запрос
     */
    stopChatStream() {
      if (this.currentChatAbortController) {
        try {
          this.currentChatAbortController.abort();
        } catch (err) {
          console.error('[Chat Store] Error aborting chat stream:', err);
        }
        this.currentChatAbortController = null;
      }
    },
    /**
     * Обрабатывает stream ответ от API
     * Унифицированная логика для startConversation и sendMessage
     */
    async _processStreamResponse(resp: any, messageIdx: number): Promise<void> {
      const reader = (resp as any)?.getReader?.();
      const decoder = new TextDecoder();
      let buffer = '';

      if (!reader) {
        throw new Error('Stream reader not available');
      }

      // Флаг для отслеживания первого чанка
      let isFirstChunk = true;
      let hasReceivedData = false; // Флаг для отслеживания получения хоть каких-то данных

      try {
        while (!this.currentChatAbortController?.signal.aborted) {
          // Проверяем, не был ли запрос отменен
          if (this.currentChatAbortController?.signal.aborted) {
            try {
              reader.cancel();
            } catch (cancelErr) {
              console.warn(
                '[Chat Store] Failed to cancel stream reader:',
                cancelErr
              );
            }
            break;
          }

          const { done, value } = await reader.read();
          if (done) break;

          // Аккуратно буферизуем SSE, потому что события могут быть разрезаны по чанкам.
          buffer += decoder.decode(value, { stream: true });
          buffer = buffer.replace(/\r\n/g, '\n');

          for (;;) {
            const separatorIndex = buffer.indexOf('\n\n');
            if (separatorIndex === -1) break;

            const rawEvent = buffer.slice(0, separatorIndex).trim();
            buffer = buffer.slice(separatorIndex + 2);

            if (!rawEvent) continue;

            const dataLines = rawEvent
              .split('\n')
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.replace(/^data:\s?/, ''));

            if (!dataLines.length) continue;

            const jsonText = dataLines.join('\n');
            if (jsonText === '[DONE]') continue;

            try {
              const obj = JSON.parse(jsonText);
              const parsed = ChatStreamChunkDto.safeParse(obj);

              if (parsed.success) {
                const data = parsed.data;

                if (data.output_text_delta) {
                  hasReceivedData = true;
                  const msg = this.messages[messageIdx];
                  if (msg) msg.content += data.output_text_delta;
                  // Сбрасываем флаг генерации при получении первого чанка
                  if (isFirstChunk) {
                    this.isGenerating = false;
                    isFirstChunk = false;
                  }
                  // Обновляем активность при получении ответа
                  this.updateActivity();
                }

                if (data.chips) {
                  this.suggestedChips = data.chips;
                }

                if (data.error) {
                  throw new Error(data.error.message || 'Stream error');
                }

                continue;
              }

              const delta =
                obj?.output_text_delta ||
                obj?.delta ||
                obj?.response?.output_text ||
                '';

              if (delta) {
                hasReceivedData = true;
                const msg = this.messages[messageIdx];
                if (msg) msg.content += delta;
                // Сбрасываем флаг генерации при получении первого чанка
                if (isFirstChunk) {
                  this.isGenerating = false;
                  isFirstChunk = false;
                }
                // Обновляем активность при получении ответа
                this.updateActivity();
              }

              // Обработка ошибок
              if (obj?.error) {
                throw new Error(obj.error.message || 'Stream error');
              }
            } catch (parseErr) {
              console.warn(
                '[Chat Store] Failed to parse stream chunk:',
                parseErr
              );
              continue;
            }
          }
        }
        // Дочитываем хвост буфера после завершения стрима (на случай, если последний блок без \n\n).
        if (buffer.trim()) {
          const rawEvent = buffer.trim();
          const dataLines = rawEvent
            .split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.replace(/^data:\s?/, ''));
          if (dataLines.length) {
            const jsonText = dataLines.join('\n');
            if (jsonText !== '[DONE]') {
              try {
                const obj = JSON.parse(jsonText);
                const parsed = ChatStreamChunkDto.safeParse(obj);
                if (parsed.success) {
                  const data = parsed.data;
                  if (data.output_text_delta) {
                    hasReceivedData = true;
                    const msg = this.messages[messageIdx];
                    if (msg) msg.content += data.output_text_delta;
                    if (isFirstChunk) {
                      this.isGenerating = false;
                      isFirstChunk = false;
                    }
                    this.updateActivity();
                  }
                  if (data.chips) {
                    this.suggestedChips = data.chips;
                  }
                  if (data.error) {
                    throw new Error(data.error.message || 'Stream error');
                  }
                }
              } catch (parseErr) {
                console.warn(
                  '[Chat Store] Failed to parse final stream chunk:',
                  parseErr
                );
              }
            }
          }
        }
      } catch (error) {
        console.error('[Chat Store] Stream processing error:', error);
        // Сбрасываем флаг генерации при ошибке
        this.isGenerating = false;
        throw error; // Пробрасываем ошибку дальше для обработки в вызывающем коде
      } finally {
        // Если не получили никаких данных, сбрасываем флаг генерации
        if (!hasReceivedData) {
          this.isGenerating = false;
        }
      }
    },
    /**
     * Обрабатывает обычный (не-стрим) ответ от API
     */
    async _processNonStreamResponse(resp: any, messageIdx: number) {
      const parsed = ChatResponseDto.safeParse(resp);
      if (!parsed.success) {
        throw new Error('Invalid chat response');
      }

      const msg = this.messages[messageIdx];
      if (msg) {
        msg.content = parsed.data.message.content;
      }

      // Сбрасываем флаг генерации после получения полного ответа
      this.isGenerating = false;

      this.suggestedChips = parsed.data.chips || [];
      this.updateActivity();
    },
    /**
     * Начинает диалог от ассистента (без user-сообщения)
     * Используется при выборе режима на welcome-экране
     */
    async startConversation() {
      if (!this.sessionId) this.startSession();
      this.ensureMessageIds();

      const loaders = useLoadersStore();

      loaders.showLoader();

      this.userText = '';
      this.clearSuggestedChips();

      // Выставляем флаг ДО первого await, чтобы autoStartConversationIfNeeded
      // на странице чата не запустил дублирующий стрим пока мы ждём startTherapySession.
      // Без этого возникает race condition: void startConversation() + navigateTo('/chat')
      // → onMounted видит isGenerating=false и запускает второй стрим, который отменяет первый.
      this.isGenerating = true;

      // Начинаем therapy сессию для подсчета времени
      await this.startTherapySession();
      if (!this.therapySessionId) {
        this.isGenerating = false;
        this.messages.push(
          this._createMessage(
            'assistant',
            this.lastStartSessionError ||
              'Не удалось начать сессию (возможно нет доступа к ИИ или исчерпан лимит минут).'
          )
        );
        return { ok: false } as any;
      }

      // НЕ добавляем user-сообщение!
      // НЕ создаем пустое assistant-сообщение заранее - оно будет создано при получении первого чанка
      let idx = -1;

      try {
        // Отменяем предыдущий запрос, если он активен
        this.stopChatStream();

        // Создаем новый AbortController для этого запроса
        const abortController = new AbortController();
        this.currentChatAbortController = abortController;

        const nuxt = useNuxtApp();
        const apiParams = this._prepareApiParams();

        if (CHAT_STREAM_MODE) {
          // Вызываем API с ПУСТЫМ массивом messages - это триггер для старта от ассистента
          const resp = await nuxt.$api('/api/chat/stream', {
            method: 'POST',
            body: {
              provider: 'openai',
              messages: [], // ПУСТОЙ массив - старт от ассистента
              sessionId: this.sessionId,
              therapySessionId: this.therapySessionId,
              userPrompt: apiParams.userPrompt,
              lang: apiParams.lang,
              entryContext: apiParams.entryContext,
            },
            responseType: 'stream',
            signal: abortController.signal, // Передаем signal для отмены запроса
          } as any);

          // Создаем пустое assistant-сообщение только после успешного старта запроса
          idx = this.messages.push(this._createMessage('assistant', '')) - 1;

          await this._processStreamResponse(resp, idx);
        } else {
          const resp = await nuxt.$api('/api/chat', {
            method: 'POST',
            body: {
              provider: 'openai',
              messages: [], // ПУСТОЙ массив - старт от ассистента
              sessionId: this.sessionId,
              therapySessionId: this.therapySessionId,
              userPrompt: apiParams.userPrompt,
              lang: apiParams.lang,
              entryContext: apiParams.entryContext,
            },
            signal: abortController.signal,
          } as any);

          // Создаем пустое assistant-сообщение только после успешного старта запроса
          idx = this.messages.push(this._createMessage('assistant', '')) - 1;

          await this._processNonStreamResponse(resp, idx);
        }

        // Очищаем AbortController после успешного завершения
        if (this.currentChatAbortController === abortController) {
          this.currentChatAbortController = null;
        }

        return { ok: true } as any;
      } catch (e: any) {
        loaders.hideLoader();
        // Сохраняем ссылку на AbortController перед очисткой
        const wasAborted =
          this.currentChatAbortController?.signal?.aborted || false;

        // Очищаем AbortController при ошибке
        if (this.currentChatAbortController) {
          this.currentChatAbortController = null;
        }

        // Сбрасываем флаг генерации
        this.isGenerating = false;

        // Игнорируем ошибки отмены запроса (AbortError или другие признаки отмены)
        if (
          e?.name === 'AbortError' ||
          e?.message?.includes('aborted') ||
          e?.message?.includes('canceled') ||
          wasAborted
        ) {
          // Удаляем пустое сообщение если оно было создано
          if (idx >= 0 && this.messages[idx]?.content === '') {
            this.messages.splice(idx, 1);
          }
          return { ok: false } as any;
        }

        // В случае ошибки заменяем пустое сообщение на текст ошибки
        const apiMessage = extractApiErrorMessage(e);
        const errorMessage = apiMessage
          ? apiMessage
          : e?.message?.includes('quota')
            ? 'Превышен лимит запросов. Пожалуйста, попробуйте позже.'
            : e?.message?.includes('network') || e?.message?.includes('fetch')
              ? 'Ошибка сети. Проверьте подключение к интернету.'
              : 'Не удалось получить ответ. Попробуйте еще раз.';

        if (idx >= 0) {
          const errorMsg = this.messages[idx];
          if (errorMsg) {
            errorMsg.content = errorMessage;
          } else {
            this.messages.push(this._createMessage('assistant', errorMessage));
          }
        } else {
          this.messages.push(this._createMessage('assistant', errorMessage));
        }

        return { ok: false } as any;
      } finally {
        loaders.hideLoader();
        // Гарантированно сбрасываем флаг генерации
        this.isGenerating = false;
      }
    },
    async sendMessage(text: string) {
      if (!this.sessionId) this.startSession();
      this.ensureMessageIds();
      this.userText = '';
      this.clearSuggestedChips();
      const userMessage = this._createMessage('user', text);
      this.messages.push(userMessage);

      // Момент первого пользовательского сообщения = начало сессии (ТЗ п.7.4).
      // Не перезаписываем для последующих сообщений в той же сессии.
      if (!this.sessionStartedAt) {
        this.sessionStartedAt = new Date();
      }

      // Начинаем therapy сессию при отправке первого сообщения
      if (!this.therapySessionId) {
        await this.startTherapySession();
        if (!this.therapySessionId) {
          this.messages.push(
            this._createMessage(
              'assistant',
              this.lastStartSessionError ||
                'Не удалось начать сессию (возможно нет доступа к ИИ или исчерпан лимит минут).'
            )
          );
          return { ok: false } as any;
        }

        this.patchMessage(userMessage.id, {
          therapySessionId: this.therapySessionId,
        });
      } else {
        // Обновляем активность при отправке сообщения
        this.updateActivity();
      }

      // Устанавливаем флаг генерации
      this.isGenerating = true;

      // НЕ добавляем пустое ответное сообщение заранее - оно будет создано при получении первого чанка
      let idx = -1;

      try {
        // Отменяем предыдущий запрос, если он активен
        this.stopChatStream();

        // Создаем новый AbortController для этого запроса
        const abortController = new AbortController();
        this.currentChatAbortController = abortController;

        const nuxt = useNuxtApp();
        const apiParams = this._prepareApiParams();

        if (CHAT_STREAM_MODE) {
          // Вызываем API с полным массивом messages
          const resp = await nuxt.$api('/api/chat/stream', {
            method: 'POST',
            body: {
              provider: 'openai',
              messages: this._toApiMessages(),
              sessionId: this.sessionId,
              therapySessionId: this.therapySessionId,
              userPrompt: apiParams.userPrompt,
              lang: apiParams.lang,
              entryContext: apiParams.entryContext,
            },
            responseType: 'stream',
            signal: abortController.signal, // Передаем signal для отмены запроса
          } as any);

          const loaders = useLoadersStore();
          loaders.hideLoader();

          // Создаем пустое assistant-сообщение только после успешного старта запроса
          idx = this.messages.push(this._createMessage('assistant', '')) - 1;

          await this._processStreamResponse(resp, idx);
        } else {
          const resp = await nuxt.$api('/api/chat', {
            method: 'POST',
            body: {
              provider: 'openai',
              messages: this._toApiMessages(),
              sessionId: this.sessionId,
              therapySessionId: this.therapySessionId,
              userPrompt: apiParams.userPrompt,
              lang: apiParams.lang,
              entryContext: apiParams.entryContext,
            },
            signal: abortController.signal,
          } as any);

          const loaders = useLoadersStore();
          loaders.hideLoader();

          // Создаем пустое assistant-сообщение только после успешного старта запроса
          idx = this.messages.push(this._createMessage('assistant', '')) - 1;

          await this._processNonStreamResponse(resp, idx);
        }

        // Очищаем AbortController после успешного завершения
        if (this.currentChatAbortController === abortController) {
          this.currentChatAbortController = null;
        }

        return { ok: true } as any;
      } catch (e: any) {
        // Сохраняем ссылку на AbortController перед очисткой
        const wasAborted =
          this.currentChatAbortController?.signal?.aborted || false;

        // Очищаем AbortController при ошибке
        if (this.currentChatAbortController) {
          this.currentChatAbortController = null;
        }

        // Сбрасываем флаг генерации
        this.isGenerating = false;

        // Игнорируем ошибки отмены запроса (AbortError или другие признаки отмены)
        if (
          e?.name === 'AbortError' ||
          e?.message?.includes('aborted') ||
          e?.message?.includes('canceled') ||
          wasAborted
        ) {
          // Удаляем пустое сообщение если оно было создано
          if (idx >= 0 && this.messages[idx]?.content === '') {
            this.messages.splice(idx, 1);
          }
          return { ok: false } as any;
        }

        // В случае ошибки заполняем сообщение текстом ошибки
        const apiMessage = extractApiErrorMessage(e);
        const errorMessage = apiMessage
          ? apiMessage
          : e?.message?.includes('quota')
            ? 'Превышен лимит запросов. Пожалуйста, попробуйте позже.'
            : e?.message?.includes('network') || e?.message?.includes('fetch')
              ? 'Ошибка сети. Проверьте подключение к интернету.'
              : 'Не удалось получить ответ. Попробуйте еще раз.';

        if (idx >= 0 && this.messages[idx]) {
          const msg = this.messages[idx];
          if (msg) {
            msg.content = errorMessage;
          }
        } else {
          this.messages.push(this._createMessage('assistant', errorMessage));
        }

        return { ok: false } as any;
      }
    },
    async sendSuggestedChip(text: string) {
      const trimmed = text?.trim();
      if (!trimmed) return { ok: false } as any;

      // Чип — это готовое сообщение, поэтому отправляем сразу.
      return await this.sendMessage(trimmed);
    },
    async finishAndSave(model?: string) {
      void model;

      // Завершаем therapy сессию перед завершением чата
      if (this.therapySessionId) {
        await this.endTherapySession();
      }

      this.finishSession();
    },
  },
});
