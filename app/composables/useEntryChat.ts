import { useChatStore } from '@/app/stores/chat';
import { useToast } from '@/app/composables/useToast';
import { useEntitlements } from '@/app/composables/useEntitlements';
import { navigateTo } from '#app';
import { HABITS_CATALOG } from '@/app/lib/habitsCatalog';
import { THERAPY_TOPICS } from '@/app/lib/therapyCatalog';
import { useAiChatConsentGate } from '@/app/composables/useAiChatConsentGate';

const CATALOG_HABIT_KEYS = new Set(
  HABITS_CATALOG.map((habit) => habit.habitKey)
);
const CATALOG_THERAPY_KEYS = new Set(THERAPY_TOPICS.map((topic) => topic.key));

export function useEntryChat() {
  const chat = useChatStore();
  const { getFeatureAccess, refreshEntitlements } = useEntitlements();
  const { requestAiConsent } = useAiChatConsentGate();

  function resolveLockedFeatureByEntryContext(): string | null {
    const entryContext = chat.entryContext;
    if (!entryContext) return null;

    if (entryContext.type === 'habit') {
      // Для системных привычек premium-gate на custom не нужен.
      if (CATALOG_HABIT_KEYS.has(entryContext.habit_id)) return null;
      const customHabitAccess = getFeatureAccess('habits.custom.create');
      return customHabitAccess.available ? null : 'habits.custom.create';
    }

    if (entryContext.type === 'therapy_topic') {
      // Для системных тем терапии premium-gate на custom не нужен.
      if (CATALOG_THERAPY_KEYS.has(entryContext.topic_id)) return null;
      const customTherapyAccess = getFeatureAccess('therapy.custom.create');
      return customTherapyAccess.available ? null : 'therapy.custom.create';
    }

    return null;
  }

  async function startEntryChat() {
    try {
      // Перед переходом проверяем актуальные entitlement, чтобы не было обхода
      // при устаревшем snapshot (например, Trial только что закончился).
      await refreshEntitlements();
    } catch (error) {
      console.warn('[EntryChat] Failed to refresh entitlements:', error);
    }

    const lockedContextFeature = resolveLockedFeatureByEntryContext();
    if (lockedContextFeature) {
      await navigateTo({
        path: '/',
        query: {
          screen: 'welcome',
          lockedFeature: lockedContextFeature,
        },
      });
      return;
    }

    const chatAccess = getFeatureAccess('chat.assistant');
    if (!chatAccess.available) {
      // Перенаправляем на welcome и открываем paywall-модалку через query.
      await navigateTo({
        path: '/',
        query: {
          screen: 'welcome',
          lockedFeature: 'chat.assistant',
        },
      });
      return;
    }

    const consentGranted = await requestAiConsent();
    if (!consentGranted) {
      return;
    }

    try {
      void chat.startConversation();
      await navigateTo({
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
