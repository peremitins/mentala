import { defineStore } from 'pinia';

export const useChatSettingsStore = defineStore('chatSettings', {
  state: () => ({
    theme: 'dark' as 'dark' | 'light' | 'gray',
    // Режим работы ассистента
    mode: 'therapy' as 'therapy' | 'habits',
    // Голос/озвучка ответа ассистента
    voice: true,
    // Визуальный аватар (видео)
    avatar: true,
    isFirstSession: false,
    // Активные промпты по типам
    activePromptsByType: {
      habits: null,
      therapy: null,
    } as Record<'habits' | 'therapy', any>,
  }),
  actions: {
    async getChatSettings() {
      try {
        const data = await useAPI('/api/settings/chat', {
          method: 'GET',
        });

        this.$patch(data.settings);

        return this.$state;
      } catch (error) {
        console.error('Error getting chat settings:', error);
        throw error;
      }
    },
    async updateChatSettings(payload: Record<string, any>) {
      try {
        const data = await useAPI('/api/settings/chat', {
          method: 'PATCH',
          body: payload,
        });

        this.$patch(data.settings);

        return this.$state;
      } catch (error) {
        console.error('Error updating chat settings:', error);
        throw error;
      }
    },
  },
});
