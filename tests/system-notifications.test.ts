import { describe, expect, it } from 'vitest';
import {
  getReengagementThresholds,
  getNextLocalHourUtc,
  MIN_FUTURE_SLOT_DELAY_MS,
  resolveReengagementScheduledAt,
  resolveNextReengagementStage,
  resolveSummaryReadyScheduledAt,
} from '../server/application/notifications/system-notification-scheduling';

describe('system notification scheduling', () => {
  it('schedules summary-ready push at same local noon when ready before noon', () => {
    const scheduledAt = resolveSummaryReadyScheduledAt({
      summaryCreatedAt: new Date('2026-05-06T07:00:00.000Z'), // 10:00 Europe/Moscow
      nowUtc: new Date('2026-05-06T07:05:00.000Z'),
      timezone: 'Europe/Moscow',
    });

    expect(scheduledAt.toISOString()).toBe('2026-05-06T09:00:00.000Z');
  });

  it('schedules summary-ready push next local noon when ready after noon', () => {
    const scheduledAt = resolveSummaryReadyScheduledAt({
      summaryCreatedAt: new Date('2026-05-06T10:30:00.000Z'), // 13:30 Europe/Moscow
      nowUtc: new Date('2026-05-06T10:35:00.000Z'),
      timezone: 'Europe/Moscow',
    });

    expect(scheduledAt.toISOString()).toBe('2026-05-07T09:00:00.000Z');
  });

  it('chooses reengagement stages by inactivity duration and current stage', () => {
    const nowUtc = new Date('2026-05-06T12:00:00.000Z');

    expect(
      resolveNextReengagementStage({
        lastSeenAt: new Date('2026-05-05T00:00:00.000Z'),
        reengagementStage: 0,
        suppressedUntil: null,
        nowUtc,
      })
    ).toBe(1);

    expect(
      resolveNextReengagementStage({
        lastSeenAt: new Date('2026-05-03T11:59:00.000Z'),
        reengagementStage: 1,
        suppressedUntil: null,
        nowUtc,
      })
    ).toBe(2);

    expect(
      resolveNextReengagementStage({
        lastSeenAt: new Date('2026-04-29T11:59:00.000Z'),
        reengagementStage: 2,
        suppressedUntil: null,
        nowUtc,
      })
    ).toBe(3);
  });

  it('does not schedule reengagement while suppressed or before threshold', () => {
    const nowUtc = new Date('2026-05-06T12:00:00.000Z');

    expect(
      resolveNextReengagementStage({
        lastSeenAt: new Date('2026-05-06T00:00:00.000Z'),
        reengagementStage: 0,
        suppressedUntil: null,
        nowUtc,
      })
    ).toBeNull();

    expect(
      resolveNextReengagementStage({
        lastSeenAt: new Date('2026-04-29T11:59:00.000Z'),
        reengagementStage: 2,
        suppressedUntil: new Date('2026-05-07T00:00:00.000Z'),
        nowUtc,
      })
    ).toBeNull();
  });

  it('computes next local hour in the user timezone', () => {
    const scheduledAt = getNextLocalHourUtc({
      nowUtc: new Date('2026-05-06T06:00:00.000Z'),
      timezone: 'Asia/Vladivostok',
      hour: 19,
    });

    expect(scheduledAt.toISOString()).toBe('2026-05-06T09:00:00.000Z');
  });

  it('uses hour-based reengagement timing in local development', () => {
    const nowUtc = new Date('2026-05-06T12:00:00.000Z');
    const thresholds = getReengagementThresholds({ localDevelopment: true });

    expect(
      resolveNextReengagementStage({
        lastSeenAt: new Date('2026-05-06T10:59:00.000Z'),
        reengagementStage: 0,
        suppressedUntil: null,
        nowUtc,
        thresholds,
      })
    ).toBe(1);

    expect(
      resolveNextReengagementStage({
        lastSeenAt: new Date('2026-05-06T09:59:00.000Z'),
        reengagementStage: 1,
        suppressedUntil: null,
        nowUtc,
        thresholds,
      })
    ).toBe(2);

    expect(
      resolveNextReengagementStage({
        lastSeenAt: new Date('2026-05-06T08:59:00.000Z'),
        reengagementStage: 2,
        suppressedUntil: null,
        nowUtc,
        thresholds,
      })
    ).toBe(3);

    const scheduledAt = resolveReengagementScheduledAt({
      stage: 1,
      nowUtc,
      timezone: 'Europe/Moscow',
      localDevelopment: true,
    });

    expect(scheduledAt.getTime()).toBe(
      nowUtc.getTime() + MIN_FUTURE_SLOT_DELAY_MS
    );
  });
});
