import { describe, expect, it } from 'vitest';
import {
  mapOnboardingTopicsToLegacyReasons,
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

  it('валидирует welcome_setup с выбранными темами без legacy reasons', () => {
    const parsed = OnboardingCompleteRequestDto.parse({
      flow: 'welcome_setup',
      data: {
        name: 'Mentai',
        selectedTopics: [
          { kind: 'therapy', entityKey: 'anxiety' },
          { kind: 'habits', entityKey: 'smoking' },
        ],
        gender: 'female',
        ageRange: '30_45',
        tone: 'balanced',
      },
    });

    expect(parsed.data.selectedTopics).toEqual([
      { kind: 'therapy', entityKey: 'anxiety' },
      { kind: 'habits', entityKey: 'smoking' },
    ]);
  });

  it('не принимает больше 5 выбранных тем', () => {
    expect(() =>
      OnboardingCompleteRequestDto.parse({
        flow: 'welcome_setup',
        data: {
          name: 'Mentai',
          selectedTopics: [
            { kind: 'therapy', entityKey: 'anxiety' },
            { kind: 'therapy', entityKey: 'phobias' },
            { kind: 'therapy', entityKey: 'stress' },
            { kind: 'habits', entityKey: 'water' },
            { kind: 'habits', entityKey: 'smoking' },
            { kind: 'habits', entityKey: 'alcohol' },
          ],
          gender: 'female',
          ageRange: '30_45',
          tone: 'balanced',
        },
      })
    ).toThrow();
  });

  it('не принимает дубли выбранных тем', () => {
    expect(() =>
      OnboardingCompleteRequestDto.parse({
        flow: 'welcome_setup',
        data: {
          name: 'Mentai',
          selectedTopics: [
            { kind: 'therapy', entityKey: 'anxiety' },
            { kind: 'therapy', entityKey: 'anxiety' },
          ],
          gender: 'female',
          ageRange: '30_45',
          tone: 'balanced',
        },
      })
    ).toThrow();
  });

  it('не принимает неизвестные ключи выбранных тем', () => {
    expect(() =>
      OnboardingCompleteRequestDto.parse({
        flow: 'welcome_setup',
        data: {
          name: 'Mentai',
          selectedTopics: [{ kind: 'therapy', entityKey: 'unknown' }],
          gender: 'female',
          ageRange: '30_45',
          tone: 'balanced',
        },
      })
    ).toThrow();
  });

  it('мапит новые темы в legacy reasons для текущей персонализации', () => {
    expect(
      mapOnboardingTopicsToLegacyReasons([
        { kind: 'therapy', entityKey: 'phobias' },
        { kind: 'habits', entityKey: 'smoking' },
        { kind: 'therapy', entityKey: 'stress' },
      ])
    ).toEqual(['anxiety', 'habits', 'stress']);
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

  it('не принимает завершение онбординга без reasons и selectedTopics', () => {
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
