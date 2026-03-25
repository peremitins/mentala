import { defineStore } from 'pinia';
import { useLoadersStore } from '@/app/stores/loaders';
import { DEFAULT_ASSISTANT_VOICE_ID } from '@/shared/constants/assistantVoiceCatalog';
import {
  ChatSettingsPatchDto,
  ChatSettingsResponseDto,
  type ChatSettingsStateDto,
} from '@/shared/dto';

export const useChatSettingsStore = defineStore('chatSettings', {
  state: () => ({
    // Голос/озвучка ответа ассистента
    voice: false,
    // Выбранный голос ассистента для TTS и Realtime.
    assistantVoice: DEFAULT_ASSISTANT_VOICE_ID,
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
        const parsed = ChatSettingsResponseDto.parse(data);

        if (parsed.settings) {
          this.$patch({
            ...parsed.settings,
          });
        }

        return this.$state;
      } catch (error) {
        console.error('Error getting chat settings:', error);
        throw error;
      }
    },
    async updateChatSettings(
      payload: Partial<ChatSettingsStateDto>,
      withLoader = true
    ) {
      const loaders = useLoadersStore();
      if (withLoader) {
        loaders.showLoader();
      }
      try {
        const parsedPayload = ChatSettingsPatchDto.parse(payload);
        const data = await useAPI('/api/settings/chat', {
          method: 'PATCH',
          body: parsedPayload,
        });
        const parsed = ChatSettingsResponseDto.parse(data);

        if (parsed.settings) {
          this.$patch({
            ...parsed.settings,
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
