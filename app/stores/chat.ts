import { defineStore } from 'pinia';
import { useSpeechStore } from '@/app/stores/speech';

export const useChatStore = defineStore('chat', {
  state: () => ({
    messages: [] as Array<{ role: 'user' | 'assistant'; content: string }>,
    provider: 'openai' as 'openai' | 'deepseek' | 'yandex',
    sessionId: '' as string,
    draft: '' as string,
  }),
  actions: {
    startSession(sessionId?: string) {
      this.sessionId = sessionId || crypto.randomUUID();
    },
    finishSession() {
      this.sessionId = '';
    },
    setDraft(text: string) {
      this.draft = text;
    },
    async sendMessage(text: string) {
      if (!this.sessionId) this.startSession();
      this.messages.push({ role: 'user', content: text });
      try {
        const { $api } = useNuxtApp();
        const speech = useSpeechStore();
        const res = await $api<{
          message: { role: 'assistant' | 'user'; content: string };
          provider?: string;
          model?: string;
        }>('/api/chat', {
          method: 'POST',
          body: {
            provider: this.provider,
            messages: this.messages,
            sessionId: this.sessionId,
          },
        });
        const role =
          res?.message?.role === 'user'
            ? 'assistant'
            : res?.message?.role || 'assistant';
        const content = res?.message?.content || '';
        this.messages.push({ role, content });

        // Озвучим ответ через активную сессию HeyGen, если есть
        try {
          speech?.setAvatarSpeaking?.(true);
          const sessionId = (globalThis as any).lastHeygenSessionId as
            | string
            | undefined;
          if (sessionId && content) {
            await $api('heygen/speak', {
              method: 'POST',
              body: {
                sessionId,
                text: content,
                taskMode: 'sync',
                taskType: 'repeat',
              },
            });
          }
        } catch (_) {
          // без падения UI
        } finally {
          speech?.setAvatarSpeaking?.(false);
        }

        return res;
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
