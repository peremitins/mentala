import { describe, expect, it } from 'vitest';
import { composeRealtimeVoiceInstructions } from '../server/application/realtime/realtime-voice-instructions';

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
    expect(instructions).toContain('Если видишь риск самоповреждения или суицида');
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
});
