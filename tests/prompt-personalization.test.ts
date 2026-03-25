import { describe, expect, it } from 'vitest';
import {
  buildDeveloperContext,
  buildSuggestedChipsUserPrompt,
  buildWelcomePrompt,
} from '../server/application/prompts';

describe('prompt personalization', () => {
  it('добавляет несколько onboarding reasons в developer context', () => {
    const prompt = buildDeveloperContext(
      {
        user_name: 'Аня',
        user_gender: 'female',
        onboardingReasons: ['anxiety', 'support'],
      },
      { responseNumber: 2 }
    );

    expect(prompt).toContain('Контекст персонализации из онбординга');
    expect(prompt).toContain(
      'Что привело пользователя: снизить тревожность; получить поддержку.'
    );
    expect(prompt).toContain('Приоритетные фокусы:');
  });

  it('добавляет formal addressing в developer context', () => {
    const prompt = buildDeveloperContext(
      {
        user_name: 'Анна',
        user_gender: 'female',
        addressing: 'formal',
      },
      { responseNumber: 1 }
    );

    expect(prompt).toContain('Обращение к пользователю: на вы.');
    expect(prompt).toContain('используй формы «вы/вам/вас»');
    expect(prompt).not.toContain('Обращайся к пользователю только на «ты»');
  });

  it('добавляет onboarding personalization в welcome prompt', () => {
    const prompt = buildWelcomePrompt({
      isFirstSession: true,
      lang: 'ru',
      onboardingReasons: ['habits'],
    });

    expect(prompt).toContain('Контекст персонализации из онбординга');
    expect(prompt).toContain('работать с привычками');
  });

  it('добавляет formal addressing в welcome prompt', () => {
    const prompt = buildWelcomePrompt({
      isFirstSession: true,
      lang: 'ru',
      addressing: 'formal',
    });

    expect(prompt).toContain('Обращение к пользователю: на вы.');
    expect(prompt).toContain('используй формы «вы/вам/вас»');
  });

  it('передает onboarding personalization в prompt для suggested chips', () => {
    const prompt = buildSuggestedChipsUserPrompt({
      dialog_context: 'Пользователь: Мне тяжело остановить тревожные мысли',
      assistant_answer:
        'Давай начнем с того, что сейчас крутится сильнее всего.',
      max_chips: 3,
      onboardingReasons: ['thoughts', 'stress'],
    });

    expect(prompt).toContain('Онбординг:');
    expect(prompt).toContain('разобраться в мыслях');
    expect(prompt).toContain('справиться со стрессом');
    expect(prompt).not.toContain('Недавние чипы');
    expect(prompt).not.toContain('Тема:');
  });
});
