import { createError } from 'h3';
import { and, desc, eq, gt } from 'drizzle-orm';
import { getSessionUser } from '@/server/application/auth/session';
import { db } from '@/server/infrastructure/db/client';
import {
  subscriptionEvents,
  userSubscriptions,
  users,
} from '@/server/infrastructure/db/schema';

/**
 * POST /api/subscriptions/scheduled-change/cancel
 * Отмена запланированной смены тарифа.
 */
export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }

  const now = new Date();
  const userId = sessionResult.user.id;

  const userRows = await db
    .select({
      scheduledPlanId: users.scheduledPlanId,
      scheduledBillingPeriod: users.scheduledBillingPeriod,
      scheduledChangeAt: users.scheduledChangeAt,
      scheduledFromSubscriptionId: users.scheduledFromSubscriptionId,
      billingPlanId: users.billingPlanId,
      billingPeriod: users.billingPeriod,
      nextChargeAt: users.nextChargeAt,
      billingCollectionStatus: users.billingCollectionStatus,
      graceEndsAt: users.graceEndsAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const existing = userRows[0];
  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found',
    });
  }

  let restoredAutoRenewForSubscriptionId: number | null = null;
  const hasScheduledPaidChange = Boolean(
    existing.scheduledPlanId && existing.scheduledChangeAt
  );

  if (hasScheduledPaidChange) {
    const explicitSourceId = Number(existing.scheduledFromSubscriptionId || 0);
    if (Number.isFinite(explicitSourceId) && explicitSourceId > 0) {
      const restoredBySource = await db
        .update(userSubscriptions)
        .set({
          autoRenew: true,
          updatedAt: now,
        })
        .where(
          and(
            eq(userSubscriptions.id, explicitSourceId),
            eq(userSubscriptions.userId, userId),
            eq(userSubscriptions.paymentStatus, 'active'),
            gt(userSubscriptions.endDate, now)
          )
        )
        .returning({ id: userSubscriptions.id });

      restoredAutoRenewForSubscriptionId = restoredBySource[0]?.id || null;
    }

    // Фолбэк для legacy/рассинхронных данных, когда source id не сохранен.
    if (!restoredAutoRenewForSubscriptionId) {
      const activeRows = await db
        .select({
          id: userSubscriptions.id,
        })
        .from(userSubscriptions)
        .where(
          and(
            eq(userSubscriptions.userId, userId),
            eq(userSubscriptions.paymentStatus, 'active'),
            gt(userSubscriptions.endDate, now)
          )
        )
        .orderBy(
          desc(userSubscriptions.endDate),
          desc(userSubscriptions.createdAt),
          desc(userSubscriptions.id)
        )
        .limit(1);

      const active = activeRows[0];
      if (active) {
        const restoredFallback = await db
          .update(userSubscriptions)
          .set({
            autoRenew: true,
            updatedAt: now,
          })
          .where(eq(userSubscriptions.id, active.id))
          .returning({ id: userSubscriptions.id });

        restoredAutoRenewForSubscriptionId = restoredFallback[0]?.id || null;
      }
    }
  }

  await db
    .update(users)
    .set({
      scheduledPlanId: null,
      scheduledBillingPeriod: null,
      scheduledChangeAt: null,
      scheduledFromSubscriptionId: null,
      scheduledChangeUpdatedAt: now,
      billingPlanId: null,
      billingPeriod: null,
      nextChargeAt: null,
      billingCollectionStatus: 'none',
      graceEndsAt: null,
      billingReminderSentAt: null,
      billingLockedAt: null,
      billingLockedBy: null,
      updatedAt: now,
    })
    .where(eq(users.id, userId));

  if (
    (existing.scheduledPlanId && existing.scheduledChangeAt) ||
    existing.billingPlanId
  ) {
    await db.insert(subscriptionEvents).values({
      userId,
      eventType: 'subscription_change_schedule_canceled',
      planId: existing.scheduledPlanId || existing.billingPlanId,
      metadata: {
        scheduledPlanId: existing.scheduledPlanId,
        scheduledBillingPeriod: existing.scheduledBillingPeriod,
        scheduledChangeAt: existing.scheduledChangeAt?.toISOString() || null,
        scheduledFromSubscriptionId: existing.scheduledFromSubscriptionId,
        billingPlanId: existing.billingPlanId,
        billingPeriod: existing.billingPeriod,
        nextChargeAt: existing.nextChargeAt?.toISOString() || null,
        billingCollectionStatus: existing.billingCollectionStatus,
        graceEndsAt: existing.graceEndsAt?.toISOString() || null,
        restoredAutoRenewForSubscriptionId,
      },
    });
  }

  return {
    success: true,
    scheduledChange: null,
  };
});
