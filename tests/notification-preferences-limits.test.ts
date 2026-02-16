import { describe, expect, it } from 'vitest';
import {
  clampNotificationTimesPerDay,
  DEFAULT_NOTIFICATION_TIMES_PER_DAY,
  MAX_NOTIFICATION_TIMES_PER_DAY,
  MIN_NOTIFICATION_TIMES_PER_DAY,
  normalizeCustomSlotTimesByLimit,
} from '../server/application/notifications/preferences-limits.utils';

describe('notification preferences limits', () => {
  it('ограничивает timesPerDay диапазоном 1..5', () => {
    expect(clampNotificationTimesPerDay(0)).toBe(
      MIN_NOTIFICATION_TIMES_PER_DAY
    );
    expect(clampNotificationTimesPerDay(2.6)).toBe(3);
    expect(clampNotificationTimesPerDay(99)).toBe(
      MAX_NOTIFICATION_TIMES_PER_DAY
    );
  });

  it('использует fallback для невалидного timesPerDay', () => {
    expect(clampNotificationTimesPerDay(undefined)).toBe(
      DEFAULT_NOTIFICATION_TIMES_PER_DAY
    );
    expect(clampNotificationTimesPerDay(Number.NaN)).toBe(
      DEFAULT_NOTIFICATION_TIMES_PER_DAY
    );
  });

  it('обрезает customSlotTimes по лимиту и округляет минуты', () => {
    const normalized = normalizeCustomSlotTimesByLimit(
      [540.2, 600.6, null, 700, 800, 900],
      5
    );

    expect(normalized).toEqual([540, 601, null, 700, 800]);
  });

  it('удаляет хвостовые null после обрезки customSlotTimes', () => {
    const normalized = normalizeCustomSlotTimesByLimit(
      [540, null, null, null, null],
      5
    );
    expect(normalized).toEqual([540]);

    const allNull = normalizeCustomSlotTimesByLimit([null, null], 5);
    expect(allNull).toBeNull();
  });
});
