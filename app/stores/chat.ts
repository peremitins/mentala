import { defineStore } from 'pinia';
import { useSpeechStore } from '@/app/stores/speech';
import { useChatSettingsStore } from '@/app/stores/chatSettings';
import { usePromptsStore } from '@/app/stores/prompts';
import { nanoid } from 'nanoid';

export const useChatStore = defineStore('chat', {
  state: () => ({
    messages: [] as Array<{ role: 'user' | 'assistant'; content: string }>,
    userText: '' as string,
    provider: 'openai' as 'openai' | 'deepseek' | 'yandex',
    sessionId: '' as string,
    currentChatAbortController: null as AbortController | null,
  }),
  actions: {
    startSession(sessionId?: string) {
      this.sessionId = sessionId || nanoid();
    },
    finishSession() {
      this.sessionId = '';
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

      while (true) {
        // Проверяем, не был ли запрос отменен
        if (this.currentChatAbortController?.signal.aborted) {
          try {
            reader.cancel();
          } catch {}
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
            }

            // Обработка ошибок
            if (obj?.error) {
              throw new Error(obj.error.message || 'Stream error');
            }
          } catch (parseErr) {
            // Игнорируем ошибки парсинга отдельных чанков
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
      this.userText = '';

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
            mode: apiParams.mode, // Передаем mode (включая 'talk')
            userPrompt: apiParams.userPrompt,
            lang: apiParams.lang,
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
        // Очищаем AbortController при ошибке
        if (this.currentChatAbortController) {
          this.currentChatAbortController = null;
        }

        // Игнорируем ошибки отмены запроса (AbortError)
        if (e?.name === 'AbortError') {
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
        throw e;
      }
    },
    async sendMessage(text: string) {
      if (!this.sessionId) this.startSession();
      this.userText = '';
      this.messages.push({ role: 'user', content: text });

      try {
        // Отменяем предыдущий stream запрос, если он активен
        this.stopChatStream();

        // Создаем новый AbortController для этого запроса
        const abortController = new AbortController();
        this.currentChatAbortController = abortController;

        const nuxt = useNuxtApp();
        const apiParams = this._prepareApiParams();

        // Добавляем пустое ответное сообщение, будем наполнять построчно
        const idx = this.messages.push({ role: 'assistant', content: '' }) - 1;

        // Вызываем API с полным массивом messages
        const resp = await nuxt.$api('/api/chat/stream', {
          method: 'POST',
          body: {
            provider: 'openai',
            messages: this.messages,
            sessionId: this.sessionId,
            mode: apiParams.mode, // ВАЖНО: передаем mode для правильной работы памяти
            userPrompt: apiParams.userPrompt,
            lang: apiParams.lang,
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
        // Очищаем AbortController при ошибке
        if (this.currentChatAbortController) {
          this.currentChatAbortController = null;
        }

        // Игнорируем ошибки отмены запроса (AbortError)
        if (e?.name === 'AbortError') {
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
        const response = await $api('/api/session/finish', {
          method: 'POST',
          body: { sessionId: this.sessionId, messages: this.messages, model },
        });
      } catch (error) {
        console.error(
          '[Chat Store] finishAndSave: failed to save session:',
          error
        );
      }
      this.finishSession();
    },
  },
});
