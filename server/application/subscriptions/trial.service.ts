/**
 * Сервис для работы с Trial (пробным периодом)
 * Trial - это не отдельный тариф, а временное состояние тарифа Basic
 */

import { db } from '@/server/infrastructure/db/client';
import {
  users,
  userSubscriptions,
  subscriptionPlans,
  subscriptionEvents,
} from '@/server/infrastructure/db/schema';
import { eq, and, gt } from 'drizzle-orm';

/**
 * Активировать Trial для нового пользователя
 * Создает подписку Basic с trialActive = true (через trialEndedAt)
 */
export async function activateTrialForUser(userId: number, timezone?: string) {
  console.log(
    `[Trial] activateTrialForUser called for user ${userId}, timezone: ${timezone || 'not provided'}`
  );

  // Проверяем, использовал ли пользователь уже Trial и есть ли у него подписка
  const user = await db
    .select({
      hasUsedTrial: users.hasUsedTrial,
      timezone: users.timezone,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user.length) {
    throw new Error(`User ${userId} not found`);
  }

  console.log(
    `[Trial] User ${userId}: hasUsedTrial=${user[0].hasUsedTrial}, timezone=${user[0].timezone}`
  );

  // Проверяем, есть ли уже активная подписка у пользователя (не истекшая)
  const now = new Date();
  const existingSubscription = await db
    .select()
    .from(userSubscriptions)
    .where(
      and(
        eq(userSubscriptions.userId, userId),
        eq(userSubscriptions.paymentStatus, 'active'),
        gt(userSubscriptions.endDate, now) // подписка не истекла
      )
    )
    .limit(1);

  // Если уже есть активная подписка - не создаем новую
  if (existingSubscription.length) {
    console.log(
      `[Trial] ✅ User ${userId} already has active subscription (planId=${existingSubscription[0].planId}), skipping`
    );
    return existingSubscription[0];
  }

  console.log(
    `[Trial] User ${userId} has no active subscription, creating new one...`
  );

  // Если уже использовал Trial - не выдаем, создаем Basic без Trial
  if (user[0].hasUsedTrial) {
    console.log(
      `[Trial] User ${userId} already used trial (hasUsedTrial=true), creating Basic without trial`
    );
    // Создаем Basic без Trial
    const subscription = await createBasicSubscription(
      userId,
      timezone || user[0].timezone || 'Europe/Moscow',
      false
    );
    console.log(
      `[Trial] ✅ Created Basic subscription (without trial) for user ${userId}: subscriptionId=${subscription.id}`
    );
    return subscription;
  }

  console.log(
    `[Trial] User ${userId} has not used trial (hasUsedTrial=false), creating Basic WITH trial`
  );

  // Получаем план Basic
  const basicPlan = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.id, 'basic'))
    .limit(1);

  if (!basicPlan.length) {
    const error = new Error(
      'Basic plan not found. Please run seed script: pnpm seed:subscription-plans'
    );
    console.error(`[Trial] ❌ ${error.message}`);
    throw error;
  }

  console.log(
    `[Trial] Found Basic plan: id=${basicPlan[0].id}, name=${basicPlan[0].name}`
  );

  // Используем now объявленный выше
  const trialEndDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // +7 дней для Trial
  const subscriptionEndDate = new Date(
    now.getTime() + 30 * 24 * 60 * 60 * 1000
  ); // +30 дней для подписки Basic

  // Обновляем пользователя: отмечаем, что Trial использован
  await db
    .update(users)
    .set({
      hasUsedTrial: true,
      trialStartedAt: now,
      trialEndedAt: trialEndDate,
      timezone: timezone || user[0].timezone || 'Europe/Moscow', // дефолтный timezone
    })
    .where(eq(users.id, userId));

  // Создаем подписку Basic (с Trial активным)
  console.log(
    `[Trial] Creating Basic subscription with Trial for user ${userId}...`
  );
  const [subscription] = await db
    .insert(userSubscriptions)
    .values({
      userId,
      planId: 'basic',
      billingPeriod: 'month', // Basic всегда месячный
      startDate: now,
      endDate: subscriptionEndDate,
      paymentStatus: 'active',
      autoRenew: false,
      sourcePlatform: 'web', // можно определить по user-agent позже
    })
    .returning();

  if (!subscription) {
    throw new Error(`Failed to create subscription for user ${userId}`);
  }

  console.log(
    `[Trial] ✅ Created Basic subscription with Trial for user ${userId}: subscriptionId=${subscription.id}, planId=${subscription.planId}, trialEndedAt=${trialEndDate.toISOString()}`
  );

  // Логируем событие
  await db.insert(subscriptionEvents).values({
    userId,
    eventType: 'trial_started',
    planId: 'basic', // Trial - это состояние Basic
    metadata: {
      startDate: now.toISOString(),
      endDate: trialEndDate.toISOString(),
    },
  });

  return subscription;
}

/**
 * Создать подписку Basic (без Trial)
 */
async function createBasicSubscription(
  userId: number,
  timezone: string,
  withTrial: boolean
) {
  console.log(
    `[Trial] createBasicSubscription called for user ${userId}, withTrial=${withTrial}`
  );

  const basicPlan = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.id, 'basic'))
    .limit(1);

  if (!basicPlan.length) {
    const error = new Error(
      'Basic plan not found. Please run seed script: pnpm seed:subscription-plans'
    );
    console.error(`[Trial] ❌ ${error.message}`);
    throw error;
  }

  const now = new Date();
  const endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 дней

  console.log(
    `[Trial] Creating Basic subscription (without trial) for user ${userId}...`
  );
  const [subscription] = await db
    .insert(userSubscriptions)
    .values({
      userId,
      planId: 'basic',
      billingPeriod: 'month',
      startDate: now,
      endDate,
      paymentStatus: 'active',
      autoRenew: false,
      sourcePlatform: 'web',
    })
    .returning();

  if (!subscription) {
    throw new Error(`Failed to create Basic subscription for user ${userId}`);
  }

  console.log(
    `[Trial] ✅ Created Basic subscription (without trial) for user ${userId}: subscriptionId=${subscription.id}`
  );

  return subscription;
}

/**
 * Проверить, истекла ли Trial подписка
 * Теперь проверяем по trialEndedAt в users, а не по planId
 * Trial истёк автоматически, когда trialEndedAt < now, но пользователь остаётся на Basic
 */
export async function checkTrialExpiration(userId: number) {
  const user = await db
    .select({
      trialEndedAt: users.trialEndedAt,
      hasUsedTrial: users.hasUsedTrial,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user.length || !user[0].trialEndedAt || !user[0].hasUsedTrial) {
    return; // Trial не был активирован
  }

  const now = new Date();
  if (user[0].trialEndedAt < now) {
    // Trial истёк, но пользователь остаётся на Basic
    // Логируем событие для аналитики (только один раз, если еще не логировали)
    const existingEvent = await db
      .select()
      .from(subscriptionEvents)
      .where(
        and(
          eq(subscriptionEvents.userId, userId),
          eq(subscriptionEvents.eventType, 'trial_ended')
        )
      )
      .limit(1);

    if (!existingEvent.length) {
      await db.insert(subscriptionEvents).values({
        userId,
        eventType: 'trial_ended',
        planId: 'basic', // Trial - это состояние Basic
        metadata: {
          expiredAt: now.toISOString(),
        },
      });
    }
  }
}
