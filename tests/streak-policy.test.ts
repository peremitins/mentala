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

  it('начинает новую серию после пропущенных дней', () => {
    const result = recordStreakActivity(activeState(), '2026-05-13');

    expect(STREAK_REPAIR_LIMIT_PER_MONTH).toBe(2);
    expect(result.state.current).toBe(1);
    expect(result.state.best).toBe(7);
    expect(result.state.repairUsed).toBe(0);
    expect(result.state.lastActivityDate).toBe('2026-05-13');
    expect(result.event).toMatchObject({
      type: 'started',
      previousCurrent: 4,
      current: 1,
    });
  });

  it('не ставит auto-pause после пропуска, если пользователь вернулся активностью', () => {
    const result = recordStreakActivity(
      activeState({ repairUsed: 1 }),
      '2026-05-13'
    );

    expect(result.state.current).toBe(1);
    expect(result.state.status).toBe('active');
    expect(result.state.pausedSince).toBeNull();
    expect(result.state.pauseReason).toBeNull();
    expect(result.event?.type).toBe('started');
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

  it('после resume не увеличивает streak первой активностью дня', () => {
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
    expect(result.state.current).toBe(4);
    expect(result.event).toBeNull();
  });

  it('после resume продлевает streak активностью на следующий локальный день', () => {
    const resumed = resumeStreak(
      activeState({
        status: 'paused',
        pausedSince: '2026-05-11',
        pauseReason: 'manual',
      }),
      '2026-05-20'
    );
    const result = recordStreakActivity(resumed.state, '2026-05-21');

    expect(resumed.event?.type).toBe('resumed');
    expect(result.state.current).toBe(5);
    expect(result.event?.type).toBe('extended');
  });

  it('начинает новую серию при пропуске на переходе месяца', () => {
    const result = recordStreakActivity(
      activeState({
        lastActivityDate: '2026-05-31',
        repairPeriod: '2026-05',
        repairUsed: 2,
      }),
      '2026-06-02'
    );

    expect(result.state.current).toBe(1);
    expect(result.state.repairPeriod).toBe('2026-06');
    expect(result.state.repairUsed).toBe(0);
    expect(result.event?.type).toBe('started');
  });

  it('оставляет пропущенные дни пропусками и начинает новую серию', () => {
    const result = recordStreakActivity(
      activeState({
        current: 1,
        best: 3,
        lastActivityDate: '2026-06-02',
        repairPeriod: '2026-06',
      }),
      '2026-06-05'
    );

    expect(result.state.current).toBe(1);
    expect(result.state.best).toBe(3);
    expect(result.event).toMatchObject({
      type: 'started',
      previousCurrent: 1,
      current: 1,
    });
  });
});
