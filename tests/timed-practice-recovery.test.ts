import { describe, expect, it } from 'vitest';
import {
  completeTimedPracticeRecoveryRecord,
  createTimedPracticeRecoveryRecord,
  getTimedPracticeElapsedMs,
  hasTimedPracticeReachedRequiredTime,
  pauseTimedPracticeRecoveryRecord,
  startTimedPracticeRecoveryRecord,
} from '../app/utils/timedPracticeRecovery';

describe('timedPracticeRecovery', () => {
  it('считает running elapsed по абсолютному времени и видит завершение', () => {
    const started = startTimedPracticeRecoveryRecord(
      createTimedPracticeRecoveryRecord(
        {
          id: 'roadmap:1:breathing',
          scope: 'roadmap',
          type: 'breathing',
          requiredSeconds: 300,
          attemptId: 1,
          actionId: 'breathing',
        },
        1_000
      ),
      1_000
    );

    expect(getTimedPracticeElapsedMs(started, 300_999)).toBe(299_999);
    expect(hasTimedPracticeReachedRequiredTime(started, 300_999)).toBe(false);
    expect(hasTimedPracticeReachedRequiredTime(started, 301_000)).toBe(true);
  });

  it('восстанавливает partial-progress без скрытого досчёта после pause', () => {
    const started = startTimedPracticeRecoveryRecord(
      createTimedPracticeRecoveryRecord(
        {
          id: 'roadmap:1:meditation',
          scope: 'roadmap',
          type: 'meditation',
          requiredSeconds: 480,
          attemptId: 1,
          actionId: 'meditation',
        },
        0
      ),
      0
    );

    const paused = pauseTimedPracticeRecoveryRecord(started, 120_000);

    expect(paused.running).toBe(false);
    expect(paused.startedAtMs).toBeNull();
    expect(getTimedPracticeElapsedMs(paused, 420_000)).toBe(120_000);
    expect(hasTimedPracticeReachedRequiredTime(paused, 420_000)).toBe(false);
  });

  it('не засчитывает время после явной паузы, но продолжает после resume', () => {
    const started = startTimedPracticeRecoveryRecord(
      createTimedPracticeRecoveryRecord(
        {
          id: 'free:breath_practice_completed:breath:box:2026-05-25',
          scope: 'free',
          type: 'breath_practice',
          requiredSeconds: 180,
          source: 'breath_practice_completed',
          sourceId: 'breath:box:2026-05-25',
        },
        0
      ),
      0
    );
    const paused = pauseTimedPracticeRecoveryRecord(started, 60_000);
    const resumed = startTimedPracticeRecoveryRecord(paused, 300_000);

    expect(getTimedPracticeElapsedMs(resumed, 419_999)).toBe(179_999);
    expect(hasTimedPracticeReachedRequiredTime(resumed, 419_999)).toBe(false);
    expect(hasTimedPracticeReachedRequiredTime(resumed, 420_000)).toBe(true);
  });

  it('фиксирует completed-состояние до серверного сохранения', () => {
    const started = startTimedPracticeRecoveryRecord(
      createTimedPracticeRecoveryRecord(
        {
          id: 'roadmap:2:meditation',
          scope: 'roadmap',
          type: 'meditation',
          requiredSeconds: 600,
          attemptId: 2,
          actionId: 'meditation',
        },
        0
      ),
      0
    );
    const completed = completeTimedPracticeRecoveryRecord(started, 100_000);

    expect(completed.running).toBe(false);
    expect(completed.accumulatedMs).toBe(600_000);
    expect(hasTimedPracticeReachedRequiredTime(completed, 100_000)).toBe(true);
  });
});
