import { getSessionUser } from '@/server/application/auth/session';
import { createError } from 'h3';
import { db } from '@/server/infrastructure/db/client';
import {
  userSubscriptions,
  subscriptionEvents,
} from '@/server/infrastructure/db/schema';
import { eq, and, gt } from 'drizzle-orm';

/**
 * POST /api/subscriptions/cancel
 * Отменить автопродление подписки
 */
export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  if (!user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }

  // Находим активную подписку (не истекшую)
  const now = new Date();
  const activeSubscription = await db
    .select()
    .from(userSubscriptions)
    .where(
      and(
        eq(userSubscriptions.userId, user.id),
        eq(userSubscriptions.paymentStatus, 'active'),
        gt(userSubscriptions.endDate, now) // подписка не истекла
      )
    )
    .limit(1);

  if (!activeSubscription.length) {
    throw createError({
      statusCode: 404,
      statusMessage: 'No active subscription found',
    });
  }

  const subscription = activeSubscription[0];

  // Отключаем автопродление
  await db
    .update(userSubscriptions)
    .set({ autoRenew: false })
    .where(eq(userSubscriptions.id, subscription.id));

  // TODO: Отключить автопродление в YooKassa через их API
  // await cancelYooKassaRecurringPayment(subscription.id);

  // Логируем событие
  await db.insert(subscriptionEvents).values({
    userId: user.id,
    eventType: 'subscription_canceled',
    planId: subscription.planId,
    metadata: {
      subscriptionId: subscription.id,
      endDate: subscription.endDate.toISOString(),
    },
  });

  return {
    success: true,
    message:
      'Автопродление отменено. Подписка останется активной до конца оплаченного периода.',
    endDate: subscription.endDate,
  };
});
