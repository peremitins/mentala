import { nanoid } from 'nanoid';
import { and, asc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  notificationSlots,
  sessionSummariesUser,
  userDevices,
  userEngagementState,
  users,
} from '@/server/infrastructure/db/schema';
import type { NotificationPayload } from '@/shared/dto/notifications';
import { isValidTimezone } from '@/server/application/notifications/timezone.utils';
import {
  DEFAULT_SYSTEM_NOTIFICATION_TIMEZONE,
  getReengagementThresholds,
  resolveReengagementScheduledAt,
  resolveNextReengagementStage,
  resolveSummaryReadyScheduledAt,
} from '@/server/application/notifications/system-notification-scheduling';

export type SystemNotificationType =
  | 'session_summary_ready'
  | 'reengagement_inactive';

type SystemNotificationGuardResult =
  | { send: true }
  | { send: false; reason: string };

type SystemNotificationScanResult = {
  summariesScanned: number;
  summarySlotsCreated: number;
  reengagementScanned: number;
  reengagementSlotsCreated: number;
  skipped: number;
};

const REENGAGEMENT_SUPPRESS_AFTER_STAGE_3_MS = 14 * 24 * 60 * 60 * 1000;
const SYSTEM_DAILY_CAP_MS = 24 * 60 * 60 * 1000;
const ANY_PUSH_RECENT_CAP_MS = 18 * 60 * 60 * 1000;
const UPCOMING_PUSH_WINDOW_MS = 6 * 60 * 60 * 1000;
const REENGAGEMENT_WEEKLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_REENGAGEMENT_PUSHES_PER_WEEK = 2;
const DEV_SYSTEM_RECENT_CAP_MS = 5 * 60 * 1000;
const DEV_ANY_PUSH_RECENT_CAP_MS = 5 * 60 * 1000;
const DEV_UPCOMING_PUSH_WINDOW_MS = 10 * 60 * 1000;
const DEV_REENGAGEMENT_SENT_WINDOW_MS = 3 * 60 * 60 * 1000;
const DEV_MAX_REENGAGEMENT_PUSHES_PER_WINDOW = 3;
const MAX_SUMMARIES_PER_RUN = 200;
const MAX_REENGAGEMENT_USERS_PER_RUN = 500;

export const SYSTEM_SUMMARY_TEMPLATE_ID = 'system_session_summary_ready';
export const SYSTEM_REENGAGEMENT_TEMPLATE_ID = 'system_reengagement_inactive';

export const SUMMARY_READY_PUSH_TEXT = {
  title: 'Итог сессии готов',
  body: 'Сводка готова: главные мысли и следующие шаги ждут внутри.',
} as const;

const REENGAGEMENT_MESSAGES: Record<
  1 | 2 | 3,
  { title: string; body: string; deepLink: string }
> = {
  1: {
    title: 'Как ты сегодня?',
    body: 'Можно начать с пары минут: отметить состояние или просто написать, что сейчас внутри.',
    deepLink: '/',
  },
  2: {
    title: 'Проверим состояние?',
    body: 'Короткий разговор поможет собрать мысли и выбрать один спокойный следующий шаг.',
    deepLink: '/chat',
  },
  3: {
    title: 'Ментала рядом',
    body: 'Если день выдался тяжёлым, можно открыть поддержку без подготовки и лишнего давления.',
    deepLink: '/quick-help',
  },
};

function normalizeTimezone(timezone?: string | null): string {
  return timezone && isValidTimezone(timezone)
    ? timezone
    : DEFAULT_SYSTEM_NOTIFICATION_TIMEZONE;
}

function resolveServerAppEnv(): 'dev' | 'prod' {
  const raw = String(process.env.MENTALA_DB_ENV || process.env.NODE_ENV || '')
    .trim()
    .toLowerCase();
  if (raw === 'prod' || raw === 'production') return 'prod';
  return 'dev';
}

function isLocalDevelopmentRuntime(): boolean {
  // Ускоренный re-engagement нужен только для локальной проверки, не для dev-стенда.
  const override = String(
    process.env.SYSTEM_NOTIFICATIONS_FAST_REENGAGEMENT || ''
  )
    .trim()
    .toLowerCase();

  if (override === 'true') return true;
  if (override === 'false') return false;

  return process.env.NODE_ENV === 'development';
}

function getReengagementRuntimePolicy(localDevelopment: boolean) {
  return {
    thresholds: getReengagementThresholds({ localDevelopment }),
    systemRecentCapMs: localDevelopment
      ? DEV_SYSTEM_RECENT_CAP_MS
      : SYSTEM_DAILY_CAP_MS,
    anyPushRecentCapMs: localDevelopment
      ? DEV_ANY_PUSH_RECENT_CAP_MS
      : ANY_PUSH_RECENT_CAP_MS,
    upcomingPushWindowMs: localDevelopment
      ? DEV_UPCOMING_PUSH_WINDOW_MS
      : UPCOMING_PUSH_WINDOW_MS,
    sentWindowMs: localDevelopment
      ? DEV_REENGAGEMENT_SENT_WINDOW_MS
      : REENGAGEMENT_WEEKLY_WINDOW_MS,
    maxSentCount: localDevelopment
      ? DEV_MAX_REENGAGEMENT_PUSHES_PER_WINDOW
      : MAX_REENGAGEMENT_PUSHES_PER_WEEK,
  };
}

function pickReengagementMessage(stage: 1 | 2 | 3) {
  return REENGAGEMENT_MESSAGES[stage];
}

async function hasActivePushEndpoint(userId: number): Promise<boolean> {
  const [device] = await db
    .select({ id: userDevices.id })
    .from(userDevices)
    .where(
      and(
        eq(userDevices.userId, userId),
        eq(userDevices.appEnv, resolveServerAppEnv()),
        eq(userDevices.isActive, true)
      )
    )
    .limit(1);

  return Boolean(device);
}

async function insertSystemSlot(params: {
  userId: number;
  entityKey: string;
  entityDisplayName: string;
  scheduledAt: Date;
  timezone: string;
  payload: NotificationPayload;
  templateId: string;
}): Promise<boolean> {
  const inserted = await db
    .insert(notificationSlots)
    .values({
      id: params.payload.data?.slotId as string,
      userId: params.userId,
      kind: 'system',
      entityKey: params.entityKey,
      entityDisplayName: params.entityDisplayName,
      scheduledAt: params.scheduledAt,
      scheduledAtLocal: sql`timezone(${params.timezone}, ${params.scheduledAt})`,
      payload: params.payload,
      templateId: params.templateId,
      status: 'planned',
    })
    .onConflictDoNothing({
      target: [
        notificationSlots.userId,
        notificationSlots.kind,
        notificationSlots.entityKey,
        notificationSlots.scheduledAt,
      ],
      where: sql`${notificationSlots.status} IN ('planned', 'queued')`,
    })
    .returning({ id: notificationSlots.id });

  return inserted.length > 0;
}

async function scheduleSummaryReadyPushes(
  nowUtc: Date
): Promise<{ scanned: number; created: number; skipped: number }> {
  const rows = await db
    .select({
      id: sessionSummariesUser.id,
      userId: sessionSummariesUser.userId,
      createdAt: sessionSummariesUser.createdAt,
      userTimezone: users.timezone,
      engagementTimezone: userEngagementState.timezone,
    })
    .from(sessionSummariesUser)
    .innerJoin(users, eq(users.id, sessionSummariesUser.userId))
    .leftJoin(
      userEngagementState,
      eq(userEngagementState.userId, sessionSummariesUser.userId)
    )
    .where(
      and(
        eq(sessionSummariesUser.status, 'completed'),
        isNull(sessionSummariesUser.viewedAt),
        isNull(sessionSummariesUser.readyPushSentAt),
        isNull(sessionSummariesUser.readyPushScheduledAt)
      )
    )
    .orderBy(asc(sessionSummariesUser.createdAt))
    .limit(MAX_SUMMARIES_PER_RUN);

  let created = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!(await hasActivePushEndpoint(row.userId))) {
      skipped += 1;
      continue;
    }

    const timezone = normalizeTimezone(
      row.engagementTimezone || row.userTimezone
    );
    const scheduledAt = resolveSummaryReadyScheduledAt({
      summaryCreatedAt: row.createdAt,
      nowUtc,
      timezone,
    });
    const slotId = nanoid();
    const deepLink = `/session-summaries-user/${row.id}`;
    const payload: NotificationPayload = {
      title: SUMMARY_READY_PUSH_TEXT.title,
      body: SUMMARY_READY_PUSH_TEXT.body,
      templateId: SYSTEM_SUMMARY_TEMPLATE_ID,
      action: 'open',
      deepLink,
      data: {
        kind: 'system',
        action: 'open',
        slotId,
        systemType: 'session_summary_ready',
        summaryId: String(row.id),
        deepLink,
      },
    };

    const inserted = await insertSystemSlot({
      userId: row.userId,
      entityKey: `summary:${row.id}`,
      entityDisplayName: 'Итог сессии',
      scheduledAt,
      timezone,
      payload,
      templateId: SYSTEM_SUMMARY_TEMPLATE_ID,
    });

    if (!inserted) {
      skipped += 1;
      continue;
    }

    await db
      .update(sessionSummariesUser)
      .set({
        readyPushScheduledAt: scheduledAt,
        updatedAt: nowUtc,
      })
      .where(
        and(
          eq(sessionSummariesUser.id, row.id),
          isNull(sessionSummariesUser.readyPushScheduledAt)
        )
      );

    created += 1;
  }

  return { scanned: rows.length, created, skipped };
}

async function hasUnseenSummaryForUser(userId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: sessionSummariesUser.id })
    .from(sessionSummariesUser)
    .where(
      and(
        eq(sessionSummariesUser.userId, userId),
        eq(sessionSummariesUser.status, 'completed'),
        isNull(sessionSummariesUser.viewedAt),
        isNull(sessionSummariesUser.readyPushSentAt)
      )
    )
    .limit(1);

  return Boolean(row);
}

async function hasActiveReengagementSlot(userId: number): Promise<boolean> {
  const [slot] = await db
    .select({ id: notificationSlots.id })
    .from(notificationSlots)
    .where(
      and(
        eq(notificationSlots.userId, userId),
        eq(notificationSlots.kind, 'system'),
        eq(notificationSlots.templateId, SYSTEM_REENGAGEMENT_TEMPLATE_ID),
        sql`${notificationSlots.status} IN ('planned', 'queued')`
      )
    )
    .limit(1);

  return Boolean(slot);
}

async function hasRecentSystemPush(
  userId: number,
  nowUtc: Date,
  recentCapMs: number
) {
  const since = new Date(nowUtc.getTime() - recentCapMs);
  const [row] = await db
    .select({ id: notificationSlots.id })
    .from(notificationSlots)
    .where(
      and(
        eq(notificationSlots.userId, userId),
        eq(notificationSlots.kind, 'system'),
        eq(notificationSlots.status, 'sent'),
        gte(notificationSlots.scheduledAt, since)
      )
    )
    .limit(1);

  return Boolean(row);
}

async function hasRecentAnyPush(
  userId: number,
  nowUtc: Date,
  recentCapMs: number
) {
  const since = new Date(nowUtc.getTime() - recentCapMs);
  const [row] = await db
    .select({ id: notificationSlots.id })
    .from(notificationSlots)
    .where(
      and(
        eq(notificationSlots.userId, userId),
        eq(notificationSlots.status, 'sent'),
        gte(notificationSlots.scheduledAt, since)
      )
    )
    .limit(1);

  return Boolean(row);
}

async function hasUpcomingPush(
  userId: number,
  nowUtc: Date,
  upcomingWindowMs: number
) {
  const until = new Date(nowUtc.getTime() + upcomingWindowMs);
  const [row] = await db
    .select({ id: notificationSlots.id })
    .from(notificationSlots)
    .where(
      and(
        eq(notificationSlots.userId, userId),
        gte(notificationSlots.scheduledAt, nowUtc),
        lte(notificationSlots.scheduledAt, until),
        sql`${notificationSlots.status} IN ('planned', 'queued')`
      )
    )
    .limit(1);

  return Boolean(row);
}

async function getReengagementSentCount(
  userId: number,
  nowUtc: Date,
  sentWindowMs: number
) {
  const since = new Date(nowUtc.getTime() - sentWindowMs);
  const [row] = await db
    .select({ value: sql<number>`count(*)` })
    .from(notificationSlots)
    .where(
      and(
        eq(notificationSlots.userId, userId),
        eq(notificationSlots.kind, 'system'),
        eq(notificationSlots.templateId, SYSTEM_REENGAGEMENT_TEMPLATE_ID),
        eq(notificationSlots.status, 'sent'),
        gte(notificationSlots.scheduledAt, since)
      )
    );

  return Number(row?.value ?? 0);
}

async function scheduleReengagementPushes(
  nowUtc: Date
): Promise<{ scanned: number; created: number; skipped: number }> {
  const localDevelopment = isLocalDevelopmentRuntime();
  const runtimePolicy = getReengagementRuntimePolicy(localDevelopment);
  const { thresholds } = runtimePolicy;
  const staleBefore = new Date(nowUtc.getTime() - thresholds.stage1Ms);
  const rows = await db
    .select({
      userId: userEngagementState.userId,
      lastSeenAt: userEngagementState.lastSeenAt,
      timezone: userEngagementState.timezone,
      userTimezone: users.timezone,
      reengagementStage: userEngagementState.reengagementStage,
      reengagementSuppressedUntil:
        userEngagementState.reengagementSuppressedUntil,
    })
    .from(userEngagementState)
    .innerJoin(users, eq(users.id, userEngagementState.userId))
    .where(
      and(
        sql`${users.roleId} IS DISTINCT FROM 'support'`,
        gte(userEngagementState.lastSeenAt, new Date(0)),
        lte(userEngagementState.lastSeenAt, staleBefore)
      )
    )
    .orderBy(asc(userEngagementState.lastSeenAt))
    .limit(MAX_REENGAGEMENT_USERS_PER_RUN);

  let created = 0;
  let skipped = 0;

  for (const row of rows) {
    const stage = resolveNextReengagementStage({
      lastSeenAt: row.lastSeenAt,
      reengagementStage: row.reengagementStage,
      suppressedUntil: row.reengagementSuppressedUntil,
      nowUtc,
      thresholds,
    });

    if (!stage) {
      skipped += 1;
      continue;
    }

    const shouldSkip =
      (await hasUnseenSummaryForUser(row.userId)) ||
      (await hasActiveReengagementSlot(row.userId)) ||
      (await hasRecentSystemPush(
        row.userId,
        nowUtc,
        runtimePolicy.systemRecentCapMs
      )) ||
      (await hasRecentAnyPush(
        row.userId,
        nowUtc,
        runtimePolicy.anyPushRecentCapMs
      )) ||
      (await hasUpcomingPush(
        row.userId,
        nowUtc,
        runtimePolicy.upcomingPushWindowMs
      )) ||
      (await getReengagementSentCount(
        row.userId,
        nowUtc,
        runtimePolicy.sentWindowMs
      )) >= runtimePolicy.maxSentCount ||
      !(await hasActivePushEndpoint(row.userId));

    if (shouldSkip) {
      skipped += 1;
      continue;
    }

    const timezone = normalizeTimezone(row.timezone || row.userTimezone);
    const scheduledAt = resolveReengagementScheduledAt({
      stage,
      nowUtc,
      timezone,
      localDevelopment,
    });
    const message = pickReengagementMessage(stage);
    const slotId = nanoid();
    const payload: NotificationPayload = {
      title: message.title,
      body: message.body,
      templateId: SYSTEM_REENGAGEMENT_TEMPLATE_ID,
      action: 'open',
      deepLink: message.deepLink,
      data: {
        kind: 'system',
        action: 'open',
        slotId,
        systemType: 'reengagement_inactive',
        reengagementStage: String(stage),
        deepLink: message.deepLink,
      },
    };

    const inserted = await insertSystemSlot({
      userId: row.userId,
      entityKey: `reengagement:${stage}`,
      entityDisplayName: 'Возврат в приложение',
      scheduledAt,
      timezone,
      payload,
      templateId: SYSTEM_REENGAGEMENT_TEMPLATE_ID,
    });

    if (!inserted) {
      skipped += 1;
      continue;
    }

    await db
      .update(userEngagementState)
      .set({
        reengagementStage: stage,
        updatedAt: nowUtc,
      })
      .where(eq(userEngagementState.userId, row.userId));

    created += 1;
  }

  return { scanned: rows.length, created, skipped };
}

export async function runSystemNotificationScheduler(
  nowUtc = new Date()
): Promise<SystemNotificationScanResult> {
  const summary = await scheduleSummaryReadyPushes(nowUtc);
  const reengagement = await scheduleReengagementPushes(nowUtc);

  return {
    summariesScanned: summary.scanned,
    summarySlotsCreated: summary.created,
    reengagementScanned: reengagement.scanned,
    reengagementSlotsCreated: reengagement.created,
    skipped: summary.skipped + reengagement.skipped,
  };
}

export async function guardSystemNotificationSlot(params: {
  userId: number;
  templateId: string | null;
  payload: NotificationPayload;
  slotCreatedAt: Date;
  nowUtc?: Date;
}): Promise<SystemNotificationGuardResult> {
  const nowUtc = params.nowUtc ?? new Date();
  const systemType = params.payload.data?.systemType as
    | SystemNotificationType
    | undefined;

  if (
    params.templateId === SYSTEM_SUMMARY_TEMPLATE_ID ||
    systemType === 'session_summary_ready'
  ) {
    const summaryId = Number(params.payload.data?.summaryId);
    if (!Number.isFinite(summaryId) || summaryId <= 0) {
      return { send: false, reason: 'summary_id_missing' };
    }

    const [summary] = await db
      .select({
        id: sessionSummariesUser.id,
        status: sessionSummariesUser.status,
        viewedAt: sessionSummariesUser.viewedAt,
        readyPushSentAt: sessionSummariesUser.readyPushSentAt,
      })
      .from(sessionSummariesUser)
      .where(
        and(
          eq(sessionSummariesUser.id, summaryId),
          eq(sessionSummariesUser.userId, params.userId)
        )
      )
      .limit(1);

    if (!summary) return { send: false, reason: 'summary_not_found' };
    if (summary.status !== 'completed') {
      return { send: false, reason: 'summary_not_completed' };
    }
    if (summary.viewedAt) {
      return { send: false, reason: 'summary_already_viewed' };
    }
    if (summary.readyPushSentAt) {
      return { send: false, reason: 'summary_push_already_sent' };
    }
    return { send: true };
  }

  if (
    params.templateId === SYSTEM_REENGAGEMENT_TEMPLATE_ID ||
    systemType === 'reengagement_inactive'
  ) {
    const localDevelopment = isLocalDevelopmentRuntime();
    const thresholds = getReengagementThresholds({ localDevelopment });
    const [state] = await db
      .select({
        lastSeenAt: userEngagementState.lastSeenAt,
      })
      .from(userEngagementState)
      .where(eq(userEngagementState.userId, params.userId))
      .limit(1);

    if (!state?.lastSeenAt) {
      return { send: false, reason: 'activity_state_missing' };
    }
    if (state.lastSeenAt.getTime() >= params.slotCreatedAt.getTime()) {
      return { send: false, reason: 'user_returned' };
    }
    if (nowUtc.getTime() - state.lastSeenAt.getTime() < thresholds.stage1Ms) {
      return { send: false, reason: 'user_returned' };
    }
    if (await hasUnseenSummaryForUser(params.userId)) {
      return { send: false, reason: 'summary_priority' };
    }
    return { send: true };
  }

  return { send: false, reason: 'unknown_system_notification' };
}

export async function markSystemNotificationSent(params: {
  userId: number;
  templateId: string | null;
  payload: NotificationPayload;
  nowUtc?: Date;
}) {
  const nowUtc = params.nowUtc ?? new Date();
  const systemType = params.payload.data?.systemType as
    | SystemNotificationType
    | undefined;

  if (
    params.templateId === SYSTEM_SUMMARY_TEMPLATE_ID ||
    systemType === 'session_summary_ready'
  ) {
    const summaryId = Number(params.payload.data?.summaryId);
    if (!Number.isFinite(summaryId) || summaryId <= 0) return;

    await db
      .update(sessionSummariesUser)
      .set({
        readyPushSentAt: nowUtc,
        updatedAt: nowUtc,
      })
      .where(
        and(
          eq(sessionSummariesUser.id, summaryId),
          eq(sessionSummariesUser.userId, params.userId),
          isNull(sessionSummariesUser.readyPushSentAt)
        )
      );
    return;
  }

  if (
    params.templateId === SYSTEM_REENGAGEMENT_TEMPLATE_ID ||
    systemType === 'reengagement_inactive'
  ) {
    const stage = Number(params.payload.data?.reengagementStage);
    const suppressUntil =
      stage === 3
        ? new Date(nowUtc.getTime() + REENGAGEMENT_SUPPRESS_AFTER_STAGE_3_MS)
        : null;

    await db
      .update(userEngagementState)
      .set({
        lastReengagementPushSentAt: nowUtc,
        ...(suppressUntil
          ? { reengagementSuppressedUntil: suppressUntil }
          : {}),
        updatedAt: nowUtc,
      })
      .where(eq(userEngagementState.userId, params.userId));
  }
}
