import { describe, expect, it } from 'vitest';
import { pickDurableUserMemorySource } from '../server/application/chat/durableUserMemorySource';
import { pickHandoffSummarySource } from '../server/application/chat/sessionHandoffSummarySource';

describe('chat summary durable memory parsing', () => {
  it('берёт nested profile, если модель вернула ожидаемую структуру', () => {
    const profile = pickDurableUserMemorySource({
      handoff: {
        schemaVersion: 1,
      },
      profile: {
        schemaVersion: 1,
        name: 'Николай',
        facts: ['favorite color: green'],
        preferences: [],
        context: [],
      },
    });

    expect(profile).toEqual({
      schemaVersion: 1,
      name: 'Николай',
      facts: ['favorite color: green'],
      preferences: [],
      context: [],
    });
  });

  it('принимает flat profile на верхнем уровне ответа', () => {
    const profile = pickDurableUserMemorySource({
      handoff: {
        schemaVersion: 1,
      },
      schemaVersion: 1,
      name: 'Николай',
      facts: ['favorite color: green'],
      preferences: ['likes jazz'],
      context: ['builds an app'],
    });

    expect(profile).toEqual({
      handoff: {
        schemaVersion: 1,
      },
      schemaVersion: 1,
      name: 'Николай',
      facts: ['favorite color: green'],
      preferences: ['likes jazz'],
      context: ['builds an app'],
    });
  });
});

describe('chat summary handoff parsing', () => {
  it('берёт nested handoff, если модель вернула ожидаемую структуру', () => {
    const handoff = pickHandoffSummarySource({
      handoff: {
        sessionOverviewShort:
          'Пользователь обсудил тревогу перед собеседованием',
        themesActive: ['тревога'],
      },
    });

    expect(handoff).toEqual({
      sessionOverviewShort: 'Пользователь обсудил тревогу перед собеседованием',
      themesActive: ['тревога'],
    });
  });

  it('принимает flat handoff на верхнем уровне ответа', () => {
    const handoff = pickHandoffSummarySource({
      sessionOverviewShort: 'Пользователь обсудил тревогу перед собеседованием',
      themesActive: ['тревога'],
      patternsOrTriggers: ['страх оценки'],
      helpfulInterventions: ['дыхание 4-6'],
      unfinishedThreads: ['подготовка к интервью'],
      riskState: 'none',
      nextSessionGuidance: ['вернуться к плану разговора'],
    });

    expect(handoff).toEqual({
      sessionOverviewShort: 'Пользователь обсудил тревогу перед собеседованием',
      themesActive: ['тревога'],
      patternsOrTriggers: ['страх оценки'],
      helpfulInterventions: ['дыхание 4-6'],
      unfinishedThreads: ['подготовка к интервью'],
      riskState: 'none',
      nextSessionGuidance: ['вернуться к плану разговора'],
    });
  });
});
