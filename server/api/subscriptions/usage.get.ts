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
import { getFeatures } from '@/server/application/subscriptions/access.service';
import { WEEKLY_OVERDRAFT_MINUTES } from '@/server/config/subscription';
import {
  isTrialActiveAt,
  normalizeBillingCollectionStatus,
  resolveCurrentEntitlementsPlan,
} from '@/server/application/subscriptions/trial-billing.service';
import { resolveAiUsagePeriodStartedAt } from '@/server/application/subscriptions/usage-window.service';
import { getRealtimeVoiceQuotaSnapshot } from '@/server/application/realtime/realtime-voice-quota.service';
import { resolveEffectiveEntitlementsPlanWithAccessGrant } from '@/server/application/promo-codes/promo-access-grants.service';

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

  // Получаем данные пользователя (timezone, trialEndedAt и id для доступа)
  const userData = await db
    .select({
      id: users.id,
      timezone: users.timezone,
      trialEndedAt: users.trialEndedAt,
      roleId: users.roleId,
      billingPlanId: users.billingPlanId,
      billingCollectionStatus: users.billingCollectionStatus,
      graceEndsAt: users.graceEndsAt,
      nextChargeAt: users.nextChargeAt,
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

  // Получаем единые фичи доступа, чтобы usage не расходился с gate в chat endpoints.
  let weeklyLimit = 0;
  let aiChatMode: 'disabled' | 'limited' | 'unlimited_fair_use' = 'disabled';
  let currentEntitlementsPlan: 'basic' | 'pro' | 'premium' = 'basic';
  let trialActive = false;

  if (userRecord) {
    const activeSub = activeSubscription[0];
    trialActive = isTrialActiveAt(userRecord.trialEndedAt, now);
    const baseEntitlementsPlan = resolveCurrentEntitlementsPlan({
      now,
      trialActive,
      billingPlanId: userRecord.billingPlanId,
      billingCollectionStatus: normalizeBillingCollectionStatus(
        userRecord.billingCollectionStatus
      ),
      graceEndsAt: userRecord.graceEndsAt,
      activePaidPlanId: activeSub?.subscription.planId ?? null,
    });
    currentEntitlementsPlan = (
      await resolveEffectiveEntitlementsPlanWithAccessGrant({
        userId: sessionResult.user.id,
        basePlanId: baseEntitlementsPlan,
        now,
      })
    ).planId;
    const entitlementsPlanRows = await db
      .select({
        id: subscriptionPlans.id,
        weeklyMinutesLimit: subscriptionPlans.weeklyMinutesLimit,
      })
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, currentEntitlementsPlan))
      .limit(1);

    const features = await getFeatures(
      userRecord,
      { planId: currentEntitlementsPlan },
      entitlementsPlanRows[0] ?? null,
      userRecord.roleId || undefined
    );

    aiChatMode = features.aiChatMode;
    weeklyLimit =
      features.aiChatMode === 'unlimited_fair_use'
        ? features.fairUseGuardMinutesPerWeek || 0
        : features.weeklyMinutesLimit || 0;
  }

  // Получаем использование
  const usagePeriodStartedAt = resolveAiUsagePeriodStartedAt({
    trialActive,
    currentEntitlementsPlan,
    activePaidSubscription: activeSubscription[0]
      ? {
          planId: activeSubscription[0].subscription.planId,
          startDate: activeSubscription[0].subscription.startDate,
        }
      : null,
    billingPlanId: userRecord?.billingPlanId ?? null,
    billingCollectionStatus: userRecord?.billingCollectionStatus ?? null,
    nextChargeAt: userRecord?.nextChargeAt ?? null,
  });
  const [usage, realtimeVoiceQuota] = await Promise.all([
    getUsageForCurrentWeek(sessionResult.user.id, timezone, {
      periodStartedAt: usagePeriodStartedAt,
    }),
    getRealtimeVoiceQuotaSnapshot({
      userId: sessionResult.user.id,
      now,
    }),
  ]);

  // Вычисляем дополнительные поля
  let availableMinutes: number;

  const allowOverdraft = aiChatMode === 'limited';

  // availableMinutes = лимит - использовано (+ overdraft только для limited).
  if (usage.usedMinutes <= weeklyLimit) {
    availableMinutes =
      weeklyLimit -
      usage.usedMinutes +
      (allowOverdraft ? WEEKLY_OVERDRAFT_MINUTES : 0);
  } else if (allowOverdraft) {
    const overdraft = usage.usedMinutes - weeklyLimit;
    availableMinutes = Math.max(0, WEEKLY_OVERDRAFT_MINUTES - overdraft);
  } else {
    availableMinutes = 0;
  }

  // Считаем overdraft только для limited режима.
  const overdraftUsed = allowOverdraft
    ? Math.max(
        0,
        Math.min(usage.usedMinutes - weeklyLimit, WEEKLY_OVERDRAFT_MINUTES)
      )
    : 0;

  return {
    ...usage,
    weeklyLimit,
    availableMinutes,
    overdraftUsed,
    realtimeVoice: {
      limitSeconds: realtimeVoiceQuota.limitSeconds,
      usedSeconds: realtimeVoiceQuota.usedSeconds,
      remainingSeconds: realtimeVoiceQuota.remainingSeconds,
      resetsAt: realtimeVoiceQuota.resetsAt.toISOString(),
    },
  };
});
