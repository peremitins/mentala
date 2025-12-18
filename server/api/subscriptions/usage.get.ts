import { getSessionUser } from '@/server/application/auth/session';
import { createError } from 'h3';
import { db } from '@/server/infrastructure/db/client';
import {
  users,
  userSubscriptions,
  subscriptionPlans,
} from '@/server/infrastructure/db/schema';
import { eq, and, desc, gt } from 'drizzle-orm';
import { getUsageForCurrentWeek } from '@/server/application/subscriptions/session-time.service';
import {
  getWeeklyMinutesLimit,
  isTrialActive,
} from '@/server/application/subscriptions/access.service';
import { WEEKLY_OVERDRAFT_MINUTES } from '@/server/config/subscription';

/**
 * GET /api/subscriptions/usage
 * Получить использование минут в текущей неделе
 */
export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }

  // Получаем данные пользователя (timezone и trialEndedAt)
  const userData = await db
    .select({
      timezone: users.timezone,
      trialEndedAt: users.trialEndedAt,
    })
    .from(users)
    .where(eq(users.id, sessionResult.user.id))
    .limit(1);

  const timezone = userData[0]?.timezone || 'Europe/Moscow';
  const userRecord = userData[0];

  // Получаем активную не истекшую подписку
  // Лимит берем только из реально активной подписки или из Basic+Trial
  const now = new Date();
  const activeSubscription = await db
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
        eq(userSubscriptions.userId, sessionResult.user.id),
        eq(userSubscriptions.paymentStatus, 'active'),
        gt(userSubscriptions.endDate, now) // подписка не истекла
      )
    )
    .orderBy(desc(userSubscriptions.createdAt))
    .limit(1);

  // Используем getWeeklyMinutesLimit для правильного расчета лимита (учитывает Trial)
  let weeklyLimit = 0;
  if (activeSubscription.length && userRecord) {
    const sub = activeSubscription[0];
    const subscriptionForFeatures = {
      planId: sub.subscription.planId,
      customConfig: sub.subscription.customConfig || undefined,
    };
    weeklyLimit = await getWeeklyMinutesLimit(
      userRecord,
      subscriptionForFeatures,
      sub.plan
    );
  } else if (userRecord) {
    // Если нет активной подписки, но есть пользователь - проверяем Trial для Basic
    // Если Trial активен, даем DEFAULT_WEEKLY_MINUTES_LIMIT минут (как Premium)
    if (isTrialActive(userRecord)) {
      const { DEFAULT_WEEKLY_MINUTES_LIMIT } = await import(
        '@/server/config/subscription'
      );
      weeklyLimit = DEFAULT_WEEKLY_MINUTES_LIMIT;
    } else {
      weeklyLimit = 0;
    }
  }

  // Получаем использование
  const usage = await getUsageForCurrentWeek(sessionResult.user.id, timezone);

  // Вычисляем дополнительные поля
  let availableMinutes: number;
  let overdraftUsed: number;

  // availableMinutes = лимит - использовано + overdraft (overdraft всегда доступен)
  // Если превышен лимит, то availableMinutes = overdraft - перерасход
  if (usage.usedMinutes <= weeklyLimit) {
    // В пределах лимита: доступно = лимит - использовано + overdraft
    availableMinutes =
      weeklyLimit - usage.usedMinutes + WEEKLY_OVERDRAFT_MINUTES;
  } else {
    // Превышен лимит: доступно = overdraft - перерасход
    const overdraft = usage.usedMinutes - weeklyLimit;
    availableMinutes = Math.max(0, WEEKLY_OVERDRAFT_MINUTES - overdraft);
  }

  // overdraftUsed = сколько минут использовано сверх лимита (но не больше overdraft)
  overdraftUsed = Math.max(
    0,
    Math.min(usage.usedMinutes - weeklyLimit, WEEKLY_OVERDRAFT_MINUTES)
  );

  return {
    ...usage,
    weeklyLimit,
    availableMinutes,
    overdraftUsed,
  };
});
