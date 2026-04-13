import { createError, getHeader } from 'h3';
import { AI_CHAT_CONSENT_VERSION } from '@/shared/constants/ai-consent';
import {
  normalizeAiChatConsentLocale,
  type AiChatConsentSnapshot,
} from '@/shared/utils/ai-consent';

type MobilePlatform = 'ios' | 'android';

function parseNonNegativeInt(rawValue: string | undefined): number | null {
  if (!rawValue) return null;
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

function readConsentMinBuild(platform: MobilePlatform): number | null {
  const key =
    platform === 'ios'
      ? 'AI_CONSENT_ENFORCE_IOS_MIN_BUILD'
      : 'AI_CONSENT_ENFORCE_ANDROID_MIN_BUILD';

  return parseNonNegativeInt(process.env[key]);
}

function resolveClientPlatform(
  event: any
): 'web' | 'ios' | 'android' | 'unknown' {
  const rawPlatform = String(getHeader(event, 'x-platform') || '')
    .trim()
    .toLowerCase();
  if (rawPlatform === 'ios') return 'ios';
  if (rawPlatform === 'android') return 'android';
  if (rawPlatform === 'web') return 'web';
  return 'unknown';
}

function resolveClientBuild(event: any): number | null {
  const rawBuild = String(getHeader(event, 'x-app-build') || '').trim();
  return parseNonNegativeInt(rawBuild || undefined);
}

export function detectAiConsentSource(event: any): 'web' | 'ios' | 'android' {
  const userAgent = getHeader(event, 'user-agent') || '';
  if (/Android/i.test(userAgent)) return 'android';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  return 'web';
}

export function resolveAiConsentLocale(params: {
  requestedLocale?: string | null;
  userLocale?: string | null;
}): 'ru' | 'en' {
  return normalizeAiChatConsentLocale(
    params.requestedLocale || params.userLocale || 'ru'
  );
}

export function hasCurrentAiChatConsent(
  snapshot?: AiChatConsentSnapshot | null
): boolean {
  return (
    snapshot?.accepted === true &&
    String(snapshot?.version || '') === AI_CHAT_CONSENT_VERSION
  );
}

export function shouldEnforceAiChatConsent(event: any): boolean {
  const platform = resolveClientPlatform(event);
  if (platform !== 'ios' && platform !== 'android') {
    return true;
  }

  const minBuild = readConsentMinBuild(platform);
  if (minBuild === null) {
    // Если порог не задан, работаем в безопасном режиме rollout:
    // не блокируем старые mobile build до явной настройки порога.
    return false;
  }

  const clientBuild = resolveClientBuild(event);
  if (clientBuild === null) {
    // Старые клиенты без заголовка X-App-Build не блокируем.
    return false;
  }

  return clientBuild >= minBuild;
}

export function assertAiChatConsent(params: {
  event: any;
  snapshot?: AiChatConsentSnapshot | null;
}) {
  if (!shouldEnforceAiChatConsent(params.event)) {
    return;
  }

  const snapshot = params.snapshot;
  if (hasCurrentAiChatConsent(snapshot)) {
    return;
  }

  throw createError({
    statusCode: 412,
    statusMessage: 'AI consent required',
    data: {
      code: 'ai_consent_required',
      consentVersion: AI_CHAT_CONSENT_VERSION,
    },
  });
}
