import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  energyEvents,
  moodCheckins,
  userStreakEvents,
  userStreaks,
} from '@/server/infrastructure/db/schema';
import {
  getLocalDateKey,
  shiftDateKey,
} from '@/server/application/programs/retention-timezone';
import {
  STREAK_REPAIR_LIMIT_PER_MONTH,
  getRepairPeriod,
  getRepairUsageForDate,
  pauseStreak,
  recordStreakActivity,
  resumeStreak,
  settleStreakForDate,
  type StreakPolicyEvent,
  type StreakPolicyState,
} from '@/server/application/streak/streak-policy';
import type {
  StreakDayDto,
  StreakHistoryResponseDto,
  StreakSummaryDto,
} from '@/shared/dto/retention';

type StreakRow = typeof userStreaks.$inferSelect;
type StreakEventRow = typeof userStreakEvents.$inferSelect;

export type StreakActivitySource =
  | 'mood_checkin'
  | 'thought_saved'
  | 'free_practice'
  | 'program_step_complete';

function toPolicyState(row: StreakRow): StreakPolicyState {
  return {
    best: row.best,
    current: row.current,
    lastActivityDate: row.lastActivityDate,
    pauseReason:
      row.pauseReason === 'manual' || row.pauseReason === 'auto'
        ? row.pauseReason
        : null,
    pausedSince: row.pausedSince,
    repairPeriod: row.repairPeriod,
    repairUsed: row.repairUsed,
    status: row.status === 'paused' ? 'paused' : 'active',
  };
}

function emptyPolicyState(entryDate: string): StreakPolicyState {
  return {
    best: 0,
    current: 0,
    lastActivityDate: null,
    pauseReason: null,
    pausedSince: null,
    repairPeriod: getRepairPeriod(entryDate),
    repairUsed: 0,
    status: 'active',
  };
}

function eventMetadata(
  event: StreakPolicyEvent,
  base: Record<string, unknown>
): Record<string, unknown> {
  const metadata = { ...base };
  if (event.repairedDays && event.repairedDays > 0) {
    metadata.repairDates = Array.from(
      { length: event.repairedDays },
      (_, index) =>
        shiftDateKey(event.eventDate, -(event.repairedDays! - index))
    );
  }
  return metadata;
}

async function persistStreakResult(
  userId: number,
  result: {
    state: StreakPolicyState;
    event: StreakPolicyEvent | null;
  },
  metadata: Record<string, unknown> = {}
) {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .insert(userStreaks)
      .values({
        userId,
        best: result.state.best,
        current: result.state.current,
        lastActivityDate: result.state.lastActivityDate,
        metadata: {},
        pauseReason: result.state.pauseReason,
        pausedSince: result.state.pausedSince,
        repairPeriod: result.state.repairPeriod,
        repairUsed: result.state.repairUsed,
        status: result.state.status,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userStreaks.userId,
        set: {
          best: result.state.best,
          current: result.state.current,
          lastActivityDate: result.state.lastActivityDate,
          pauseReason: result.state.pauseReason,
          pausedSince: result.state.pausedSince,
          repairPeriod: result.state.repairPeriod,
          repairUsed: result.state.repairUsed,
          status: result.state.status,
          updatedAt: now,
        },
      });

    if (!result.event) return;

    await tx.insert(userStreakEvents).values({
      userId,
      current: result.event.current,
      eventDate: result.event.eventDate,
      metadata: eventMetadata(result.event, metadata),
      missedDays: result.event.missedDays ?? null,
      previousCurrent: result.event.previousCurrent,
      repairedDays: result.event.repairedDays ?? null,
      type: result.event.type,
    });
  });
}

async function getPolicyState(
  userId: number
): Promise<StreakPolicyState | null> {
  const [row] = await db
    .select()
    .from(userStreaks)
    .where(eq(userStreaks.userId, userId))
    .limit(1);
  return row ? toPolicyState(row) : null;
}

function dateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    dates.push(cursor);
    cursor = shiftDateKey(cursor, 1);
  }
  return dates;
}

async function getActiveDatesForRange(
  userId: number,
  startDate: string,
  endDate: string
): Promise<Set<string>> {
  const [energyRows, moodRows] = await Promise.all([
    db
      .select({ date: energyEvents.eventDate })
      .from(energyEvents)
      .where(
        and(
          eq(energyEvents.userId, userId),
          gte(energyEvents.eventDate, startDate),
          lte(energyEvents.eventDate, endDate)
        )
      ),
    db
      .select({ date: moodCheckins.entryDate })
      .from(moodCheckins)
      .where(
        and(
          eq(moodCheckins.userId, userId),
          gte(moodCheckins.entryDate, startDate),
          lte(moodCheckins.entryDate, endDate)
        )
      ),
  ]);

  return new Set([
    ...energyRows.map((row) => row.date),
    ...moodRows.map((row) => row.date),
  ]);
}

async function getEventsForRange(
  userId: number,
  startDate: string,
  endDate: string
) {
  return db
    .select()
    .from(userStreakEvents)
    .where(
      and(
        eq(userStreakEvents.userId, userId),
        gte(userStreakEvents.eventDate, startDate),
        lte(userStreakEvents.eventDate, endDate)
      )
    )
    .orderBy(asc(userStreakEvents.eventDate), asc(userStreakEvents.id));
}

function repairedDateSet(events: StreakEventRow[]): Set<string> {
  const dates = new Set<string>();
  for (const event of events) {
    const repairDates = Array.isArray(event.metadata?.repairDates)
      ? event.metadata.repairDates
      : [];
    for (const date of repairDates) {
      if (typeof date === 'string') dates.add(date);
    }
  }
  return dates;
}

function dayStatus(params: {
  activeDates: Set<string>;
  entryDate: string;
  date: string;
  repairedDates: Set<string>;
  state: StreakPolicyState;
}): StreakDayDto {
  const active = params.activeDates.has(params.date);
  if (params.date === params.entryDate) {
    return { active, date: params.date, status: 'today' };
  }
  if (active) {
    return { active: true, date: params.date, status: 'active' };
  }
  if (params.repairedDates.has(params.date)) {
    return { active: false, date: params.date, status: 'repaired' };
  }
  if (
    params.state.status === 'paused' &&
    params.state.pausedSince &&
    params.date >= params.state.pausedSince
  ) {
    return { active: false, date: params.date, status: 'paused' };
  }
  return { active: false, date: params.date, status: 'missed' };
}

function noticeFromEvent(
  event: StreakEventRow | null
): StreakSummaryDto['notice'] {
  if (!event) return null;
  if (event.type === 'repaired') {
    return {
      type: 'repaired',
      title: 'Серия сохранена',
      text: 'Мы мягко сохранили пропущенный день, чтобы серия продолжилась.',
    };
  }
  if (event.type === 'paused_auto') {
    return {
      type: 'paused_auto',
      title: 'Серия на паузе',
      text: 'Мы поставили серию на паузу, чтобы не превращать пропуск в потерю прогресса.',
    };
  }
  if (event.type === 'paused_manual') {
    return {
      type: 'paused_manual',
      title: 'Пауза включена',
      text: 'Серия сохранится на месте, пока ты не вернёшься к ритму.',
    };
  }
  if (event.type === 'resumed') {
    return {
      type: 'resumed',
      title: 'Пауза снята',
      text: 'Следующая активность продолжит серию с текущего значения.',
    };
  }
  return null;
}

async function buildSummary(
  userId: number,
  entryDate: string,
  state: StreakPolicyState
): Promise<StreakSummaryDto> {
  const weekStart = shiftDateKey(entryDate, -6);
  const [activeDates, events, latestEvents] = await Promise.all([
    getActiveDatesForRange(userId, weekStart, entryDate),
    getEventsForRange(userId, weekStart, entryDate),
    db
      .select()
      .from(userStreakEvents)
      .where(eq(userStreakEvents.userId, userId))
      .orderBy(desc(userStreakEvents.createdAt), desc(userStreakEvents.id))
      .limit(1),
  ]);
  const repairedDates = repairedDateSet(events);
  const weekDetails = dateRange(weekStart, entryDate).map((date) =>
    dayStatus({ activeDates, date, entryDate, repairedDates, state })
  );
  const repair = getRepairUsageForDate(state, entryDate);

  return {
    best: state.best,
    current: state.current,
    notice: noticeFromEvent(latestEvents[0] ?? null),
    pausedSince: state.pausedSince,
    repair: {
      limit: STREAK_REPAIR_LIMIT_PER_MONTH,
      period: repair.period,
      remaining: repair.remaining,
      used: repair.used,
    },
    status: state.status,
    week: weekDetails.map((day) => day.active || day.status === 'repaired'),
    weekDetails,
  };
}

// Внутренняя функция: settle + buildSummary. Принимает rawState чтобы избежать
// повторного getPolicyState когда state уже загружен вызывающим (getStreakHistory).
async function getStreakSummaryWithState(
  userId: number,
  entryDate: string,
  rawState?: StreakPolicyState | null
): Promise<{ summary: StreakSummaryDto; settledState: StreakPolicyState }> {
  const currentState =
    rawState !== undefined
      ? (rawState ?? emptyPolicyState(entryDate))
      : ((await getPolicyState(userId)) ?? emptyPolicyState(entryDate));
  const settled = settleStreakForDate(currentState, entryDate);
  if (settled.event) {
    await persistStreakResult(userId, settled, { source: 'summary_settle' });
  }
  const summary = await buildSummary(userId, entryDate, settled.state);
  return { summary, settledState: settled.state };
}

export async function getStreakSummary(
  userId: number,
  entryDate: string
): Promise<StreakSummaryDto> {
  const { summary } = await getStreakSummaryWithState(userId, entryDate);
  return summary;
}

export async function recordStreakActivityForDate(params: {
  userId: number;
  entryDate: string;
  source: StreakActivitySource;
  sourceId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<StreakSummaryDto> {
  const currentState = await getPolicyState(params.userId);
  const result = recordStreakActivity(currentState, params.entryDate);
  await persistStreakResult(params.userId, result, {
    ...(params.metadata ?? {}),
    source: params.source,
    sourceId: params.sourceId ?? null,
  });
  return buildSummary(params.userId, params.entryDate, result.state);
}

export async function pauseUserStreak(
  userId: number,
  entryDate: string
): Promise<StreakSummaryDto> {
  const currentState =
    (await getPolicyState(userId)) ?? emptyPolicyState(entryDate);
  const result = pauseStreak(currentState, entryDate);
  await persistStreakResult(userId, result, { source: 'manual_pause' });
  return buildSummary(userId, entryDate, result.state);
}

export async function resumeUserStreak(
  userId: number,
  entryDate: string
): Promise<StreakSummaryDto> {
  const currentState =
    (await getPolicyState(userId)) ?? emptyPolicyState(entryDate);
  const result = resumeStreak(currentState, entryDate);
  await persistStreakResult(userId, result, { source: 'manual_resume' });
  return buildSummary(userId, entryDate, result.state);
}

export async function getStreakHistory(params: {
  userId: number;
  entryDate: string;
  days?: number;
}): Promise<StreakHistoryResponseDto> {
  const days = Math.max(14, Math.min(180, params.days ?? 84));
  const startDate = shiftDateKey(params.entryDate, -(days - 1));
  // getPolicyState — один раз на весь flow. settledState передаётся в calendarDays
  // вместо второго getPolicyState (старый код делал его дважды).
  const rawState = await getPolicyState(params.userId);
  const { summary, settledState } = await getStreakSummaryWithState(
    params.userId,
    params.entryDate,
    rawState
  );
  const [activeDates, events, timelineEvents] = await Promise.all([
    getActiveDatesForRange(params.userId, startDate, params.entryDate),
    getEventsForRange(params.userId, startDate, params.entryDate),
    db
      .select()
      .from(userStreakEvents)
      .where(eq(userStreakEvents.userId, params.userId))
      .orderBy(desc(userStreakEvents.createdAt), desc(userStreakEvents.id))
      .limit(50),
  ]);
  const state = settledState;
  const repairedDates = repairedDateSet(events);
  const calendarDays = dateRange(startDate, params.entryDate).map((date) =>
    dayStatus({
      activeDates,
      date,
      entryDate: params.entryDate,
      repairedDates,
      state,
    })
  );

  return {
    calendarDays,
    events: timelineEvents.map((event) => ({
      createdAt: event.createdAt.toISOString(),
      eventDate: event.eventDate,
      id: event.id,
      metadata: event.metadata,
      type: event.type as StreakHistoryResponseDto['events'][number]['type'],
    })),
    summary,
  };
}

export async function buildBackfillStateForUser(userId: number) {
  const [energyRows, moodRows] = await Promise.all([
    db
      .select({ date: energyEvents.eventDate })
      .from(energyEvents)
      .where(eq(energyEvents.userId, userId)),
    db
      .select({ date: moodCheckins.entryDate })
      .from(moodCheckins)
      .where(eq(moodCheckins.userId, userId)),
  ]);
  const dates = Array.from(
    new Set([
      ...energyRows.map((row) => row.date),
      ...moodRows.map((row) => row.date),
    ])
  ).sort();

  let current = 0;
  let best = 0;
  let lastDate: string | null = null;
  for (const date of dates) {
    if (lastDate && shiftDateKey(lastDate, 1) === date) {
      current += 1;
    } else {
      current = 1;
    }
    best = Math.max(best, current);
    lastDate = date;
  }

  if (!lastDate) return null;
  return {
    best,
    current,
    lastActivityDate: lastDate,
    pauseReason: null,
    pausedSince: null,
    repairPeriod: getRepairPeriod(lastDate),
    repairUsed: 0,
    status: 'active' as const,
  };
}

export async function backfillUserStreak(userId: number): Promise<boolean> {
  const state = await buildBackfillStateForUser(userId);
  if (!state) return false;
  await persistStreakResult(
    userId,
    {
      event: {
        current: state.current,
        eventDate: state.lastActivityDate!,
        previousCurrent: 0,
        type: 'started',
      },
      state,
    },
    { source: 'backfill' }
  );
  return true;
}

export function getTodayDateKey(timezone: string): string {
  return getLocalDateKey(new Date(), timezone);
}
