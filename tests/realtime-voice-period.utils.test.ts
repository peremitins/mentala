import { describe, expect, it } from 'vitest';
import {
  isRealtimeVoiceSessionStale,
  resolveRealtimeVoiceQuotaPeriod,
} from '../server/application/realtime/realtime-voice-period.utils';

describe('realtime voice period utils', () => {
  it('сохраняет якорь месячного периода относительно access start', () => {
    const period = resolveRealtimeVoiceQuotaPeriod({
      accessPeriodStartedAt: new Date('2026-01-31T10:00:00.000Z'),
      now: new Date('2026-02-20T12:00:00.000Z'),
    });

    expect(period.startedAt.toISOString()).toBe('2026-01-31T10:00:00.000Z');
    expect(period.endsAt.toISOString()).toBe('2026-02-28T10:00:00.000Z');
  });

  it('переходит к следующему периоду после завершения предыдущего окна', () => {
    const period = resolveRealtimeVoiceQuotaPeriod({
      accessPeriodStartedAt: new Date('2026-01-31T10:00:00.000Z'),
      now: new Date('2026-03-02T12:00:00.000Z'),
    });

    expect(period.startedAt.toISOString()).toBe('2026-02-28T10:00:00.000Z');
    expect(period.endsAt.toISOString()).toBe('2026-03-28T10:00:00.000Z');
  });

  it('считает сессию stale по idle deadline с grace window', () => {
    const stale = isRealtimeVoiceSessionStale({
      startedAt: new Date('2026-03-10T10:00:00.000Z'),
      lastActivityAt: new Date('2026-03-10T10:05:00.000Z'),
      now: new Date('2026-03-10T10:06:31.000Z'),
      idleTimeoutSeconds: 60,
      hardCeilingSeconds: 3600,
      staleGraceSeconds: 30,
    });

    expect(stale).toBe(true);
  });

  it('не считает свежую сессию stale до истечения idle timeout', () => {
    const stale = isRealtimeVoiceSessionStale({
      startedAt: new Date('2026-03-10T10:00:00.000Z'),
      lastActivityAt: new Date('2026-03-10T10:05:00.000Z'),
      now: new Date('2026-03-10T10:05:45.000Z'),
      idleTimeoutSeconds: 60,
      hardCeilingSeconds: 3600,
      staleGraceSeconds: 30,
    });

    expect(stale).toBe(false);
  });
});
