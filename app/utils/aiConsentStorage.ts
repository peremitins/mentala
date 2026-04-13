import { Capacitor } from '@capacitor/core';
import {
  AI_CHAT_CONSENT_VERSION,
  type AiChatConsentLocale,
} from '@/shared/constants/ai-consent';

const AI_CHAT_CONSENT_STORAGE_KEY = 'mentala.ai-chat-consent';

export type CachedAiChatConsent = {
  accepted: boolean;
  acceptedAt: string | null;
  version: string | null;
  locale: AiChatConsentLocale | null;
};

async function getPreferencesApi() {
  if (!Capacitor.isNativePlatform()) {
    return null;
  }

  const { Preferences } = await import('@capacitor/preferences');
  return Preferences;
}

export async function readCachedAiChatConsent(): Promise<CachedAiChatConsent | null> {
  try {
    const preferences = await getPreferencesApi();
    const raw = preferences
      ? (await preferences.get({ key: AI_CHAT_CONSENT_STORAGE_KEY })).value
      : typeof localStorage !== 'undefined'
        ? localStorage.getItem(AI_CHAT_CONSENT_STORAGE_KEY)
        : null;

    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedAiChatConsent;
    return {
      accepted: parsed.accepted === true,
      acceptedAt:
        typeof parsed.acceptedAt === 'string' ? parsed.acceptedAt : null,
      version: typeof parsed.version === 'string' ? parsed.version : null,
      locale:
        parsed.locale === 'ru' || parsed.locale === 'en' ? parsed.locale : null,
    };
  } catch (error) {
    console.warn('[AI Consent] Failed to read cached consent:', error);
    return null;
  }
}

export async function writeCachedAiChatConsent(params: {
  accepted: boolean;
  acceptedAt?: string | null;
  locale?: AiChatConsentLocale | null;
}) {
  try {
    const payload: CachedAiChatConsent = {
      accepted: params.accepted,
      acceptedAt: params.acceptedAt ?? null,
      version: params.accepted ? AI_CHAT_CONSENT_VERSION : null,
      locale: params.accepted ? params.locale ?? null : null,
    };
    const value = JSON.stringify(payload);
    const preferences = await getPreferencesApi();

    if (preferences) {
      await preferences.set({
        key: AI_CHAT_CONSENT_STORAGE_KEY,
        value,
      });
      return;
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(AI_CHAT_CONSENT_STORAGE_KEY, value);
    }
  } catch (error) {
    console.warn('[AI Consent] Failed to write cached consent:', error);
  }
}
