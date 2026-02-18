import { describe, expect, it } from 'vitest';
import {
  resolveSlotsRegenerationReasonFromAiReason,
  shouldRegenerateSlotsAfterAiGeneration,
} from '../server/application/notifications/ai-slot-regeneration-reason.utils';

describe('AI slot regeneration reasons', () => {
  it('регенерирует слоты только для пользовательских причин', () => {
    expect(shouldRegenerateSlotsAfterAiGeneration('prefs_create')).toBe(true);
    expect(shouldRegenerateSlotsAfterAiGeneration('prefs_update')).toBe(true);
    expect(
      shouldRegenerateSlotsAfterAiGeneration('settings_preferences_update')
    ).toBe(true);
    expect(shouldRegenerateSlotsAfterAiGeneration('onboarding_complete')).toBe(
      true
    );

    expect(shouldRegenerateSlotsAfterAiGeneration('missing_ai_texts')).toBe(
      false
    );
    expect(
      shouldRegenerateSlotsAfterAiGeneration('retry_after_provider_error')
    ).toBe(false);
    expect(shouldRegenerateSlotsAfterAiGeneration(undefined)).toBe(false);
    expect(shouldRegenerateSlotsAfterAiGeneration('unknown_reason')).toBe(
      false
    );
  });

  it('мапит причины AI-джобы в допустимые причины оркестрации', () => {
    expect(resolveSlotsRegenerationReasonFromAiReason('manual')).toBe('manual');
    expect(resolveSlotsRegenerationReasonFromAiReason('login')).toBe('login');
    expect(resolveSlotsRegenerationReasonFromAiReason('timezone_changed')).toBe(
      'timezone_changed'
    );
    expect(resolveSlotsRegenerationReasonFromAiReason('prefs_update')).toBe(
      'prefs_changed'
    );
    expect(resolveSlotsRegenerationReasonFromAiReason('unknown_reason')).toBe(
      'prefs_changed'
    );
  });
});
