import { defineStore } from 'pinia';
import { useLoadersStore } from '@/app/stores/loaders';

export const useChatSettingsStore = defineStore('chatSettings', {
  state: () => ({
    // Голос/озвучка ответа ассистента
    voice: true,
    // Визуальный аватар (видео)
    avatar: true,
    // Оптимизация контекста (previous_response_id)
    enablePreviousResponseId: true,
    // Долгосрочная память (Summary)
    enableSummary: true,
    isFirstSession: false,
  }),
  actions: {
    async getChatSettings() {
      try {
        const data = await useAPI('/api/settings/chat', {
          method: 'GET',
        });

        if (data?.settings) {
          this.$patch({
            ...data.settings,
          });
        }

        return this.$state;
      } catch (error) {
        console.error('Error getting chat settings:', error);
        throw error;
      }
    },
    async updateChatSettings(payload: Record<string, any>, withLoader = true) {
      const loaders = useLoadersStore();
      if (withLoader) {
        loaders.showLoader();
      }
      try {
        const data = await useAPI('/api/settings/chat', {
          method: 'PATCH',
          body: payload,
        });

        if (data?.settings) {
          this.$patch({
            ...data.settings,
          });
        }

        return this.$state;
      } catch (error) {
        console.error('Error updating chat settings:', error);
        throw error;
      } finally {
        if (withLoader) {
          loaders.hideLoader();
        }
      }
    },
  },
});
