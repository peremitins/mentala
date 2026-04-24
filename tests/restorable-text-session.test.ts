import { describe, expect, it } from 'vitest';
import {
  isSessionWithinRestoreWindow,
  mergeTranscriptSnapshots,
  sliceTranscriptBacklogSessionsUpToAnchor,
} from '../server/application/chat/restorableTextSession.utils';

describe('restorable text session window', () => {
  it('разрешает restore для свежей активности внутри idle timeout', () => {
    const now = new Date('2026-04-23T12:00:00.000Z');
    const lastActivityAt = new Date('2026-04-23T11:50:00.000Z');

    expect(isSessionWithinRestoreWindow(lastActivityAt, now)).toBe(true);
  });

  it('не разрешает restore для протухшей активности вне idle timeout', () => {
    const now = new Date('2026-04-23T12:00:00.000Z');
    const lastActivityAt = new Date('2026-04-23T11:30:00.000Z');

    expect(isSessionWithinRestoreWindow(lastActivityAt, now)).toBe(false);
  });

  it('склеивает старый и новый snapshot, если новый содержит только хвост', () => {
    const merged = mergeTranscriptSnapshots([
      [
        {
          id: 1,
          therapySessionId: 100,
          userId: 7,
          turnIndex: 1,
          role: 'user',
          content: 'Первое сообщение',
          tokenCount: null,
          createdAt: new Date('2026-04-23T10:00:00.000Z'),
        },
        {
          id: 2,
          therapySessionId: 100,
          userId: 7,
          turnIndex: 1,
          role: 'assistant',
          content: 'Первый ответ',
          tokenCount: null,
          createdAt: new Date('2026-04-23T10:00:10.000Z'),
        },
      ],
      [
        {
          id: 3,
          therapySessionId: 101,
          userId: 7,
          turnIndex: 1,
          role: 'user',
          content: 'Второе сообщение',
          tokenCount: null,
          createdAt: new Date('2026-04-23T10:05:00.000Z'),
        },
        {
          id: 4,
          therapySessionId: 101,
          userId: 7,
          turnIndex: 1,
          role: 'assistant',
          content: 'Второй ответ',
          tokenCount: null,
          createdAt: new Date('2026-04-23T10:05:10.000Z'),
        },
      ],
    ]);

    expect(merged.map((message) => message.content)).toEqual([
      'Первое сообщение',
      'Первый ответ',
      'Второе сообщение',
      'Второй ответ',
    ]);
  });

  it('берёт новый snapshot целиком, если он уже содержит весь backlog', () => {
    const merged = mergeTranscriptSnapshots([
      [
        {
          id: 1,
          therapySessionId: 100,
          userId: 7,
          turnIndex: 1,
          role: 'user',
          content: 'Первое сообщение',
          tokenCount: null,
          createdAt: new Date('2026-04-23T10:00:00.000Z'),
        },
        {
          id: 2,
          therapySessionId: 100,
          userId: 7,
          turnIndex: 1,
          role: 'assistant',
          content: 'Первый ответ',
          tokenCount: null,
          createdAt: new Date('2026-04-23T10:00:10.000Z'),
        },
      ],
      [
        {
          id: 3,
          therapySessionId: 101,
          userId: 7,
          turnIndex: 1,
          role: 'user',
          content: 'Первое сообщение',
          tokenCount: null,
          createdAt: new Date('2026-04-23T10:05:00.000Z'),
        },
        {
          id: 4,
          therapySessionId: 101,
          userId: 7,
          turnIndex: 1,
          role: 'assistant',
          content: 'Первый ответ',
          tokenCount: null,
          createdAt: new Date('2026-04-23T10:05:10.000Z'),
        },
        {
          id: 5,
          therapySessionId: 101,
          userId: 7,
          turnIndex: 2,
          role: 'user',
          content: 'Второе сообщение',
          tokenCount: null,
          createdAt: new Date('2026-04-23T10:06:00.000Z'),
        },
        {
          id: 6,
          therapySessionId: 101,
          userId: 7,
          turnIndex: 2,
          role: 'assistant',
          content: 'Второй ответ',
          tokenCount: null,
          createdAt: new Date('2026-04-23T10:06:10.000Z'),
        },
      ],
    ]);

    expect(merged.map((message) => message.content)).toEqual([
      'Первое сообщение',
      'Первый ответ',
      'Второе сообщение',
      'Второй ответ',
    ]);
  });

  it('ограничивает backlog только сессиями до выбранного якоря', () => {
    const scoped = sliceTranscriptBacklogSessionsUpToAnchor(
      [
        {
          id: 100,
          startedAt: new Date('2026-04-23T10:00:00.000Z'),
        },
        {
          id: 101,
          startedAt: new Date('2026-04-23T10:05:00.000Z'),
        },
        {
          id: 102,
          startedAt: new Date('2026-04-23T10:10:00.000Z'),
        },
      ],
      {
        id: 101,
        startedAt: new Date('2026-04-23T10:05:00.000Z'),
      }
    );

    expect(scoped.map((session) => session.id)).toEqual([100, 101]);
  });

  it('не теряет старый backlog, если anchor-сессия ещё не успела записать transcript', () => {
    const scoped = sliceTranscriptBacklogSessionsUpToAnchor(
      [
        {
          id: 100,
          startedAt: new Date('2026-04-23T10:00:00.000Z'),
        },
        {
          id: 101,
          startedAt: new Date('2026-04-23T10:05:00.000Z'),
        },
      ],
      {
        id: 102,
        startedAt: new Date('2026-04-23T10:10:00.000Z'),
      }
    );

    expect(scoped.map((session) => session.id)).toEqual([100, 101]);
  });
});
