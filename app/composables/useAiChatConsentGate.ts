import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/app/stores/auth';
import { useAPI } from '@/app/composables/useAPI';
import { useToast } from '@/app/composables/useToast';
import {
  AI_CHAT_CONSENT_PROVIDER,
  AI_CHAT_CONSENT_VERSION,
  type AiChatConsentLocale,
} from '@/shared/constants/ai-consent';
import {
  isAiChatConsentCurrent,
  normalizeAiChatConsentLocale,
} from '@/shared/utils/ai-consent';
import { writeCachedAiChatConsent } from '@/app/utils/aiConsentStorage';

let pendingConsentPromise: Promise<boolean> | null = null;
let resolvePendingConsent: ((value: boolean) => void) | null = null;

export function useAiChatConsentGate() {
  const auth = useAuthStore();
  const { locale } = useI18n();

  const modalOpen = useState<boolean>(
    'ai-chat-consent-modal-open',
    () => false
  );
  const isSubmitting = useState<boolean>(
    'ai-chat-consent-modal-submitting',
    () => false
  );

  const consentSnapshot = computed(() => ({
    accepted: auth.user?.aiConsentAccepted,
    version: auth.user?.aiConsentVersion,
    locale: auth.user?.aiConsentLocale,
    acceptedAt: auth.user?.aiConsentAcceptedAt,
  }));
  const needsConsent = computed(
    () => !isAiChatConsentCurrent(consentSnapshot.value)
  );
  const consentLocale = computed<AiChatConsentLocale>(() =>
    normalizeAiChatConsentLocale(auth.user?.locale || locale.value || 'ru')
  );
  const privacyPolicyUrl = computed(
    () => `/legal/privacy-policy-${consentLocale.value}.html`
  );

  function closeModal(result: boolean) {
    modalOpen.value = false;

    if (resolvePendingConsent) {
      resolvePendingConsent(result);
    }

    pendingConsentPromise = null;
    resolvePendingConsent = null;
  }

  async function ensureUserLoaded() {
    if (!auth.isLoggedIn || auth.user) {
      return;
    }

    try {
      await auth.me();
    } catch (error) {
      console.warn(
        '[AI Consent] Failed to load user before consent check:',
        error
      );
    }
  }

  async function requestAiConsent() {
    await ensureUserLoaded();

    if (!auth.isLoggedIn) {
      return false;
    }

    if (!needsConsent.value) {
      return true;
    }

    if (pendingConsentPromise) {
      return await pendingConsentPromise;
    }

    modalOpen.value = true;
    pendingConsentPromise = new Promise<boolean>((resolve) => {
      resolvePendingConsent = resolve;
    });

    return await pendingConsentPromise;
  }

  async function acceptAiConsent() {
    if (!auth.isLoggedIn || isSubmitting.value) {
      return;
    }

    isSubmitting.value = true;

    try {
      const response = await useAPI('/api/user/me', {
        method: 'PATCH',
        body: {
          aiConsent: {
            accepted: true,
            locale: consentLocale.value,
          },
        },
      });

      const acceptedAt =
        (response as any)?.user?.aiConsentAcceptedAt ||
        new Date().toISOString();

      if (auth.user) {
        auth.user.aiConsentAccepted = true;
        auth.user.aiConsentAcceptedAt = acceptedAt;
        auth.user.aiConsentVersion = AI_CHAT_CONSENT_VERSION;
        auth.user.aiConsentLocale = consentLocale.value;
      }

      // На iOS `Preferences.set()` может подвиснуть, хотя запись успевает примениться.
      // Поэтому кэш пишем в фоне — UI не должен ждать local storage.
      void writeCachedAiChatConsent({
        accepted: true,
        acceptedAt,
        locale: consentLocale.value,
      });
      closeModal(true);
    } catch (error) {
      console.error('[AI Consent] Failed to save consent:', error);
      useToast(
        'Не удалось сохранить согласие',
        'Попробуй ещё раз. Без согласия ИИ-чат останется закрыт.',
        'error'
      );
    } finally {
      isSubmitting.value = false;
    }
  }

  async function revokeAiConsent() {
    if (!auth.isLoggedIn || isSubmitting.value) {
      return false;
    }

    isSubmitting.value = true;

    try {
      await useAPI('/api/user/me', {
        method: 'PATCH',
        body: {
          aiConsent: {
            accepted: false,
          },
        },
      });

      if (auth.user) {
        auth.user.aiConsentAccepted = false;
      }

      // Аналогично accept: не блокируем UI на storage.
      void writeCachedAiChatConsent({
        accepted: false,
      });

      useToast(
        'Согласие отозвано',
        'При следующем входе в ИИ-чат мы снова покажем disclosure.',
        'success'
      );
      return true;
    } catch (error) {
      console.error('[AI Consent] Failed to revoke consent:', error);
      useToast('Ошибка', 'Не удалось отозвать согласие', 'error');
      return false;
    } finally {
      isSubmitting.value = false;
    }
  }

  function cancelAiConsentRequest() {
    void writeCachedAiChatConsent({
      accepted: false,
    });
    closeModal(false);
  }

  return {
    providerName: AI_CHAT_CONSENT_PROVIDER,
    consentVersion: AI_CHAT_CONSENT_VERSION,
    consentLocale,
    consentSnapshot,
    isSubmitting,
    modalOpen,
    needsConsent,
    privacyPolicyUrl,
    requestAiConsent,
    acceptAiConsent,
    revokeAiConsent,
    cancelAiConsentRequest,
  };
}
