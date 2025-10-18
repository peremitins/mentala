import { defineStore } from 'pinia';

export const useChatSettingsStore = defineStore('chatSettings', {
  state: () => ({
    theme: 'dark' as 'dark' | 'light' | 'gray',
    // Режим работы ассистента
    mode: 'therapy' as 'therapy' | 'habits' | 'balance',
    // Голос/озвучка ответа ассистента
    voice: false,
    // Визуальный аватар (видео)
    avatar: false,
  }),
  actions: {
    async getChatSettings() {
      const data = await $fetch('/api/settings/chat', {
        method: 'GET',
      });
      console.log('settings.value', data);
      this.$patch(data?.settings ?? null);
      return this.$state;
    },
    async updateChatSettings(payload: Record<string, any>) {
      const data = await $fetch('/api/settings/chat', {
        method: 'PATCH',
        body: payload,
      });
      this.$patch(data?.settings ?? null);
      return this.$state;
    },
  },
});
