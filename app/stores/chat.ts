import { defineStore } from 'pinia';
import { useLoadersStore } from '@/app/stores/loaders';
import { nanoid } from 'nanoid';
import { useRuntimeConfig } from 'nuxt/app';
import { getCsrfTokenForHeader } from '@/app/utils/csrf';
import {
  ChatModeHandoffResponseDto,
  ChatResponseDto,
  ChatStreamChunkDto,
  type ChatEntryContext,
  type ChatFeedbackTopicCode,
  type SuggestedChip,
} from '@/shared/dto';
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
    lastActivityAt: null as Date | null, // Время последней активности для idle timeout
    lastPingAt: null as number | null, // Последний ping на сервер (throttle)
    idleTimeoutTimer: null as ReturnType<typeof setTimeout> | null, // Таймер для idle timeout чата
    isEndingSession: false as boolean, // Флаг для предотвращения множественных вызовов endTherapySession
    entryContext: null as ChatEntryContext | null,
    isGenerating: false as boolean, // Флаг для отображения индикатора загрузки при генерации ответа
    lastStartSessionError: null as string | null,
  }),
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
    },
    finishSession() {
      this.sessionId = '';
      this.suggestedChips = [];
      // Завершаем therapy сессию при завершении чата (асинхронно, не блокируем)
      if (this.therapySessionId && !this.isEndingSession) {
        void this.endTherapySession();
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
     * Завершить therapy сессию
     */
    async endTherapySession() {
      // Защита от множественных вызовов
      if (!this.therapySessionId || this.isEndingSession) {
        return;
      }

      this.isEndingSession = true;
      const sessionIdToEnd = this.therapySessionId;

      try {
        // Используем fetch с keepalive для надежной отправки при обновлении страницы
        // Это гарантирует, что запрос будет отправлен даже если страница закрывается
        const config = useRuntimeConfig();
        const baseURL = (config.public as any).apiBase || '';
        const url = `${baseURL}/api/therapy/session/end`;

        // Получаем токен для авторизации
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

        // Добавляем CSRF токен для web (cookie-канал)
        const csrf = getCsrfTokenForHeader();
        if (csrf) {
          headers['X-CSRF-Token'] = csrf;
        }

        // Используем fetch с keepalive для надежной отправки
        await fetch(url, {
          method: 'POST',
          body: JSON.stringify({ sessionId: sessionIdToEnd }),
          headers,
          keepalive: true, // Важно для запросов при закрытии страницы
          credentials: 'include', // Включаем cookies
        });

        console.log('[Chat Store] Therapy session ended:', sessionIdToEnd);
      } catch (error) {
        console.error('[Chat Store] Failed to end therapy session:', error);
        // Не блокируем очистку состояния даже при ошибке
      } finally {
        // Очищаем только если это та же сессия
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
      // Это нужно для корректного подсчёта минут на сервере и автозавершения "stale" сессий.
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
      this.stopChatStream();
      // Завершаем therapy сессию перед очисткой (асинхронно, не блокируем)
      if (this.therapySessionId && !this.isEndingSession) {
        void this.endTherapySession();
      }
      this.finishSession();
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
      const activeTherapySessionId = this.therapySessionId;
      const scopedMessages =
        typeof activeTherapySessionId === 'number'
          ? sourceMessages.filter(
              (message) => message.therapySessionId === activeTherapySessionId
            )
          : sourceMessages;

      return scopedMessages
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

      // Начинаем therapy сессию для подсчета времени
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

      // Устанавливаем флаг генерации
      this.isGenerating = true;

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
