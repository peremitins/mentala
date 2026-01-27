import { db } from '@/server/infrastructure/db/client';
import {
  subscriptionPlans,
  userSubscriptions,
  users,
} from '@/server/infrastructure/db/schema';
import { and, desc, eq, gt } from 'drizzle-orm';
import { getFeatures, isTrialActive } from './access.service';
import { getUsageForCurrentWeek } from './session-time.service';
import { WEEKLY_OVERDRAFT_MINUTES } from '@/server/config/subscription';

export type AiUsageGateStatus = 'ok' | 'no_ai_access' | 'weekly_limit_reached';

/**
 * Серверная проверка доступа к AI + лимита минут.
 * Использовать в критичных местах (start therapy session, chat endpoints).
 */
export async function getAiUsageGate(
  userId: number,
  userRole?: string // Передавать роль для premium доступа служебных ролей
): Promise<{
  status: AiUsageGateStatus;
  trialActive: boolean;
  timezone: string;
  weeklyLimit: number;
  usedMinutes: number;
  availableMinutes: number;
  overdraftUsed: number;
}> {
  const now = new Date();

  const userRows = await db
    .select({
      timezone: users.timezone,
      trialEndedAt: users.trialEndedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const user = userRows[0];
  const timezone = user?.timezone || 'Europe/Moscow';
  const trialActive = user ? isTrialActive(user) : false;

  // Берём только реально активную и не истёкшую подписку (endDate > now),
  // чтобы доступ/лимиты не подтягивались из просроченных записей.
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
        eq(userSubscriptions.userId, userId),
        eq(userSubscriptions.paymentStatus, 'active'),
        gt(userSubscriptions.endDate, now)
      )
    )
    .orderBy(desc(userSubscriptions.createdAt))
    .limit(1);

  const sub = activeSubscription[0]?.subscription;
  const plan = activeSubscription[0]?.plan;

  const subscriptionForFeatures = sub ? { planId: sub.planId } : null;

  const features = user
    ? await getFeatures(
        { id: userId, trialEndedAt: user.trialEndedAt },
        subscriptionForFeatures,
        plan,
        userRole
      )
    : { ai: false, avatar: false, weeklyMinutesLimit: 0 };

  if (!features.ai) {
    return {
      status: 'no_ai_access',
      trialActive,
      timezone,
      weeklyLimit: 0,
      usedMinutes: 0,
      availableMinutes: 0,
      overdraftUsed: 0,
    };
  }

  const weeklyLimit = features.weeklyMinutesLimit;
  const usage = await getUsageForCurrentWeek(userId, timezone);
  const usedMinutes = usage.usedMinutes;

  let availableMinutes: number;
  if (usedMinutes <= weeklyLimit) {
    availableMinutes = weeklyLimit - usedMinutes + WEEKLY_OVERDRAFT_MINUTES;
  } else {
    const overdraft = usedMinutes - weeklyLimit;
    availableMinutes = Math.max(0, WEEKLY_OVERDRAFT_MINUTES - overdraft);
  }

  const overdraftUsed = Math.max(
    0,
    Math.min(usedMinutes - weeklyLimit, WEEKLY_OVERDRAFT_MINUTES)
  );

  if (availableMinutes <= 0) {
    return {
      status: 'weekly_limit_reached',
      trialActive,
      timezone,
      weeklyLimit,
      usedMinutes,
      availableMinutes,
      overdraftUsed,
    };
  }

  return {
    status: 'ok',
    trialActive,
    timezone,
    weeklyLimit,
    usedMinutes,
    availableMinutes,
    overdraftUsed,
  };
}
