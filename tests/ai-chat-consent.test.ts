import { describe, expect, it } from 'vitest';
import { AI_CHAT_CONSENT_VERSION } from '../shared/constants/ai-consent';
import {
  isAiChatConsentCurrent,
  normalizeAiChatConsentLocale,
} from '../shared/utils/ai-consent';

describe('ai chat consent helpers', () => {
  it('accepts only the current consent version', () => {
    expect(
      isAiChatConsentCurrent({
        accepted: true,
        version: AI_CHAT_CONSENT_VERSION,
      })
    ).toBe(true);

    expect(
      isAiChatConsentCurrent({
        accepted: true,
        version: '2026-01-01',
      })
    ).toBe(false);

    expect(
      isAiChatConsentCurrent({
        accepted: false,
        version: AI_CHAT_CONSENT_VERSION,
      })
    ).toBe(false);
  });

  it('normalizes locale to supported values', () => {
    expect(normalizeAiChatConsentLocale('en')).toBe('en');
    expect(normalizeAiChatConsentLocale('en-US')).toBe('en');
    expect(normalizeAiChatConsentLocale('EN')).toBe('en');
    expect(normalizeAiChatConsentLocale('ru-RU')).toBe('ru');
    expect(normalizeAiChatConsentLocale('')).toBe('ru');
  });
});
