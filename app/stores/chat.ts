import { defineStore } from 'pinia';
import { useChatSettingsStore } from '@/app/stores/chatSettings';
import { useLoadersStore } from '@/app/stores/loaders';
import { nanoid } from 'nanoid';
import { useRuntimeConfig } from 'nuxt/app';
import { getCsrfTokenForHeader } from '@/app/utils/csrf';
import type { ChatEntryContext } from '@/shared/dto';

export const useChatStore = defineStore('chat', {
  state: () => ({
    messages: [] as Array<{ role: 'user' | 'assistant'; content: string }>,
    userText: '' as string,
    provider: 'openai' as 'openai' | 'deepseek' | 'yandex',
    sessionId: '' as string,
    therapySessionId: null as number | null, // ID therapy сессии для биллинга
    currentChatAbortController: null as AbortController | null,
    lastActivityAt: null as Date | null, // Время последней активности для idle timeout
    lastPingAt: null as number | null, // Последний ping на сервер (throttle)
    idleTimeoutTimer: null as ReturnType<typeof setTimeout> | null, // Таймер для idle timeout чата
    isEndingSession: false as boolean, // Флаг для предотвращения множественных вызовов endTherapySession
    entryContext: null as ChatEntryContext | null,
  }),
  actions: {
    startSession(sessionId?: string) {
      this.sessionId = sessionId || nanoid();
    },
    finishSession() {
      this.sessionId = '';
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

      try {
        const { $api } = useNuxtApp();
        const response = await $api<{ sessionId: number; startedAt: string }>(
          '/api/therapy/session/start',
          {
            method: 'POST',
          }
        );

        if (response?.sessionId) {
          this.therapySessionId = response.sessionId;
          this.lastActivityAt = new Date();
          this.lastPingAt = Date.now();
          this.resetIdleTimeout();
          console.log(
            '[Chat Store] Therapy session started:',
            response.sessionId
          );
        }
      } catch (error) {
        console.error('[Chat Store] Failed to start therapy session:', error);
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
          this.therapySessionId = null;
          this.lastActivityAt = null;
          this.lastPingAt = null;
        }
        this.clearIdleTimeout();
        this.isEndingSession = false;
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
      this.stopChatStream();
      // Завершаем therapy сессию перед очисткой (асинхронно, не блокируем)
      if (this.therapySessionId && !this.isEndingSession) {
        void this.endTherapySession();
      }
      this.finishSession();
    },
    /**
     * Подготавливает параметры для API запроса
     * Унифицированная логика для startConversation и sendMessage
     */
    _prepareApiParams(options?: {
      mode?: 'therapy' | 'habits' | 'talk';
      userPrompt?: string;
    }) {
      const settings = useChatSettingsStore();

      // Определяем mode: из options или из settings
      const mode = options?.mode || settings.mode || 'therapy';

      // Определяем type для получения userPrompt (маппим talk на therapy)
      const type = mode === 'habits' || mode === 'therapy' ? mode : 'therapy';

      // Получаем userPrompt: из options или из settings
      const userPrompt =
        options?.userPrompt ||
        (type === 'habits' || type === 'therapy'
          ? settings.activePromptsByType?.[type]?.content || ''
          : '');

      return {
        mode,
        userPrompt,
        lang: 'ru' as const,
        entryContext: this.entryContext,
      };
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

      if (!reader) return;

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

        const chunk = decoder.decode(value, { stream: true });
        // SSE формата: "data: {json}\n\n"
        const lines = chunk.split(/\n\n/);

        for (const block of lines) {
          const line = block.trim();
          if (!line.startsWith('data:')) continue;

          const jsonText = line.replace(/^data:\s*/, '');
          if (jsonText === '[DONE]') continue;

          try {
            const obj = JSON.parse(jsonText);
            const delta =
              obj?.output_text_delta ||
              obj?.delta ||
              obj?.response?.output_text ||
              '';

            if (delta) {
              const msg = this.messages[messageIdx];
              if (msg) msg.content += delta;
              // Обновляем активность при получении ответа
              this.updateActivity();
            }

            // Обработка ошибок
            if (obj?.error) {
              throw new Error(obj.error.message || 'Stream error');
            }
          } catch {
            continue;
          }
        }
      }
    },
    /**
     * Начинает диалог от ассистента (без user-сообщения)
     * Используется при выборе режима на welcome-экране
     */
    async startConversation(options: {
      mode: 'therapy' | 'habits' | 'talk';
      userPrompt?: string;
    }) {
      if (!this.sessionId) this.startSession();

      const loaders = useLoadersStore();

      loaders.showLoader();

      this.userText = '';

      // Начинаем therapy сессию для подсчета времени
      await this.startTherapySession();
      if (!this.therapySessionId) {
        this.messages.push({
          role: 'assistant',
          content:
            'Не удалось начать сессию (возможно нет доступа к ИИ или исчерпан лимит минут).',
        });
        return { ok: false } as any;
      }

      // НЕ добавляем user-сообщение!
      // Создаем пустое assistant-сообщение для стриминга ответа
      const idx = this.messages.push({ role: 'assistant', content: '' }) - 1;

      try {
        // Отменяем предыдущий stream запрос, если он активен
        this.stopChatStream();

        // Создаем новый AbortController для этого запроса
        const abortController = new AbortController();
        this.currentChatAbortController = abortController;

        const nuxt = useNuxtApp();
        const apiParams = this._prepareApiParams(options);

        // Вызываем API с ПУСТЫМ массивом messages - это триггер для старта от ассистента
        const resp = await nuxt.$api('/api/chat/stream', {
          method: 'POST',
          body: {
            provider: 'openai',
            messages: [], // ПУСТОЙ массив - старт от ассистента
            sessionId: this.sessionId,
            therapySessionId: this.therapySessionId,
            mode: apiParams.mode, // Передаем mode (включая 'talk')
            userPrompt: apiParams.userPrompt,
            lang: apiParams.lang,
            entryContext: apiParams.entryContext,
          },
          responseType: 'stream',
          signal: abortController.signal, // Передаем signal для отмены запроса
        } as any);

        await this._processStreamResponse(resp, idx);

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

        // Игнорируем ошибки отмены запроса (AbortError или другие признаки отмены)
        if (
          e?.name === 'AbortError' ||
          e?.message?.includes('aborted') ||
          e?.message?.includes('canceled') ||
          wasAborted
        ) {
          // Удаляем пустое сообщение если оно было создано
          if (this.messages[idx]?.content === '') {
            this.messages.splice(idx, 1);
          }
          return { ok: false } as any;
        }

        // В случае ошибки заменяем пустое сообщение на ошибку
        const errorMsg = this.messages[idx];
        if (errorMsg) {
          errorMsg.content = 'Ошибка начала диалога. Попробуйте еще раз.';
        } else {
          this.messages.push({
            role: 'assistant',
            content: 'Ошибка начала диалога. Попробуйте еще раз.',
          });
        }
      } finally {
        loaders.hideLoader();
      }
    },
    async sendMessage(text: string) {
      if (!this.sessionId) this.startSession();
      this.userText = '';
      this.messages.push({ role: 'user', content: text });

      // Начинаем therapy сессию при отправке первого сообщения
      if (!this.therapySessionId) {
        await this.startTherapySession();
        if (!this.therapySessionId) {
          this.messages.push({
            role: 'assistant',
            content:
              'Не удалось начать сессию (возможно нет доступа к ИИ или исчерпан лимит минут).',
          });
          return { ok: false } as any;
        }
      } else {
        // Обновляем активность при отправке сообщения
        this.updateActivity();
      }

      // Добавляем пустое ответное сообщение, будем наполнять построчно
      const idx = this.messages.push({ role: 'assistant', content: '' }) - 1;

      try {
        // Отменяем предыдущий stream запрос, если он активен
        this.stopChatStream();

        // Создаем новый AbortController для этого запроса
        const abortController = new AbortController();
        this.currentChatAbortController = abortController;

        const nuxt = useNuxtApp();
        const apiParams = this._prepareApiParams();

        // Вызываем API с полным массивом messages
        const resp = await nuxt.$api('/api/chat/stream', {
          method: 'POST',
          body: {
            provider: 'openai',
            messages: this.messages,
            sessionId: this.sessionId,
            therapySessionId: this.therapySessionId,
            mode: apiParams.mode, // ВАЖНО: передаем mode для правильной работы памяти
            userPrompt: apiParams.userPrompt,
            lang: apiParams.lang,
          },
          responseType: 'stream',
          signal: abortController.signal, // Передаем signal для отмены запроса
        } as any);

        const loaders = useLoadersStore();
        loaders.hideLoader();

        await this._processStreamResponse(resp, idx);

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

        // Игнорируем ошибки отмены запроса (AbortError или другие признаки отмены)
        if (
          e?.name === 'AbortError' ||
          e?.message?.includes('aborted') ||
          e?.message?.includes('canceled') ||
          wasAborted
        ) {
          // Удаляем пустое сообщение если оно было создано
          if (this.messages[idx]?.content === '') {
            this.messages.splice(idx, 1);
          }
          return { ok: false } as any;
        }

        this.messages.push({ role: 'assistant', content: 'Ошибка ответа' });
        throw e;
      }
    },
    async finishAndSave(model?: string) {
      const { $api } = useNuxtApp();
      if (!this.sessionId) return;

      try {
        await $api('/api/session/finish', {
          method: 'POST',
          body: { sessionId: this.sessionId, messages: this.messages, model },
        });
      } catch (error) {
        console.error(
          '[Chat Store] finishAndSave: failed to save session:',
          error
        );
      }

      // Завершаем therapy сессию перед завершением чата
      if (this.therapySessionId) {
        await this.endTherapySession();
      }

      this.finishSession();
    },
  },
});
