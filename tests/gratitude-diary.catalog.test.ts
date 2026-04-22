import { describe, expect, it } from 'vitest';
import {
  GRATITUDE_PROMPT_CATEGORIES,
  getGratitudePromptCategories,
} from '../shared/gratitude-diary/catalog';

describe('gratitude diary catalog', () => {
  it('содержит правильное количество категорий', () => {
    expect(GRATITUDE_PROMPT_CATEGORIES.length).toBe(5);
  });

  it('первая категория — «О себе» с промптами self-*', () => {
    const selfCategory = GRATITUDE_PROMPT_CATEGORIES.find(
      (c) => c.id === 'self'
    );
    expect(selfCategory).toBeDefined();
    expect(selfCategory?.title).toBe('О себе');
    expect(selfCategory?.prompts.every((p) => p.id.startsWith('self-'))).toBe(
      true
    );
  });

  it('категория little-things содержит только промпты little-things-*', () => {
    const littleThings = GRATITUDE_PROMPT_CATEGORIES.find(
      (c) => c.id === 'little-things'
    );
    expect(littleThings).toBeDefined();
    expect(littleThings?.title).toBe('Маленькие радости');
    expect(
      littleThings?.prompts.every((p) => p.id.startsWith('little-things-'))
    ).toBe(true);
  });

  it('сохраняет informal-формулировку self-3 как базовую', () => {
    const categories = getGratitudePromptCategories('informal');
    const selfCategory = categories.find((c) => c.id === 'self');
    const prompt = selfCategory?.prompts.find((item) => item.id === 'self-3');

    expect(prompt?.text).toBe(
      'Какой маленький шаг навстречу себе удалось сделать сегодня?'
    );
    expect(prompt?.text).toBe(
      GRATITUDE_PROMPT_CATEGORIES.find((c) => c.id === 'self')?.prompts.find(
        (item) => item.id === 'self-3'
      )?.text
    );
  });

  it('возвращает formal-формулировки для self-2', () => {
    const categories = getGratitudePromptCategories('formal');
    const selfCategory = categories.find((c) => c.id === 'self');
    const prompt = selfCategory?.prompts.find((item) => item.id === 'self-2');

    expect(prompt?.text).toBe(
      'Какое качество характера помогло вам справиться с трудностями?'
    );
  });

  it('возвращает formal-формулировки для little-things-7', () => {
    const categories = getGratitudePromptCategories('formal');
    const littleThings = categories.find((c) => c.id === 'little-things');
    const prompt = littleThings?.prompts.find(
      (item) => item.id === 'little-things-7'
    );

    expect(prompt?.text).toBe(
      'Назовите три вещи, которые создают ощущение уюта и тепла.'
    );
  });
});
