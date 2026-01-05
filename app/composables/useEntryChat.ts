import { ref } from 'vue';
import { useChatStore } from '@/app/stores/chat';
import { useToast } from '@/app/composables/useToast';
import { navigateTo } from '#app';
import type { ChatMode } from '@/shared/dto';

export function useEntryChat() {
  const chat = useChatStore();

  async function startEntryChat(options: { mode: ChatMode }) {
    try {
      chat.clearMessages();
      chat.startConversation({
        mode: options.mode,
      });
      navigateTo({
        path: '/',
        query: {
          screen: 'chat',
          mode: options.mode,
        },
      });
    } catch (error: any) {
      console.error('[EntryChat] Failed to start entry conversation:', error);
      useToast('Не удалось открыть чат', error?.message);
      throw error;
    }
  }

  return {
    startEntryChat,
  };
}
