import { defineStore } from 'pinia';

export const useChatStore = defineStore('chat', {
  state: () => ({
    messages: [] as Array<{ role: 'user' | 'assistant'; content: string }>,
    provider: 'openai' as 'openai' | 'deepseek' | 'yandex',
  }),
  actions: {
    async sendMessage(text: string) {
      this.messages.push({ role: 'user', content: text });
      try {
        const { $api } = useNuxtApp();
        const res = await $api<{
          message: { role: 'assistant' | 'user'; content: string };
          provider?: string;
          model?: string;
        }>('/api/chat', {
          method: 'POST',
          body: { provider: this.provider, messages: this.messages },
        });
        const role =
          res?.message?.role === 'user'
            ? 'assistant'
            : res?.message?.role || 'assistant';
        const content = res?.message?.content || '';
        this.messages.push({ role, content });
      } catch (e) {
        this.messages.push({ role: 'assistant', content: 'Ошибка ответа' });
      }
    },
  },
});
