import { describe, expect, it } from 'vitest';
import { buildWelcomePrompt } from '../server/application/prompts';

const PHOBIAS_ENTRY_CONTEXT = {
  type: 'therapy_topic' as const,
  topic_id: 'phobias',
  topic_name: 'Страхи',
};

describe('welcome prompt', () => {
  it('разрешает короткое приветствие для phobias в первое приветствие дня', () => {
    const prompt = buildWelcomePrompt({
      isFirstSession: true,
      lang: 'ru',
      entryContext: PHOBIAS_ENTRY_CONTEXT,
      disableOpeningTemplates: true,
      useGreeting: true,
    });

    expect(prompt).toContain('Допустимо одно короткое приветствие');
    expect(prompt).toContain(
      'Начни с одного короткого приветствия, затем сразу перейди к структурированному старту по теме страхов'
    );
    expect(prompt).not.toContain('Сегодня приветствие уже использовано');
  });

  it('запрещает приветствие для phobias после первого приветствия дня', () => {
    const prompt = buildWelcomePrompt({
      isFirstSession: false,
      lang: 'ru',
      entryContext: PHOBIAS_ENTRY_CONTEXT,
      disableOpeningTemplates: true,
      useGreeting: false,
    });

    expect(prompt).toContain('Сегодня приветствие уже использовано');
    expect(prompt).toContain('без приветствия');
  });
});
