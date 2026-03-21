import { describe, expect, it } from 'vitest';
import {
  projectTherapySessionTranscriptFromHistory,
  serializeTherapySessionTranscriptForAnalysis,
  serializeTherapySessionTranscriptForSessionEndAnalysis,
} from '../server/application/chat/sessionTranscriptProjection';

describe('projectTherapySessionTranscriptFromHistory', () => {
  it('восстанавливает полный transcript из клиентской истории и добавляет новый assistant turn', () => {
    const projected = projectTherapySessionTranscriptFromHistory({
      historyMessages: [
        { role: 'system', content: 'ignored' },
        { role: 'user', content: 'Меня зовут Николай' },
        { role: 'assistant', content: 'Приятно познакомиться' },
        { role: 'developer', content: 'ignored too' },
        { role: 'user', content: 'Я люблю белый цвет и ежиков' },
      ],
      assistantMessage: 'Запомнила это',
    });

    expect(projected).toEqual([
      {
        role: 'user',
        content: 'Меня зовут Николай',
        turnIndex: 1,
      },
      {
        role: 'assistant',
        content: 'Приятно познакомиться',
        turnIndex: 2,
      },
      {
        role: 'user',
        content: 'Я люблю белый цвет и ежиков',
        turnIndex: 3,
      },
      {
        role: 'assistant',
        content: 'Запомнила это',
        turnIndex: 4,
      },
    ]);
  });

  it('не теряет текущий user-turn, если клиент не прислал историю', () => {
    const projected = projectTherapySessionTranscriptFromHistory({
      historyMessages: [],
      fallbackUserMessage: 'Мой любимый цвет белый',
      assistantMessage: 'Поняла тебя',
    });

    expect(projected).toEqual([
      {
        role: 'user',
        content: 'Мой любимый цвет белый',
        turnIndex: 1,
      },
      {
        role: 'assistant',
        content: 'Поняла тебя',
        turnIndex: 2,
      },
    ]);
  });
});

describe('serializeTherapySessionTranscriptForAnalysis', () => {
  it('сериализует весь transcript в явный блок для session-end анализа', () => {
    const serialized = serializeTherapySessionTranscriptForAnalysis([
      {
        id: 1,
        therapySessionId: 42,
        userId: 83,
        turnIndex: 1,
        role: 'user',
        content: 'Меня зовут Николай',
        tokenCount: null,
        createdAt: new Date('2026-03-20T10:00:00.000Z'),
      },
      {
        id: 2,
        therapySessionId: 42,
        userId: 83,
        turnIndex: 2,
        role: 'assistant',
        content: 'Приятно познакомиться',
        tokenCount: null,
        createdAt: new Date('2026-03-20T10:00:10.000Z'),
      },
      {
        id: 3,
        therapySessionId: 42,
        userId: 83,
        turnIndex: 3,
        role: 'user',
        content: 'Люблю ежиков и белый цвет',
        tokenCount: null,
        createdAt: new Date('2026-03-20T10:00:20.000Z'),
      },
    ]);

    expect(serialized).toContain('#1 USER');
    expect(serialized).toContain('Меня зовут Николай');
    expect(serialized).toContain('#2 ASSISTANT');
    expect(serialized).toContain('Приятно познакомиться');
    expect(serialized).toContain('#3 USER');
    expect(serialized).toContain('Люблю ежиков и белый цвет');
  });
});

describe('serializeTherapySessionTranscriptForSessionEndAnalysis', () => {
  it('для realtime voice сохраняет ранние USER сообщения, но выкидывает ранние ASSISTANT до cursor', () => {
    const serialized = serializeTherapySessionTranscriptForSessionEndAnalysis({
      sourceMode: 'realtime_voice',
      runtimeCompactCursorMessageId: 3,
      messages: [
        {
          id: 1,
          therapySessionId: 42,
          userId: 83,
          turnIndex: 1,
          role: 'user',
          content: 'Меня зовут Николай',
          tokenCount: null,
          createdAt: new Date('2026-03-20T10:00:00.000Z'),
        },
        {
          id: 2,
          therapySessionId: 42,
          userId: 83,
          turnIndex: 2,
          role: 'assistant',
          content:
            'Ранний длинный ответ ассистента, который уже должен жить в runtime compact-state',
          tokenCount: null,
          createdAt: new Date('2026-03-20T10:00:05.000Z'),
        },
        {
          id: 3,
          therapySessionId: 42,
          userId: 83,
          turnIndex: 3,
          role: 'user',
          content: 'Я люблю белый цвет',
          tokenCount: null,
          createdAt: new Date('2026-03-20T10:00:10.000Z'),
        },
        {
          id: 4,
          therapySessionId: 42,
          userId: 83,
          turnIndex: 4,
          role: 'assistant',
          content: 'Свежий ответ ассистента после compaction',
          tokenCount: null,
          createdAt: new Date('2026-03-20T10:00:20.000Z'),
        },
      ],
    });

    expect(serialized).toContain('Все USER сообщения сохранены целиком.');
    expect(serialized).toContain('Меня зовут Николай');
    expect(serialized).toContain('Я люблю белый цвет');
    expect(serialized).not.toContain(
      'Ранний длинный ответ ассистента, который уже должен жить в runtime compact-state'
    );
    expect(serialized).toContain('Свежий ответ ассистента после compaction');
  });
});
