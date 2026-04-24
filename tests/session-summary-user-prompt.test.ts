import { describe, expect, it } from 'vitest';
import { buildSessionSummaryUserPrompt } from '../server/application/prompts/sessionSummaryUser';

const baseVars = {
  durationSeconds: 180,
  userMessagesCount: 4,
  messages: [
    {
      role: 'user',
      content: 'Мне тревожно и я не понимаю, с чего начать.',
    },
    {
      role: 'assistant',
      content: 'Давай спокойно разберём, что сейчас давит сильнее всего.',
    },
  ],
} as const;

describe('session summary user prompt personalization', () => {
  it('требует женский род для пользователя с female gender', () => {
    const { system, user } = buildSessionSummaryUserPrompt({
      ...baseVars,
      addressing: 'informal',
      locale: 'ru',
      gender: 'female',
    });

    expect(system).toContain('Язык, обращение и род');
    expect(system).toContain('женский род');
    expect(system).toContain('Никогда не переходи на мужской род');
    expect(user).toContain('на «ты»');
    expect(user).toContain('женский род');
  });

  it('требует мужской род для пользователя с male gender', () => {
    const { system, user } = buildSessionSummaryUserPrompt({
      ...baseVars,
      addressing: 'formal',
      locale: 'ru',
      gender: 'male',
    });

    expect(system).toContain('мужской род');
    expect(system).toContain('Никогда не переходи на женский род');
    expect(user).toContain('на «вы»');
    expect(user).toContain('мужской род');
  });

  it('требует нейтральные формулировки, если пол не указан', () => {
    const { system, user } = buildSessionSummaryUserPrompt({
      ...baseVars,
      addressing: 'informal',
      locale: 'ru',
      gender: null,
    });

    expect(system).toContain(
      'нейтральные конструкции без предположений о поле'
    );
    expect(user).toContain('не делая предположений о поле');
  });
});
