/**
 * Сервис для работы с Trial (пробным периодом)
 * Trial - это не отдельный тариф, а временное состояние тарифа Basic
 */

import { db } from '@/server/infrastructure/db/client';

// Тип транзакции для передачи в функции (db и tx имеют общий query-интерфейс).
type DbOrTx = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;
import {
  users,
  userSubscriptions,
  subscriptionPlans,
  subscriptionEvents,
  trialUsageTracking,
} from '@/server/infrastructure/db/schema';
import { eq, and } from 'drizzle-orm';
import {
  normalizeEmail,
  hashEmail,
} from '@/server/application/auth/verification';
import { getCurrentActiveSubscription } from './current-subscription.service';
import { TRIAL_DURATION_HOURS } from '@/server/config/subscription';

/**
 * Активировать Trial для нового пользователя
 * Создает подписку Basic с trialActive = true (через trialEndedAt)
 */
export async function activateTrialForUser(
  userId: number,
  timezone?: string,
  email?: string | null
) {
  console.log(
    `[Trial] activateTrialForUser called for user ${userId}, timezone: ${timezone || 'not provided'}`
  );

  // Проверяем, использовал ли пользователь уже Trial и есть ли у него подписка
  const user = await db
    .select({
      hasUsedTrial: users.hasUsedTrial,
      timezone: users.timezone,
      email: users.email,
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
  const existingSubscription = await getCurrentActiveSubscription({
    userId,
    now,
  });

  // Если уже есть активная подписка - не создаем новую
  if (existingSubscription) {
    console.log(
      `[Trial] ✅ User ${userId} already has active subscription (planId=${existingSubscription.planId}), skipping`
    );
    return existingSubscription;
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

  const emailValue = email || user[0].email;
  if (!emailValue) {
    throw new Error(`[Trial] Email is required for user ${userId}`);
  }

  const emailNormalized = normalizeEmail(emailValue);
  const emailHash = hashEmail(emailNormalized);

  return await db.transaction(async (tx) => {
    await tx
      .insert(trialUsageTracking)
      .values({
        emailNormalized,
        emailHash,
        firstTrialStartedAt: now,
        lastTrialStartedAt: now,
        totalDaysUsed: 0,
      })
      .onConflictDoNothing({ target: trialUsageTracking.emailHash });

    const tracking = await tx
      .select()
      .from(trialUsageTracking)
      .where(eq(trialUsageTracking.emailHash, emailHash))
      .limit(1);

    if (!tracking.length) {
      throw new Error(
        `[Trial] Failed to load trial_usage_tracking for user ${userId}`
      );
    }

    const record = tracking[0];
    const remainingDays = 7 - record.totalDaysUsed;

    if (remainingDays <= 0) {
      console.log(
        `[Trial] User ${userId} email ${emailNormalized} already used all 7 trial days, creating Basic without trial`
      );

      await tx
        .update(users)
        .set({
          hasUsedTrial: true,
          timezone: timezone || user[0].timezone || 'Europe/Moscow',
        })
        .where(eq(users.id, userId));

      const subscription = await createBasicSubscription(
        userId,
        timezone || user[0].timezone || 'Europe/Moscow',
        false,
        tx
      );
      console.log(
        `[Trial] ✅ Created Basic subscription (without trial) for user ${userId}: subscriptionId=${subscription.id}`
      );
      return subscription;
    }

    console.log(
      `[Trial] User ${userId} email ${emailNormalized} has ${remainingDays} days remaining, creating trial for ${remainingDays} days`
    );

    const basicPlan = await tx
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

    const trialDurationMs = TRIAL_DURATION_HOURS * 60 * 60 * 1000;
    const trialEndDate = new Date(now.getTime() + trialDurationMs);
    const subscriptionEndDate = new Date(
      now.getTime() + 30 * 24 * 60 * 60 * 1000
    );

    await tx
      .update(users)
      .set({
        hasUsedTrial: true,
        trialStartedAt: now,
        trialEndedAt: trialEndDate,
        timezone: timezone || user[0].timezone || 'Europe/Moscow',
      })
      .where(eq(users.id, userId));

    console.log(
      `[Trial] Creating Basic subscription with Trial for user ${userId}...`
    );
    const [subscription] = await tx
      .insert(userSubscriptions)
      .values({
        userId,
        planId: 'basic',
        billingPeriod: 'month',
        startDate: now,
        endDate: subscriptionEndDate,
        paymentStatus: 'active',
        autoRenew: false,
        sourcePlatform: 'web',
      })
      .returning();

    if (!subscription) {
      throw new Error(`Failed to create subscription for user ${userId}`);
    }

    console.log(
      `[Trial] ✅ Created Basic subscription with Trial for user ${userId}: subscriptionId=${subscription.id}, planId=${subscription.planId}, trialEndedAt=${trialEndDate.toISOString()}`
    );

    await tx
      .update(trialUsageTracking)
      .set({
        lastTrialStartedAt: now,
        updatedAt: now,
      })
      .where(eq(trialUsageTracking.emailHash, emailHash));

    await tx.insert(subscriptionEvents).values({
      userId,
      eventType: 'trial_started',
      planId: 'basic',
      metadata: {
        startDate: now.toISOString(),
        endDate: trialEndDate.toISOString(),
        trialDurationHours: TRIAL_DURATION_HOURS,
        remainingDays,
        totalDaysUsed: record.totalDaysUsed,
      },
    });

    return subscription;
  });
}

/**
 * Создать подписку Basic (без Trial)
 */
async function createBasicSubscription(
  userId: number,
  timezone: string,
  withTrial: boolean,
  dbClient: DbOrTx = db
) {
  console.log(
    `[Trial] createBasicSubscription called for user ${userId}, withTrial=${withTrial}`
  );

  const basicPlan = await dbClient
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
  const [subscription] = await dbClient
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
