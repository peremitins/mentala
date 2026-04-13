export const AI_CHAT_CONSENT_VERSION = '2026-04-13';
export const AI_CHAT_CONSENT_PROVIDER = 'OpenAI';

export const AI_CHAT_CONSENT_LOCALES = ['ru', 'en'] as const;

export type AiChatConsentLocale = (typeof AI_CHAT_CONSENT_LOCALES)[number];
