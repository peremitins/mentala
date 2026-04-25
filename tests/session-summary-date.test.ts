import { describe, expect, it } from 'vitest';
import {
  formatSessionSummaryDisplayDate,
  resolveSessionSummaryDisplayDateIso,
} from '../app/utils/session-summary-date';

const baseSummary = {
  id: 1,
  status: 'completed',
  sessionStartedAt: null,
  sessionEndedAt: '2026-04-25T00:15:00.000Z',
  durationSeconds: 120,
  messagesCount: 5,
  qualifyingUserMessagesCount: 3,
  viewedAt: null,
  trigger: 'cron-nightly',
  summary: {
    shortSummary: 'Короткий итог',
    keyPoints: [],
    nextSteps: [],
  },
  createdAt: '2026-04-25T00:20:00.000Z',
  updatedAt: '2026-04-25T00:20:00.000Z',
} as const;

describe('session summary display date', () => {
  it('показывает дату начала сессии, а не дату ночной генерации', () => {
    expect(
      resolveSessionSummaryDisplayDateIso({
        ...baseSummary,
        sessionStartedAt: '2026-04-24T20:30:00.000Z',
      })
    ).toBe('2026-04-24T20:30:00.000Z');
  });

  it('форматирует дату без точного времени', () => {
    const formatted = formatSessionSummaryDisplayDate({
      ...baseSummary,
      sessionStartedAt: '2026-04-24T20:30:00.000Z',
    });

    expect(formatted).toContain('2026');
    expect(formatted).not.toContain(':');
  });
});
