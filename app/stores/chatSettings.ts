import { defineStore } from 'pinia';

export const useChatSettingsStore = defineStore('chatSettings', {
  state: () => ({
    theme: 'dark' as 'dark' | 'light',
    // Режим работы ассистента
    mode: 'therapy' as 'therapy' | 'habits' | 'talk',
    // Голос/озвучка ответа ассистента
    voice: true,
    // Визуальный аватар (видео)
    avatar: true,
    // Оптимизация контекста (previous_response_id)
    enablePreviousResponseId: true,
    // Долгосрочная память (Summary)
    enableSummary: true,
    isFirstSession: false,
    // Активные промпты по типам
    // Примечание: 'talk' не хранится отдельно, мапится на 'therapy'
    activePromptsByType: {
      habits: null,
      therapy: null,
    } as Record<'habits' | 'therapy', any | null>,
  }),
  actions: {
    async getChatSettings() {
      try {
        const data = await useAPI('/api/settings/chat', {
          method: 'GET',
        });

        // Безопасно применяем патч, сохраняя структуру activePromptsByType
        if (data?.settings) {
          this.$patch({
            ...data.settings,
            // Убеждаемся, что activePromptsByType всегда имеет правильную структуру
            activePromptsByType: {
              habits: data.settings.activePromptsByType?.habits || null,
              therapy: data.settings.activePromptsByType?.therapy || null,
            },
          });
        }

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

        // Безопасно применяем патч, сохраняя структуру activePromptsByType
        if (data?.settings) {
          this.$patch({
            ...data.settings,
            // Убеждаемся, что activePromptsByType всегда имеет правильную структуру
            activePromptsByType: {
              habits:
                data.settings.activePromptsByType?.habits ||
                this.activePromptsByType?.habits ||
                null,
              therapy:
                data.settings.activePromptsByType?.therapy ||
                this.activePromptsByType?.therapy ||
                null,
            },
          });
        }

        return this.$state;
      } catch (error) {
        console.error('Error updating chat settings:', error);
        throw error;
      }
    },
  },
});
