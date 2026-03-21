import { describe, expect, it } from 'vitest';
import {
  fitDurableUserMemoryForPrompt,
  normalizeHandoffSummary,
  normalizeDurableUserMemory,
  serializeHandoffSummaryForPrompt,
  serializeDurableUserMemoryForPrompt,
} from '../server/application/chat/chatMemory.types';

describe('durable user memory', () => {
  it('больше не режет длинные значения durable memory', () => {
    const longFact =
      'favorite football club in southern russia with a very specific and meaningful description';

    const memory = normalizeDurableUserMemory({
      schemaVersion: 1,
      name: 'Артем',
      facts: [longFact],
      preferences: [],
      context: [],
    });

    expect(memory.facts).toEqual([longFact]);
  });

  it('больше не режет массивы durable memory по количеству элементов', () => {
    const facts = Array.from({ length: 12 }, (_, index) => `fact ${index + 1}`);

    const memory = normalizeDurableUserMemory({
      schemaVersion: 1,
      name: '',
      facts,
      preferences: [],
      context: [],
    });

    expect(memory.facts).toEqual(facts);
  });

  it('сохраняет concrete value в длинных key-value фактах', () => {
    const memory = normalizeDurableUserMemory({
      schemaVersion: 1,
      name: '',
      facts: [
        'Самый любимый футбольный клуб в России — Краснодар',
        'Самый любимый футбольный клуб в Европе — Милан',
      ],
      preferences: [],
      context: [],
    });

    expect(memory.facts[0]).toContain('Краснодар');
    expect(memory.facts[1]).toContain('Милан');
    expect(memory.facts[0]).not.toMatch(/(?:—|–|-|:)\s*$/u);
    expect(memory.facts[1]).not.toMatch(/(?:—|–|-|:)\s*$/u);
  });

  it('читает legacy compact keys из старых записей', () => {
    const memory = normalizeDurableUserMemory({
      v: 1,
      n: 'Артем',
      f: ['Любимый цвет: белый'],
      p: ['Любит джаз'],
      g: ['Пишет приложение'],
    });

    expect(memory.name).toBe('Артем');
    expect(memory.facts).toEqual(['Любимый цвет: белый']);
    expect(memory.preferences).toEqual(['Любит джаз']);
    expect(memory.context).toEqual(['Пишет приложение']);
  });

  it('для prompt режет durable memory мягче и только в projection-слое', () => {
    const memory = normalizeDurableUserMemory({
      schemaVersion: 1,
      name: 'Николай',
      facts: Array.from({ length: 24 }, (_, index) => `fact ${index + 1}`),
      preferences: Array.from(
        { length: 24 },
        (_, index) => `preference ${index + 1}`
      ),
      context: Array.from({ length: 18 }, (_, index) => `context ${index + 1}`),
    });

    const projected = fitDurableUserMemoryForPrompt(memory);

    expect(projected.name).toBe('Николай');
    expect(projected.facts.length).toBeLessThanOrEqual(3);
    expect(projected.preferences.length).toBeLessThanOrEqual(3);
    expect(projected.context.length).toBeLessThanOrEqual(2);
    expect(projected.facts).toContain('fact 1');
    expect(projected.facts).toContain('fact 24');
  });

  it('держит serialized prompt memory в пределах 1000 символов даже на escape-heavy значениях', () => {
    const noisyValue = '"'.repeat(120);
    const memory = normalizeDurableUserMemory({
      schemaVersion: 1,
      name: 'Николай ' + noisyValue,
      facts: Array.from(
        { length: 8 },
        (_, index) => `fact ${index + 1} ${noisyValue}`
      ),
      preferences: Array.from(
        { length: 8 },
        (_, index) => `preference ${index + 1} ${noisyValue}`
      ),
      context: Array.from(
        { length: 8 },
        (_, index) => `context ${index + 1} ${noisyValue}`
      ),
    });

    const serialized = serializeDurableUserMemoryForPrompt(memory);
    const payload = JSON.parse(
      serialized.replace('Память пользователя:\n', '')
    ) as {
      n?: string;
      f?: string[];
      p?: string[];
      c?: string[];
    };

    expect(serialized.length).toBeLessThanOrEqual(1000);
    expect(payload.f?.length ?? 0).toBeLessThanOrEqual(3);
    expect(payload.p?.length ?? 0).toBeLessThanOrEqual(3);
    expect(payload.c?.length ?? 0).toBeLessThanOrEqual(2);
  });

  it('сериализует handoff без stable facts и пустых полей, чтобы не дублировать durable profile', () => {
    const summary = normalizeHandoffSummary({
      schemaVersion: 1,
      sessionOverviewShort: 'Обсуждали тревогу перед важным разговором',
      stableFactsToCarry: ['любимый цвет: красный'],
      themesActive: ['тревога перед разговором'],
      patternsOrTriggers: [],
      helpfulInterventions: [],
      unfinishedThreads: ['подготовить одну честную фразу'],
      riskState: 'none',
      nextSessionGuidance: [],
    });

    const serialized = serializeHandoffSummaryForPrompt(summary);
    const payload = JSON.parse(
      serialized.replace(
        'Handoff прошлой сессии. Только session-specific фон; long-term профиль пользователя уже передаётся отдельно.\n',
        ''
      )
    ) as Record<string, unknown>;

    expect(payload).not.toHaveProperty('stableFactsToCarry');
    expect(payload).not.toHaveProperty('riskState');
    expect(payload).toMatchObject({
      sessionOverviewShort: 'Обсуждали тревогу перед важным разговором',
      themesActive: ['тревога перед разговором'],
      unfinishedThreads: ['подготовить одну честную фразу'],
    });
  });
});
