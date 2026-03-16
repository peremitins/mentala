import { describe, expect, it } from 'vitest';
import {
  OnboardingCompleteRequestDto,
  normalizeOnboardingReasons,
} from '../shared/dto/onboarding';

describe('Onboarding DTO', () => {
  it('валидирует welcome_setup с несколькими причинами обращения', () => {
    const parsed = OnboardingCompleteRequestDto.parse({
      flow: 'welcome_setup',
      data: {
        name: 'Mentai',
        reasons: ['anxiety', 'stress'],
        gender: 'female',
        ageRange: '30_45',
        tone: 'balanced',
      },
    });

    expect(parsed.data.reasons).toEqual(['anxiety', 'stress']);
  });

  it('сохраняет совместимость с legacy полем reason', () => {
    const parsed = OnboardingCompleteRequestDto.parse({
      flow: 'welcome_setup',
      data: {
        name: 'Mentai',
        reason: 'anxiety',
        gender: 'female',
        ageRange: '30_45',
        tone: 'balanced',
      },
    });

    expect(
      normalizeOnboardingReasons(parsed.data.reasons ?? parsed.data.reason)
    ).toEqual(['anxiety']);
  });

  it('не принимает завершение онбординга без reasons', () => {
    expect(() =>
      OnboardingCompleteRequestDto.parse({
        flow: 'welcome_setup',
        data: {
          name: 'Mentai',
          gender: 'male',
          ageRange: 'under_30',
          tone: 'gentle',
        },
      })
    ).toThrow();
  });
});
