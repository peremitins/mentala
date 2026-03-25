import { describe, expect, it } from 'vitest';
import {
  composeRealtimeVoiceInstructions,
  upsertRealtimeVoiceRuntimeCompactInstructions,
} from '../server/application/realtime/realtime-voice-instructions';

describe('realtime voice instructions service', () => {
  it('не вшивает кризисный протокол в постоянные realtime instructions', () => {
    const instructions = composeRealtimeVoiceInstructions({
      userName: 'Анна',
      userGender: 'female',
      userLocale: 'ru-RU',
      assistantPersona: {
        voice: 'echo',
        voiceLabel: 'Алексей',
        gender: 'male',
        displayName: 'Mentala',
      },
      entryContext: null,
    });

    expect(instructions).not.toContain('ВНИМАНИЕ: ПОТЕНЦИАЛЬНЫЙ КРИЗИС');
    expect(instructions).toContain(
      'Если видишь риск самоповреждения или суицида'
    );
    expect(instructions).toContain('Режим realtime voice:');
  });

  it('добавляет crisis guidance только если его передали явно', () => {
    const instructions = composeRealtimeVoiceInstructions({
      userName: 'Анна',
      userGender: 'female',
      userLocale: 'ru-RU',
      assistantPersona: {
        voice: 'echo',
        voiceLabel: 'Алексей',
        gender: 'male',
        displayName: 'Mentala',
      },
      crisisGuidance: 'РЕЖИМ БЕЗОПАСНОСТИ: CRISIS_HIGH',
    });

    expect(instructions).toContain('РЕЖИМ БЕЗОПАСНОСТИ: CRISIS_HIGH');
  });

  it('встраивает runtime compact block в существующие voice instructions и заменяет старый', () => {
    const baseInstructions = composeRealtimeVoiceInstructions({
      userName: 'Анна',
      userGender: 'female',
      userLocale: 'ru-RU',
      assistantPersona: {
        voice: 'echo',
        voiceLabel: 'Алексей',
        gender: 'male',
        displayName: 'Mentala',
      },
    });

    const first = upsertRealtimeVoiceRuntimeCompactInstructions({
      instructions: baseInstructions,
      runtimeCompactState: {
        schemaVersion: 1,
        compactOverview: 'Пользователь обсуждает переезд.',
        activeThemes: ['переезд'],
        activePatterns: [],
        helpfulInterventions: [],
        unfinishedThreads: [],
        riskState: 'none',
        nextTurnGuidance: ['уточнить сроки'],
      },
    });
    const second = upsertRealtimeVoiceRuntimeCompactInstructions({
      instructions: first,
      runtimeCompactState: {
        schemaVersion: 1,
        compactOverview: 'Пользователь обсуждает новую работу.',
        activeThemes: ['работа'],
        activePatterns: [],
        helpfulInterventions: [],
        unfinishedThreads: [],
        riskState: 'none',
        nextTurnGuidance: ['уточнить оффер'],
      },
    });

    expect(first).toContain('[RUNTIME_COMPACT_STATE]');
    expect(first).toContain('Пользователь обсуждает переезд.');
    expect(second).toContain('Пользователь обсуждает новую работу.');
    expect(second).not.toContain('Пользователь обсуждает переезд.');
    expect(second.match(/\[RUNTIME_COMPACT_STATE\]/g)?.length || 0).toBe(1);
  });
});
