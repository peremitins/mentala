import { describe, expect, it } from 'vitest';
import {
  computeEligibilityMessageCounts,
  computeEligibilityFromTranscript,
  isEligibleForRoadmapSummary,
  isEligibleForSummary,
  ROADMAP_SUMMARY_USER_QUALIFYING_MIN_CHARS,
} from '../server/application/sessionSummaryUser/sessionSummaryEligibility';
import { SessionSummaryUserTriggerEnum } from '../shared/dto/sessionSummaryUser';

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

  it('разрешает summary по bypass-правилу при 7 user-сообщениях даже без длинной длительности', () => {
    expect(
      isEligibleForSummary({
        userMessagesCount: 7,
        qualifyingUserMessagesCount: 0,
        durationSeconds: 30,
      })
    ).toBe(true);
  });

  it('разрешает Roadmap-summary для короткого завершённого AI-action', () => {
    const startedAt = new Date('2026-05-18T10:00:00.000Z');
    const endedAt = new Date('2026-05-18T10:00:20.000Z');
    const messages = [
      {
        role: 'user' as const,
        content: 'Не знаю, что дальше ты предлагаешь',
      },
      {
        role: 'assistant' as const,
        content:
          'Неопределённость может быть сложной. Давай начнём с маленького шага.',
      },
    ];

    const standardMetrics = computeEligibilityFromTranscript(
      messages,
      startedAt,
      endedAt
    );
    const roadmapMetrics = computeEligibilityFromTranscript(
      messages,
      startedAt,
      endedAt,
      { qualifyingMinChars: ROADMAP_SUMMARY_USER_QUALIFYING_MIN_CHARS }
    );

    expect(isEligibleForSummary(standardMetrics)).toBe(false);
    expect(
      isEligibleForRoadmapSummary({
        ...roadmapMetrics,
        messagesCount: messages.length,
      })
    ).toBe(true);
  });

  it('не создаёт Roadmap-summary для пустого диалога без сообщений пользователя', () => {
    const counts = computeEligibilityMessageCounts(
      [
        {
          role: 'assistant' as const,
          content: 'Техническая подсказка без ответа пользователя',
        },
      ],
      { qualifyingMinChars: ROADMAP_SUMMARY_USER_QUALIFYING_MIN_CHARS }
    );

    expect(
      isEligibleForRoadmapSummary({
        ...counts,
        durationSeconds: 180,
        messagesCount: 1,
      })
    ).toBe(false);
  });

  it('принимает roadmap_next как отдельный trigger пользовательского итога', () => {
    expect(SessionSummaryUserTriggerEnum.parse('roadmap_next')).toBe(
      'roadmap_next'
    );
  });
});
