import { describe, expect, it } from 'vitest';
import {
  GRATITUDE_PROMPT_CATEGORIES,
  getGratitudePromptCategories,
} from '../shared/gratitude-diary/catalog';

describe('gratitude diary catalog', () => {
  it('сохраняет текущие informal формулировки как базовые', () => {
    const categories = getGratitudePromptCategories('informal');
    const prompt = categories[0]?.prompts.find((item) => item.id === 'self-3');

    expect(prompt?.text).toBe('Какой маленький шаг к себе ты сделал сегодня?');
    expect(prompt?.text).toBe(
      GRATITUDE_PROMPT_CATEGORIES[0]?.prompts.find(
        (item) => item.id === 'self-3'
      )?.text
    );
  });

  it('возвращает отдельные formal формулировки для каталога', () => {
    const categories = getGratitudePromptCategories('formal');
    const prompt = categories[0]?.prompts.find((item) => item.id === 'self-3');

    expect(prompt?.text).toBe('Какой маленький шаг к себе вы сделали сегодня?');
  });
});
