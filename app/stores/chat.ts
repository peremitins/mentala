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
  }),
  actions: {
    startSession(sessionId?: string) {
      this.sessionId = sessionId || nanoid();
    },
    finishSession() {
      this.sessionId = '';
    },
    async sendMessage(text: string) {
      if (!this.sessionId) this.startSession();
      this.userText = '';
      this.messages.push({ role: 'user', content: text });
      try {
        const nuxt = useNuxtApp();
        const settings = useChatSettingsStore();
        const type =
          settings.mode === 'habits' || settings.mode === 'therapy'
            ? settings.mode
            : 'therapy';
        const userPrompt = settings.activePromptsByType[type]?.content || '';
        // добавляем пустое ответное сообщение, будем наполнять построчно
        const idx = this.messages.push({ role: 'assistant', content: '' }) - 1;

        // ТОЛЬКО текстовый стрим (без озвучки чанками)
        const resp = await nuxt.$api('/api/chat/stream', {
          method: 'POST',
          body: {
            provider: 'openai',
            messages: this.messages,
            sessionId: this.sessionId,
            userPrompt,
            lang: 'ru',
          },
          responseType: 'stream',
        } as any);

        // resp — ReadableStream (через ofetch). Читаем построчно как SSE
        const reader = (resp as any).getReader?.();
        const decoder = new TextDecoder();
        if (reader) {
          while (true) {
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
                  const msg = this.messages[idx];
                  if (msg) msg.content += delta;
                }
                // никаких аудио чанков
              } catch {}
            }
          }
        }

        return { ok: true } as any;
      } catch (e) {
        this.messages.push({ role: 'assistant', content: 'Ошибка ответа' });
      }
    },
    async finishAndSave(model?: string) {
      const { $api } = useNuxtApp();
      if (!this.sessionId) return;
      try {
        await $api('session/finish', {
          method: 'POST',
          body: { sessionId: this.sessionId, messages: this.messages, model },
        });
      } catch {}
      this.finishSession();
    },
  },
});
