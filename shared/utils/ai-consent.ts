import {
  AI_CHAT_CONSENT_LOCALES,
  AI_CHAT_CONSENT_VERSION,
  type AiChatConsentLocale,
} from '../constants/ai-consent';

export type AiChatConsentSnapshot = {
  accepted?: boolean | null;
  version?: string | null;
  locale?: string | null;
  acceptedAt?: string | null;
};

export function normalizeAiChatConsentLocale(
  value?: string | null
): AiChatConsentLocale {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (normalized === 'en' || normalized.startsWith('en-')) {
    return 'en';
  }

  if (normalized === 'ru' || normalized.startsWith('ru-')) {
    return 'ru';
  }

  return AI_CHAT_CONSENT_LOCALES.includes(normalized as AiChatConsentLocale)
    ? (normalized as AiChatConsentLocale)
    : 'ru';
}

export function isAiChatConsentCurrent(
  snapshot?: AiChatConsentSnapshot | null
): boolean {
  return (
    snapshot?.accepted === true &&
    String(snapshot?.version || '') === AI_CHAT_CONSENT_VERSION
  );
}
