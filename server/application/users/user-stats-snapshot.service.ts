import { db } from '@@/server/infrastructure/db/client';
import {
  users,
  userMarketingAttributions,
  userSubscriptions,
  payments,
  aiSessions,
  deletedUserStats,
} from '@@/server/infrastructure/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

/**
 * Собирает анонимный статистический слепок пользователя и сохраняет в deleted_user_stats.
 * Вызывается ПЕРЕД финальным удалением/анонимизацией записи users.
 * Не содержит PII — только агрегаты и метаданные.
 */
export async function snapshotDeletedUserStats(userId: number): Promise<void> {
  const now = new Date();

  const [
    userRows,
    attributionRows,
    subCountRows,
    lastSubRows,
    revenueRows,
    daysActiveRows,
    aiSessionRows,
    deviceRows,
  ] = await Promise.all([
    // 1. Основные данные пользователя
    db
      .select({
        createdAt: users.createdAt,
        country: users.country,
        locale: users.locale,
        gender: users.gender,
        ageRange: users.ageRange,
        hasUsedTrial: users.hasUsedTrial,
        trialStartedAt: users.trialStartedAt,
        billingPlanId: users.billingPlanId,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),

    // 2. Атрибуция — первое касание
    db
      .select({
        utmSource: userMarketingAttributions.utmSource,
        utmMedium: userMarketingAttributions.utmMedium,
        utmCampaign: userMarketingAttributions.utmCampaign,
        touchpoint: userMarketingAttributions.touchpoint,
      })
      .from(userMarketingAttributions)
      .where(eq(userMarketingAttributions.userId, userId))
      .orderBy(userMarketingAttributions.createdAt)
      .limit(1),

    // 3a. Количество подписок (отдельно от lastPlanId — нельзя мешать агрегат с orderBy)
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(userSubscriptions)
      .where(eq(userSubscriptions.userId, userId)),

    // 3b. Последний тариф подписки
    db
      .select({ planId: userSubscriptions.planId })
      .from(userSubscriptions)
      .where(eq(userSubscriptions.userId, userId))
      .orderBy(desc(userSubscriptions.createdAt))
      .limit(1),

    // 4. Выручка — только успешные платежи
    db
      .select({
        total: sql<string>`coalesce(sum(amount::numeric), 0)::text`,
      })
      .from(payments)
      .where(
        and(eq(payments.userId, userId), eq(payments.status, 'succeeded'))
      ),

    // 5. Количество уникальных активных дней
    db.execute(
      sql`SELECT count(distinct activity_date)::int AS cnt FROM user_daily_activity WHERE user_id = ${userId}`
    ),

    // 6. Количество AI-сессий
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(aiSessions)
      .where(eq(aiSessions.userId, userId)),

    // 7. Первая платформа по подпискам
    db.execute(
      sql`SELECT source_platform AS platform FROM user_subscriptions WHERE user_id = ${userId} ORDER BY created_at ASC LIMIT 1`
    ),
  ]);

  if (!userRows[0]) return;

  const user = userRows[0];
  const attr = attributionRows[0];
  const subscriptionCount = Number(subCountRows[0]?.count ?? 0);
  const lastPlanId = lastSubRows[0]?.planId ?? user.billingPlanId ?? null;

  const daysAlive = Math.floor(
    (now.getTime() - user.createdAt.getTime()) / (24 * 60 * 60 * 1000)
  );

  const platform =
    ((deviceRows.rows[0] as Record<string, unknown> | undefined)?.platform as
      | string
      | null) ?? null;

  const totalDaysActive =
    ((daysActiveRows.rows[0] as Record<string, unknown> | undefined)
      ?.cnt as number) ?? 0;

  await db.insert(deletedUserStats).values({
    registeredAt: user.createdAt,
    deletedAt: now,
    daysAlive,
    country: user.country,
    locale: user.locale,
    gender: user.gender,
    ageRange: user.ageRange,
    platform,
    acquisitionChannel: attr?.utmSource ?? attr?.touchpoint ?? null,
    utmSource: attr?.utmSource ?? null,
    utmMedium: attr?.utmMedium ?? null,
    utmCampaign: attr?.utmCampaign ?? null,
    hadTrial: user.hasUsedTrial,
    trialStartedAt: user.trialStartedAt,
    hadPaidSubscription: subscriptionCount > 0,
    lastPlanId,
    subscriptionCount,
    totalRevenue: revenueRows[0]?.total ?? '0',
    totalDaysActive,
    totalAiSessions: Number(aiSessionRows[0]?.count ?? 0),
  });
}
