import { describe, expect, it } from 'vitest';
import {
  computeEligibilityFromTranscript,
  isEligibleForSummary,
} from '../server/application/sessionSummaryUser/sessionSummaryEligibility';

describe('session summary user eligibility', () => {
  it('считает содержательные сообщения и длительность по transcript', () => {
    const startedAt = new Date('2026-04-23T10:00:00.000Z');
    const endedAt = new Date('2026-04-23T10:04:30.000Z');
    const longText =
      'Я чувствую сильную тревогу из-за работы и не понимаю, как перестать ' +
      'прокручивать одни и те же мысли вечером перед сном.';

    const metrics = computeEligibilityFromTranscript(
      [
        {
          id: 1,
          therapySessionId: 101,
          userId: 77,
          turnIndex: 1,
          role: 'user',
          content: longText,
          tokenCount: null,
          createdAt: startedAt,
        },
        {
          id: 2,
          therapySessionId: 101,
          userId: 77,
          turnIndex: 1,
          role: 'assistant',
          content: 'Понимаю. Давай разложим это по шагам.',
          tokenCount: null,
          createdAt: new Date('2026-04-23T10:00:20.000Z'),
        },
        {
          id: 3,
          therapySessionId: 101,
          userId: 77,
          turnIndex: 2,
          role: 'user',
          content: longText,
          tokenCount: null,
          createdAt: new Date('2026-04-23T10:01:10.000Z'),
        },
        {
          id: 4,
          therapySessionId: 101,
          userId: 77,
          turnIndex: 3,
          role: 'user',
          content: longText,
          tokenCount: null,
          createdAt: new Date('2026-04-23T10:02:30.000Z'),
        },
        {
          id: 5,
          therapySessionId: 101,
          userId: 77,
          turnIndex: 4,
          role: 'user',
          content: longText,
          tokenCount: null,
          createdAt: new Date('2026-04-23T10:03:20.000Z'),
        },
        {
          id: 6,
          therapySessionId: 101,
          userId: 77,
          turnIndex: 5,
          role: 'user',
          content: longText,
          tokenCount: null,
          createdAt: new Date('2026-04-23T10:04:00.000Z'),
        },
      ],
      startedAt,
      endedAt
    );

    expect(metrics).toEqual({
      userMessagesCount: 5,
      qualifyingUserMessagesCount: 5,
      durationSeconds: 270,
    });
    expect(isEligibleForSummary(metrics)).toBe(true);
  });

  it('не пускает короткую сессию без достаточного числа содержательных сообщений', () => {
    const startedAt = new Date('2026-04-23T10:00:00.000Z');
    const endedAt = new Date('2026-04-23T10:01:30.000Z');

    const metrics = computeEligibilityFromTranscript(
      [
        {
          id: 1,
          therapySessionId: 102,
          userId: 77,
          turnIndex: 1,
          role: 'user',
          content: 'Привет',
          tokenCount: null,
          createdAt: startedAt,
        },
        {
          id: 2,
          therapySessionId: 102,
          userId: 77,
          turnIndex: 2,
          role: 'user',
          content: 'Тревожно',
          tokenCount: null,
          createdAt: new Date('2026-04-23T10:01:00.000Z'),
        },
      ],
      startedAt,
      endedAt
    );

    expect(metrics.userMessagesCount).toBe(2);
    expect(metrics.qualifyingUserMessagesCount).toBe(0);
    expect(metrics.durationSeconds).toBe(90);
    expect(isEligibleForSummary(metrics)).toBe(false);
  });

  it('разрешает summary по bypass-правилу при 15 user-сообщениях даже без длинной длительности', () => {
    expect(
      isEligibleForSummary({
        userMessagesCount: 15,
        qualifyingUserMessagesCount: 0,
        durationSeconds: 30,
      })
    ).toBe(true);
  });
});
