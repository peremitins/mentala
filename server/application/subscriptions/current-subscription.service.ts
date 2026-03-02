import { and, desc, eq, gt, lte } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  subscriptionPlans,
  userSubscriptions,
} from '@/server/infrastructure/db/schema';

function resolveDbClient(tx?: any) {
  return tx ?? db;
}

/**
 * Проставляет `expired` для подписок, у которых статус остался `active`,
 * но период уже закончился.
 */
export async function expireOutdatedActiveSubscriptions(params: {
  userId: number;
  now?: Date;
  tx?: any;
}) {
  const now = params.now ?? new Date();
  const client = resolveDbClient(params.tx);

  return await client
    .update(userSubscriptions)
    .set({
      paymentStatus: 'expired',
      updatedAt: now,
    })
    .where(
      and(
        eq(userSubscriptions.userId, params.userId),
        eq(userSubscriptions.paymentStatus, 'active'),
        lte(userSubscriptions.endDate, now)
      )
    )
    .returning({
      id: userSubscriptions.id,
    });
}

/**
 * Единая стратегия выбора "текущей" активной подписки.
 */
export async function getCurrentActiveSubscription(params: {
  userId: number;
  now?: Date;
  tx?: any;
}) {
  const now = params.now ?? new Date();
  const client = resolveDbClient(params.tx);

  const rows = await client
    .select()
    .from(userSubscriptions)
    .where(
      and(
        eq(userSubscriptions.userId, params.userId),
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

  return rows[0] ?? null;
}

/**
 * Единая стратегия выбора "текущей" активной подписки + ее план.
 */
export async function getCurrentActiveSubscriptionWithPlan(params: {
  userId: number;
  now?: Date;
  tx?: any;
}) {
  const now = params.now ?? new Date();
  const client = resolveDbClient(params.tx);

  const rows = await client
    .select({
      subscription: userSubscriptions,
      plan: subscriptionPlans,
    })
    .from(userSubscriptions)
    .innerJoin(
      subscriptionPlans,
      eq(userSubscriptions.planId, subscriptionPlans.id)
    )
    .where(
      and(
        eq(userSubscriptions.userId, params.userId),
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

  return rows[0] ?? null;
}
