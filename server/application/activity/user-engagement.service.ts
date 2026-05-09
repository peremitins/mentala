import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  notificationInteractions,
  notificationSlots,
  userEngagementState,
  users,
} from '@/server/infrastructure/db/schema';
import { updateUserTimezone } from '@/server/application/notifications/timezone.utils';
import type {
  ActivityPingEventType,
  ActivityPingSourceType,
} from '@/shared/dto/activity';
import { shouldUpdateLastSeenForActivity } from './activity-classification';

type UserEngagementActivityResult = {
  lastSeenAt: Date | null;
  lastBackgroundedAt: Date | null;
};

const PUSH_WAKE_SUPPRESSION_MS = 2 * 60 * 1000;

async function hasRecentPushWakeWithoutOpen(
  userId: number,
  now: Date
): Promise<boolean> {
  const since = new Date(now.getTime() - PUSH_WAKE_SUPPRESSION_MS);
  const recentSlots = await db
    .select({ id: notificationSlots.id })
    .from(notificationSlots)
    .where(
      and(
        eq(notificationSlots.userId, userId),
        eq(notificationSlots.status, 'sent'),
        gte(notificationSlots.scheduledAt, since),
        lte(notificationSlots.scheduledAt, now)
      )
    )
    .limit(10);

  const slotIds = recentSlots.map((slot) => slot.id);
  if (slotIds.length === 0) return false;

  const [openInteraction] = await db
    .select({ id: notificationInteractions.id })
    .from(notificationInteractions)
    .where(
      and(
        eq(notificationInteractions.userId, userId),
        eq(notificationInteractions.action, 'open'),
        inArray(notificationInteractions.slotId, slotIds),
        gte(notificationInteractions.createdAt, since)
      )
    )
    .limit(1);

  return !openInteraction;
}

async function syncUserTimezone(userId: number, timezone: string) {
  const [userRow] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!userRow || userRow.timezone === timezone) {
    return;
  }

  await db
    .update(users)
    .set({
      timezone,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  await updateUserTimezone(userId, timezone);
}

export async function recordUserEngagementActivity(params: {
  userId: number;
  event: ActivityPingEventType;
  timezone: string;
  clientVisible?: boolean;
  clientFocused?: boolean;
  source?: ActivityPingSourceType;
}): Promise<UserEngagementActivityResult> {
  const now = new Date();
  const recentPushWakeWithoutOpen =
    params.event === 'background' || params.source === 'notification_click'
      ? false
      : await hasRecentPushWakeWithoutOpen(params.userId, now);
  const isSeenEvent = shouldUpdateLastSeenForActivity({
    ...params,
    recentPushWakeWithoutOpen,
  });

  await syncUserTimezone(params.userId, params.timezone);

  const insertValues = {
    userId: params.userId,
    lastSeenAt: isSeenEvent ? now : null,
    lastBackgroundedAt: isSeenEvent ? null : now,
    timezone: params.timezone,
    reengagementStage: 0,
    updatedAt: now,
  };

  const setValues = isSeenEvent
    ? {
        lastSeenAt: now,
        timezone: params.timezone,
        reengagementStage: 0,
        updatedAt: now,
      }
    : {
        lastBackgroundedAt: now,
        timezone: params.timezone,
        updatedAt: now,
      };

  const [state] = await db
    .insert(userEngagementState)
    .values(insertValues)
    .onConflictDoUpdate({
      target: userEngagementState.userId,
      set: setValues,
    })
    .returning({
      lastSeenAt: userEngagementState.lastSeenAt,
      lastBackgroundedAt: userEngagementState.lastBackgroundedAt,
    });

  return {
    lastSeenAt: state?.lastSeenAt ?? null,
    lastBackgroundedAt: state?.lastBackgroundedAt ?? null,
  };
}
