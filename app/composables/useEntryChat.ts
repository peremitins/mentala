import { useChatStore } from '@/app/stores/chat';
import { useToast } from '@/app/composables/useToast';
import { navigateTo } from '#app';

export function useEntryChat() {
  const chat = useChatStore();

  async function startEntryChat() {
    try {
      chat.startConversation();
      navigateTo({
        path: '/',
        query: {
          screen: 'chat',
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
