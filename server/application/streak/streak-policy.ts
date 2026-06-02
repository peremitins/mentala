import { shiftDateKey } from '@/server/application/programs/retention-timezone';

export const STREAK_REPAIR_LIMIT_PER_MONTH = 2;

export type StreakStatus = 'active' | 'paused';
export type StreakPauseReason = 'manual' | 'auto' | null;

export type StreakPolicyState = {
  current: number;
  best: number;
  status: StreakStatus;
  lastActivityDate: string | null;
  pausedSince: string | null;
  pauseReason: StreakPauseReason;
  repairPeriod: string;
  repairUsed: number;
};

export type StreakPolicyEventType =
  | 'started'
  | 'extended'
  | 'repaired'
  | 'paused_auto'
  | 'paused_manual'
  | 'resumed';

export type StreakPolicyEvent = {
  type: StreakPolicyEventType;
  eventDate: string;
  previousCurrent: number;
  current: number;
  repairedDays?: number;
  missedDays?: number;
};

export type StreakPolicyResult = {
  state: StreakPolicyState;
  event: StreakPolicyEvent | null;
};

export function getRepairPeriod(dateKey: string): string {
  return dateKey.slice(0, 7);
}

export function getRepairUsageForDate(
  state: StreakPolicyState,
  dateKey: string
) {
  const period = getRepairPeriod(dateKey);
  const used = state.repairPeriod === period ? state.repairUsed : 0;
  const remaining = Math.max(0, STREAK_REPAIR_LIMIT_PER_MONTH - used);
  return {
    limit: STREAK_REPAIR_LIMIT_PER_MONTH,
    period,
    remaining,
    used,
  };
}

export function countCalendarDaysBetween(
  fromDateKey: string,
  toDateKey: string
): number {
  const from = new Date(`${fromDateKey}T00:00:00Z`).getTime();
  const to = new Date(`${toDateKey}T00:00:00Z`).getTime();
  const diff = Math.round((to - from) / 86_400_000);
  return Number.isFinite(diff) ? diff : 0;
}

function normalizeState(state: StreakPolicyState): StreakPolicyState {
  const current = Math.max(0, Math.floor(state.current));
  const best = Math.max(current, Math.floor(state.best));
  return {
    ...state,
    best,
    current,
    repairPeriod:
      state.repairPeriod ||
      getRepairPeriod(state.lastActivityDate || new Date().toISOString()),
    repairUsed: Math.max(0, Math.floor(state.repairUsed)),
  };
}

function createInitialState(activityDate: string): StreakPolicyState {
  return {
    best: 1,
    current: 1,
    lastActivityDate: activityDate,
    pauseReason: null,
    pausedSince: null,
    repairPeriod: getRepairPeriod(activityDate),
    repairUsed: 0,
    status: 'active',
  };
}

export function recordStreakActivity(
  previousState: StreakPolicyState | null,
  activityDate: string
): StreakPolicyResult {
  if (!previousState || previousState.current <= 0) {
    const state = createInitialState(activityDate);
    return {
      event: {
        current: state.current,
        eventDate: activityDate,
        previousCurrent: 0,
        type: 'started',
      },
      state,
    };
  }

  const state = normalizeState(previousState);
  if (state.status === 'paused') {
    return { event: null, state };
  }

  if (!state.lastActivityDate) {
    const next = {
      ...state,
      best: Math.max(state.best, 1),
      current: 1,
      lastActivityDate: activityDate,
      repairPeriod: getRepairPeriod(activityDate),
      repairUsed: 0,
    };
    return {
      event: {
        current: next.current,
        eventDate: activityDate,
        previousCurrent: state.current,
        type: 'started',
      },
      state: next,
    };
  }

  const daysSinceLastActivity = countCalendarDaysBetween(
    state.lastActivityDate,
    activityDate
  );
  if (daysSinceLastActivity <= 0) {
    return { event: null, state };
  }

  const missedDays = Math.max(0, daysSinceLastActivity - 1);
  if (missedDays === 0) {
    const current = state.current + 1;
    const next = {
      ...state,
      best: Math.max(state.best, current),
      current,
      lastActivityDate: activityDate,
      repairPeriod: getRepairPeriod(activityDate),
    };
    return {
      event: {
        current: next.current,
        eventDate: activityDate,
        previousCurrent: state.current,
        type: 'extended',
      },
      state: next,
    };
  }

  const repair = getRepairUsageForDate(state, activityDate);
  if (missedDays <= repair.remaining) {
    const current = state.current + 1;
    const next = {
      ...state,
      best: Math.max(state.best, current),
      current,
      lastActivityDate: activityDate,
      repairPeriod: repair.period,
      repairUsed: repair.used + missedDays,
    };
    return {
      event: {
        current: next.current,
        eventDate: activityDate,
        missedDays,
        previousCurrent: state.current,
        repairedDays: missedDays,
        type: 'repaired',
      },
      state: next,
    };
  }

  const next = {
    ...state,
    pauseReason: 'auto' as const,
    pausedSince: shiftDateKey(state.lastActivityDate, 1),
    repairPeriod: repair.period,
    repairUsed: repair.used,
    status: 'paused' as const,
  };
  return {
    event: {
      current: next.current,
      eventDate: activityDate,
      missedDays,
      previousCurrent: state.current,
      type: 'paused_auto',
    },
    state: next,
  };
}

export function settleStreakForDate(
  previousState: StreakPolicyState,
  entryDate: string
): StreakPolicyResult {
  const state = normalizeState(previousState);
  if (state.status === 'paused' || !state.lastActivityDate) {
    return { event: null, state };
  }

  const daysSinceLastActivity = countCalendarDaysBetween(
    state.lastActivityDate,
    entryDate
  );
  const missedDays = Math.max(0, daysSinceLastActivity - 1);
  const repair = getRepairUsageForDate(state, entryDate);
  if (missedDays <= repair.remaining) {
    return { event: null, state };
  }

  const next = {
    ...state,
    pauseReason: 'auto' as const,
    pausedSince: shiftDateKey(state.lastActivityDate, 1),
    repairPeriod: repair.period,
    repairUsed: repair.used,
    status: 'paused' as const,
  };
  return {
    event: {
      current: next.current,
      eventDate: entryDate,
      missedDays,
      previousCurrent: state.current,
      type: 'paused_auto',
    },
    state: next,
  };
}

export function pauseStreak(
  previousState: StreakPolicyState,
  entryDate: string
): StreakPolicyResult {
  const state = normalizeState(previousState);
  if (state.status === 'paused' && state.pauseReason === 'manual') {
    return { event: null, state };
  }

  const next = {
    ...state,
    pauseReason: 'manual' as const,
    pausedSince: state.pausedSince ?? entryDate,
    status: 'paused' as const,
  };
  return {
    event: {
      current: next.current,
      eventDate: entryDate,
      previousCurrent: state.current,
      type: 'paused_manual',
    },
    state: next,
  };
}

export function resumeStreak(
  previousState: StreakPolicyState,
  entryDate: string
): StreakPolicyResult {
  const state = normalizeState(previousState);
  if (state.status === 'active') {
    return { event: null, state };
  }

  const next = {
    ...state,
    lastActivityDate: shiftDateKey(entryDate, -1),
    pauseReason: null,
    pausedSince: null,
    repairPeriod: getRepairPeriod(entryDate),
    status: 'active' as const,
  };
  return {
    event: {
      current: next.current,
      eventDate: entryDate,
      previousCurrent: state.current,
      type: 'resumed',
    },
    state: next,
  };
}
