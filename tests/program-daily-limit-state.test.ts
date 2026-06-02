import { describe, expect, it } from 'vitest';
import {
  getProgramDailyLimitRefreshDelayMs,
  getProgramDailyLimitResetMs,
  isProgramDailyLimitReachedAt,
} from '../app/composables/useProgramDailyLimit';
import type { ProgramDailyLimitDto } from '../shared/dto/retention';

const reachedLimit: ProgramDailyLimitDto = {
  dailyStepLimit: 2,
  stepsDoneToday: 2,
  nextResetAt: '2026-05-15T21:00:00.000Z',
};

describe('program daily limit client state', () => {
  it('считает лимит достигнутым только до nextResetAt', () => {
    expect(
      isProgramDailyLimitReachedAt(
        reachedLimit,
        new Date('2026-05-15T20:59:59.000Z').getTime()
      )
    ).toBe(true);

    expect(
      isProgramDailyLimitReachedAt(
        reachedLimit,
        new Date('2026-05-15T21:00:00.000Z').getTime()
      )
    ).toBe(false);
  });

  it('не блокирует пользователя stale-снимком после сброса', () => {
    expect(
      isProgramDailyLimitReachedAt(
        reachedLimit,
        new Date('2026-05-15T21:05:00.000Z').getTime()
      )
    ).toBe(false);
  });

  it('не считает лимит достигнутым без валидного nextResetAt', () => {
    expect(
      isProgramDailyLimitReachedAt(
        { ...reachedLimit, nextResetAt: null },
        new Date('2026-05-15T20:00:00.000Z').getTime()
      )
    ).toBe(false);

    expect(
      getProgramDailyLimitResetMs({
        ...reachedLimit,
        nextResetAt: 'not-a-date',
      })
    ).toBeNull();
  });

  it('планирует мягкий refresh на момент сброса с небольшим буфером', () => {
    const nowMs = new Date('2026-05-15T20:59:30.000Z').getTime();

    expect(getProgramDailyLimitRefreshDelayMs(reachedLimit, nowMs, 750)).toBe(
      30_750
    );
  });

  it('возвращает немедленный refresh, если nextResetAt уже прошёл', () => {
    const nowMs = new Date('2026-05-15T21:00:01.000Z').getTime();

    expect(getProgramDailyLimitRefreshDelayMs(reachedLimit, nowMs, 750)).toBe(
      0
    );
  });
});
