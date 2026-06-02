import { describe, expect, it } from 'vitest';
import {
  STREAK_REPAIR_LIMIT_PER_MONTH,
  recordStreakActivity,
  resumeStreak,
  settleStreakForDate,
  type StreakPolicyState,
} from '../server/application/streak/streak-policy';

function activeState(
  overrides: Partial<StreakPolicyState> = {}
): StreakPolicyState {
  return {
    current: 4,
    best: 7,
    status: 'active',
    lastActivityDate: '2026-05-10',
    pausedSince: null,
    pauseReason: null,
    repairPeriod: '2026-05',
    repairUsed: 0,
    ...overrides,
  };
}

describe('streak policy', () => {
  it('стартует streak с первой активности пользователя', () => {
    const result = recordStreakActivity(null, '2026-05-10');

    expect(result.state).toMatchObject({
      current: 1,
      best: 1,
      status: 'active',
      lastActivityDate: '2026-05-10',
      repairPeriod: '2026-05',
      repairUsed: 0,
    });
    expect(result.event?.type).toBe('started');
  });

  it('не увеличивает streak повторной активностью в тот же день', () => {
    const result = recordStreakActivity(activeState(), '2026-05-10');

    expect(result.state.current).toBe(4);
    expect(result.state.best).toBe(7);
    expect(result.event).toBeNull();
  });

  it('продлевает streak активностью на следующий локальный день', () => {
    const result = recordStreakActivity(activeState(), '2026-05-11');

    expect(result.state.current).toBe(5);
    expect(result.state.best).toBe(7);
    expect(result.state.lastActivityDate).toBe('2026-05-11');
    expect(result.event?.type).toBe('extended');
  });

  it('сохраняет streak утром до новой активности', () => {
    const result = settleStreakForDate(activeState(), '2026-05-11');

    expect(result.state.current).toBe(4);
    expect(result.state.status).toBe('active');
    expect(result.event).toBeNull();
  });

  it('автоматически чинит один или два пропущенных дня в рамках месячной квоты', () => {
    const result = recordStreakActivity(activeState(), '2026-05-13');

    expect(STREAK_REPAIR_LIMIT_PER_MONTH).toBe(2);
    expect(result.state.current).toBe(5);
    expect(result.state.repairUsed).toBe(2);
    expect(result.state.lastActivityDate).toBe('2026-05-13');
    expect(result.event).toMatchObject({
      type: 'repaired',
      repairedDays: 2,
    });
  });

  it('ставит streak на auto-pause, если пропуск больше доступных repairs', () => {
    const result = recordStreakActivity(
      activeState({ repairUsed: 1 }),
      '2026-05-13'
    );

    expect(result.state.current).toBe(4);
    expect(result.state.status).toBe('paused');
    expect(result.state.pausedSince).toBe('2026-05-11');
    expect(result.state.pauseReason).toBe('auto');
    expect(result.event?.type).toBe('paused_auto');
  });

  it('не растит streak во время ручной паузы до явного resume', () => {
    const result = recordStreakActivity(
      activeState({
        status: 'paused',
        pausedSince: '2026-05-11',
        pauseReason: 'manual',
      }),
      '2026-05-12'
    );

    expect(result.state.current).toBe(4);
    expect(result.state.lastActivityDate).toBe('2026-05-10');
    expect(result.event).toBeNull();
  });

  it('после resume продолжает streak с первой активности дня', () => {
    const resumed = resumeStreak(
      activeState({
        status: 'paused',
        pausedSince: '2026-05-11',
        pauseReason: 'manual',
      }),
      '2026-05-20'
    );
    const result = recordStreakActivity(resumed.state, '2026-05-20');

    expect(resumed.event?.type).toBe('resumed');
    expect(result.state.current).toBe(5);
    expect(result.event?.type).toBe('extended');
  });

  it('сбрасывает месячную repair-квоту при переходе в новый месяц', () => {
    const result = recordStreakActivity(
      activeState({
        lastActivityDate: '2026-05-31',
        repairPeriod: '2026-05',
        repairUsed: 2,
      }),
      '2026-06-02'
    );

    expect(result.state.current).toBe(5);
    expect(result.state.repairPeriod).toBe('2026-06');
    expect(result.state.repairUsed).toBe(1);
    expect(result.event?.type).toBe('repaired');
  });
});
