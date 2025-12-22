import { defineEventHandler } from 'h3';
import { requireRole } from '@/server/utils/require-role';
import { db } from '@/server/infrastructure/db/client';
import { users, userSubscriptions } from '@/server/infrastructure/db/schema';
import { eq, sql, and, gt } from 'drizzle-orm';

export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin');

  const now = new Date();

  // Получаем статистику пользователей
  const [totalUsersResult, activeUsersResult] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(users),
    db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(
        and(
          eq(users.isBlocked, false),
          sql`${users.lastLoginAt} > ${new Date(
            now.getTime() - 30 * 24 * 60 * 60 * 1000
          )}`
        )
      ),
  ]);

  // Получаем статистику подписок
  const [totalSubscriptionsResult, activeSubscriptionsResult] =
    await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(userSubscriptions),
      db
        .select({ count: sql<number>`count(*)` })
        .from(userSubscriptions)
        .where(
          and(
            eq(userSubscriptions.paymentStatus, 'active'),
            gt(userSubscriptions.endDate, now)
          )
        ),
    ]);

  // Получаем статистику по доходам (примерная реализация)
  const revenueResult = await db
    .select({
      monthly: sql<number>`COALESCE(SUM(CASE WHEN ${userSubscriptions.billingPeriod} = 'month' AND ${userSubscriptions.paymentStatus} = 'active' THEN CAST(${userSubscriptions.checkoutAmount} AS NUMERIC) ELSE 0 END), 0)`,
      yearly: sql<number>`COALESCE(SUM(CASE WHEN ${userSubscriptions.billingPeriod} = 'year' AND ${userSubscriptions.paymentStatus} = 'active' THEN CAST(${userSubscriptions.checkoutAmount} AS NUMERIC) ELSE 0 END), 0)`,
    })
    .from(userSubscriptions)
    .where(
      and(
        eq(userSubscriptions.paymentStatus, 'active'),
        gt(userSubscriptions.endDate, now)
      )
    );

  return {
    totalUsers: Number(totalUsersResult[0]?.count || 0),
    activeUsers: Number(activeUsersResult[0]?.count || 0),
    totalSubscriptions: Number(totalSubscriptionsResult[0]?.count || 0),
    activeSubscriptions: Number(activeSubscriptionsResult[0]?.count || 0),
    revenue: {
      monthly: Number(revenueResult[0]?.monthly || 0),
      yearly: Number(revenueResult[0]?.yearly || 0),
    },
  };
});

