import { describe, expect, it } from 'vitest';
import {
  diffDateKeys,
  getDailyStepLimitForProgramDay,
  getLocalDateKey,
  getDevDailyLimitCycleState,
  getNextDailyResetAt,
  nextLocalMidnight,
  shiftDateKey,
} from '../server/application/programs/retention-timezone';

/**
 * Тесты timezone-aware хелперов для daily limit «2 шага в день».
 *
 * Сценарий: пользователь в `Asia/Yangon` (+06:30) сделал 2 шага.
 * `countCompletedProgramStepsForDate` считает по `entry_date = '2026-05-15'` (его
 * локальная дата). `nextLocalMidnight('2026-05-15', 'Asia/Yangon')` должен
 * вернуть UTC-момент **локальной** полуночи 16 мая в Янгоне — то есть
 * 2026-05-15T17:30:00Z (а не глобальную UTC-полночь 2026-05-16T00:00).
 *
 * Без этих тестов timezone-баги могут оставаться скрытыми до production-инцидента
 * (см. retention/retention_long_term_strategy.md — backend проверка локального дня).
 */

describe('retention timezone helpers', () => {
  describe('getLocalDateKey', () => {
    it('возвращает локальную дату для Europe/Moscow (+03:00)', () => {
      // 2026-05-15T22:30:00Z = 2026-05-16 01:30 Moscow
      const utcLateEvening = new Date('2026-05-15T22:30:00Z');
      expect(getLocalDateKey(utcLateEvening, 'Europe/Moscow')).toBe(
        '2026-05-16'
      );
    });

    it('возвращает локальную дату для America/New_York с учётом DST', () => {
      // 2026-03-15 в США DST уже активен с 2026-03-08 → GMT-04:00.
      // 2026-03-15T03:30:00Z = 2026-03-14 23:30 New York.
      const beforeMidnightNy = new Date('2026-03-15T03:30:00Z');
      expect(getLocalDateKey(beforeMidnightNy, 'America/New_York')).toBe(
        '2026-03-14'
      );
    });

    it('возвращает UTC-день для UTC timezone', () => {
      const utc = new Date('2026-05-15T12:00:00Z');
      expect(getLocalDateKey(utc, 'UTC')).toBe('2026-05-15');
    });

    it('подхватывает дефолтную таймзону Europe/Moscow при пустом параметре', () => {
      // 2026-05-15T22:30:00Z = 2026-05-16 01:30 Moscow → дата уже завтрашняя.
      const utcLateEvening = new Date('2026-05-15T22:30:00Z');
      expect(getLocalDateKey(utcLateEvening, undefined)).toBe('2026-05-16');
      expect(getLocalDateKey(utcLateEvening, null)).toBe('2026-05-16');
      expect(getLocalDateKey(utcLateEvening, '')).toBe('2026-05-16');
    });
  });

  describe('shiftDateKey', () => {
    it('сдвигает на +1 день', () => {
      expect(shiftDateKey('2026-05-15', 1)).toBe('2026-05-16');
    });

    it('корректно переходит через границу месяца', () => {
      expect(shiftDateKey('2026-01-31', 1)).toBe('2026-02-01');
      expect(shiftDateKey('2026-02-28', 1)).toBe('2026-03-01');
    });

    it('обрабатывает високосный год корректно', () => {
      // 2028 — високосный.
      expect(shiftDateKey('2028-02-28', 1)).toBe('2028-02-29');
      expect(shiftDateKey('2028-02-29', 1)).toBe('2028-03-01');
    });

    it('обрабатывает границу года', () => {
      expect(shiftDateKey('2026-12-31', 1)).toBe('2027-01-01');
    });

    it('поддерживает отрицательное смещение', () => {
      expect(shiftDateKey('2026-05-15', -1)).toBe('2026-05-14');
      expect(shiftDateKey('2026-01-01', -1)).toBe('2025-12-31');
    });
  });

  describe('nextLocalMidnight', () => {
    it('Europe/Moscow (+03:00) — целое смещение часов', () => {
      // Локальная полночь 2026-05-16 в Москве = 2026-05-15T21:00:00Z.
      const result = nextLocalMidnight('2026-05-15', 'Europe/Moscow');
      expect(result.toISOString()).toBe('2026-05-15T21:00:00.000Z');
    });

    it('UTC — 00:00 ровно следующего дня', () => {
      const result = nextLocalMidnight('2026-05-15', 'UTC');
      expect(result.toISOString()).toBe('2026-05-16T00:00:00.000Z');
    });

    it('Asia/Yangon (+06:30) — половинное смещение', () => {
      // Локальная полночь 2026-05-16 в Янгоне = 2026-05-15T17:30:00Z.
      const result = nextLocalMidnight('2026-05-15', 'Asia/Yangon');
      expect(result.toISOString()).toBe('2026-05-15T17:30:00.000Z');
    });

    it('Asia/Kolkata (+05:30) — половинное смещение', () => {
      // Локальная полночь 2026-05-16 в Дели = 2026-05-15T18:30:00Z.
      const result = nextLocalMidnight('2026-05-15', 'Asia/Kolkata');
      expect(result.toISOString()).toBe('2026-05-15T18:30:00.000Z');
    });

    it('Pacific/Chatham — четвертьчасовое смещение :45', () => {
      // В мае Chatham (Новая Зеландия) вне DST — GMT+12:45.
      // Локальная полночь 2026-05-16 = 2026-05-15T11:15:00Z.
      const result = nextLocalMidnight('2026-05-15', 'Pacific/Chatham');
      expect(result.toISOString()).toBe('2026-05-15T11:15:00.000Z');
    });

    it('America/New_York корректно работает в DST (GMT-04:00)', () => {
      // Лето 2026 в New York: DST активен, GMT-04:00.
      // Локальная полночь 2026-07-16 = 2026-07-16T04:00:00Z.
      const result = nextLocalMidnight('2026-07-15', 'America/New_York');
      expect(result.toISOString()).toBe('2026-07-16T04:00:00.000Z');
    });

    it('America/New_York корректно работает вне DST (GMT-05:00)', () => {
      // Зима: DST неактивен, GMT-05:00.
      // Локальная полночь 2026-01-16 = 2026-01-16T05:00:00Z.
      const result = nextLocalMidnight('2026-01-15', 'America/New_York');
      expect(result.toISOString()).toBe('2026-01-16T05:00:00.000Z');
    });

    it('Возвращает Date в future относительно начала entryDate', () => {
      // Sanity: полученная полночь всегда позже момента начала entryDate в UTC.
      // Это гарантирует, что клиент покажет позитивный countdown.
      const cases = [
        ['2026-05-15', 'Europe/Moscow'],
        ['2026-05-15', 'Asia/Yangon'],
        ['2026-05-15', 'America/New_York'],
        ['2026-05-15', 'UTC'],
      ] as const;
      for (const [entryDate, tz] of cases) {
        const result = nextLocalMidnight(entryDate, tz);
        // entry day starts at UTC 00:00; next local midnight всегда позже него.
        const entryDayStartUtc = new Date(`${entryDate}T00:00:00Z`).getTime();
        expect(result.getTime()).toBeGreaterThan(entryDayStartUtc);
      }
    });

    it('При невалидной/пустой таймзоне fallback на Europe/Moscow', () => {
      // Защитное поведение: пустая строка обрабатывается как DEFAULT_TIMEZONE.
      const result = nextLocalMidnight('2026-05-15', '');
      expect(result.toISOString()).toBe('2026-05-15T21:00:00.000Z');
    });
  });

  describe('getNextDailyResetAt (dev-override через windowMs)', () => {
    it('В prod-режиме (windowMs=0) — локальная полночь следующего дня', () => {
      // 2026-05-15 23:30 Moscow = 2026-05-15T20:30:00Z. Next midnight Moscow
      // = 2026-05-15T21:00:00Z.
      const now = new Date('2026-05-15T20:30:00Z');
      const result = getNextDailyResetAt(now, 'Europe/Moscow', 0);
      expect(result.toISOString()).toBe('2026-05-15T21:00:00.000Z');
    });

    it('В dev-режиме (windowMs=60000) — now + 1 минута', () => {
      const now = new Date('2026-05-15T12:00:00Z');
      const result = getNextDailyResetAt(now, 'Europe/Moscow', 60_000);
      expect(result.toISOString()).toBe('2026-05-15T12:01:00.000Z');
    });

    it('В dev-режиме игнорируется timezone (cooldown, не calendar)', () => {
      const now = new Date('2026-05-15T12:00:00Z');
      const tokyo = getNextDailyResetAt(now, 'Asia/Tokyo', 60_000);
      const moscow = getNextDailyResetAt(now, 'Europe/Moscow', 60_000);
      // В cooldown-режиме timezone не влияет — обе должны быть равны.
      expect(tokyo.toISOString()).toBe(moscow.toISOString());
    });

    it('Произвольный dev-windowMs (5 минут)', () => {
      const now = new Date('2026-05-15T12:00:00Z');
      const result = getNextDailyResetAt(now, 'UTC', 5 * 60_000);
      expect(result.toISOString()).toBe('2026-05-15T12:05:00.000Z');
    });

    it('windowMs=0 эквивалентен undefined (читает env)', () => {
      // Sanity: явное windowMs=0 ведёт себя как production, не пытается
      // переключиться в cooldown-режим.
      const now = new Date('2026-05-15T12:00:00Z');
      const result = getNextDailyResetAt(now, 'UTC', 0);
      // Локальная полночь следующего дня в UTC = 2026-05-16T00:00:00Z.
      expect(result.toISOString()).toBe('2026-05-16T00:00:00.000Z');
    });
  });

  describe('getDevDailyLimitCycleState', () => {
    it('включает cooldown после каждой пары завершённых шагов', () => {
      const state = getDevDailyLimitCycleState({
        completedCount: 2,
        latestCompletedAt: new Date('2026-05-15T12:00:00Z'),
        now: new Date('2026-05-15T12:00:30Z'),
        dailyStepLimit: 2,
        windowMs: 60_000,
      });

      expect(state.stepsDoneToday).toBe(2);
      expect(state.nextResetAt?.toISOString()).toBe('2026-05-15T12:01:00.000Z');
    });

    it('после cooldown начинает новый quota-cycle с нуля', () => {
      const state = getDevDailyLimitCycleState({
        completedCount: 2,
        latestCompletedAt: new Date('2026-05-15T12:00:00Z'),
        now: new Date('2026-05-15T12:01:01Z'),
        dailyStepLimit: 2,
        windowMs: 60_000,
      });

      expect(state.stepsDoneToday).toBe(0);
      expect(state.nextResetAt).toBeNull();
    });

    it('не сбрасывает первый шаг цикла из-за длинной timed-практики', () => {
      const state = getDevDailyLimitCycleState({
        completedCount: 3,
        latestCompletedAt: new Date('2026-05-15T12:10:00Z'),
        now: new Date('2026-05-15T12:15:00Z'),
        dailyStepLimit: 2,
        windowMs: 60_000,
      });

      expect(state.stepsDoneToday).toBe(1);
      expect(state.nextResetAt).toBeNull();
    });
  });

  describe('diffDateKeys', () => {
    it('считает разницу дней между датами', () => {
      expect(diffDateKeys('2026-05-15', '2026-05-15')).toBe(0);
      expect(diffDateKeys('2026-05-15', '2026-05-16')).toBe(1);
      expect(diffDateKeys('2026-05-15', '2026-05-17')).toBe(2);
    });

    it('работает через границу месяца и года', () => {
      expect(diffDateKeys('2026-05-31', '2026-06-01')).toBe(1);
      expect(diffDateKeys('2025-12-31', '2026-01-01')).toBe(1);
    });

    it('возвращает отрицательное значение для прошлых дат', () => {
      expect(diffDateKeys('2026-05-16', '2026-05-15')).toBe(-1);
    });
  });

  describe('getDailyStepLimitForProgramDay', () => {
    it('даёт 3 шага в первые два дня программы', () => {
      expect(getDailyStepLimitForProgramDay(0)).toBe(3);
      expect(getDailyStepLimitForProgramDay(1)).toBe(3);
    });

    it('даёт базовые 2 шага с третьего дня и далее', () => {
      expect(getDailyStepLimitForProgramDay(2)).toBe(2);
      expect(getDailyStepLimitForProgramDay(10)).toBe(2);
      expect(getDailyStepLimitForProgramDay(365)).toBe(2);
    });

    it('приводит некорректные индексы к дню 0 (стартовый лимит)', () => {
      expect(getDailyStepLimitForProgramDay(-1)).toBe(3);
      expect(getDailyStepLimitForProgramDay(Number.NaN)).toBe(3);
      expect(getDailyStepLimitForProgramDay(1.9)).toBe(3);
    });
  });
});
