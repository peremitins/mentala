import { and, eq, gt, gte, or, lte, isNull } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  realtimeVoiceSessions,
  userSubscriptions,
  users,
} from '@/server/infrastructure/db/schema';
import { calculateUsageSecondsForSessionsInWindow } from '@/server/application/subscriptions/usage-calculation.utils';
import {
  normalizeBillingCollectionStatus,
  resolveCurrentEntitlementsPlan,
  isTrialActiveAt,
} from '@/server/application/subscriptions/trial-billing.service';
import { resolveAiUsagePeriodStartedAt } from '@/server/application/subscriptions/usage-window.service';
import {
  REALTIME_VOICE_HARD_CEILING_SECONDS,
  REALTIME_VOICE_IDLE_TIMEOUT_SECONDS,
  REALTIME_VOICE_MONTHLY_LIMIT_MINUTES,
} from '@/server/config/realtime';
import { resolveRealtimeVoiceQuotaPeriod } from './realtime-voice-period.utils';

export type RealtimeVoiceQuotaSnapshot = {
  limitSeconds: number;
  usedSeconds: number;
  remainingSeconds: number;
  periodKey: string;
  startedAt: Date;
  resetsAt: Date;
};

async function resolveRealtimeAccessPeriodStartedAt(userId: number, now: Date) {
  const userRows = await db
    .select({
      trialStartedAt: users.trialStartedAt,
      trialEndedAt: users.trialEndedAt,
      billingPlanId: users.billingPlanId,
      billingCollectionStatus: users.billingCollectionStatus,
      nextChargeAt: users.nextChargeAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const user = userRows[0];
  if (!user) {
    return null;
  }

  const trialActive = isTrialActiveAt(user.trialEndedAt, now);
  if (trialActive && user.trialStartedAt) {
    return user.trialStartedAt;
  }

  const activeSubscriptionRows = await db
    .select({
      subscription: userSubscriptions,
    })
    .from(userSubscriptions)
    .where(
      and(
        eq(userSubscriptions.userId, userId),
        eq(userSubscriptions.paymentStatus, 'active'),
        gt(userSubscriptions.endDate, now)
      )
    )
    .limit(1);

  const activeSubscription = activeSubscriptionRows[0]?.subscription ?? null;
  const currentEntitlementsPlan = resolveCurrentEntitlementsPlan({
    now,
    trialActive,
    billingPlanId: user.billingPlanId,
    billingCollectionStatus: normalizeBillingCollectionStatus(
      user.billingCollectionStatus
    ),
    graceEndsAt: null,
    activePaidPlanId: activeSubscription?.planId ?? null,
  });

  return resolveAiUsagePeriodStartedAt({
    trialActive,
    currentEntitlementsPlan,
    activePaidSubscription: activeSubscription
      ? {
          planId: activeSubscription.planId,
          startDate: activeSubscription.startDate,
        }
      : null,
    billingPlanId: user.billingPlanId ?? null,
    billingCollectionStatus: user.billingCollectionStatus ?? null,
    nextChargeAt: user.nextChargeAt ?? null,
  });
}

export async function getRealtimeVoiceQuotaSnapshot(params: {
  userId: number;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const accessPeriodStartedAt = await resolveRealtimeAccessPeriodStartedAt(
    params.userId,
    now
  );
  const quotaPeriod = resolveRealtimeVoiceQuotaPeriod({
    accessPeriodStartedAt,
    now,
  });

  const sessions = await db
    .select({
      startedAt: realtimeVoiceSessions.startedAt,
      endedAt: realtimeVoiceSessions.endedAt,
      lastActivityAt: realtimeVoiceSessions.lastActivityAt,
    })
    .from(realtimeVoiceSessions)
    .where(
      and(
        eq(realtimeVoiceSessions.userId, params.userId),
        or(
          and(
            gte(realtimeVoiceSessions.startedAt, quotaPeriod.startedAt),
            lte(realtimeVoiceSessions.startedAt, quotaPeriod.endsAt)
          ),
          and(
            lte(realtimeVoiceSessions.startedAt, quotaPeriod.startedAt),
            or(
              isNull(realtimeVoiceSessions.endedAt),
              gt(realtimeVoiceSessions.endedAt, quotaPeriod.startedAt)
            )
          )
        )
      )
    );

  const limitSeconds = REALTIME_VOICE_MONTHLY_LIMIT_MINUTES * 60;
  const usedSeconds = calculateUsageSecondsForSessionsInWindow(sessions, {
    windowStart: quotaPeriod.startedAt,
    windowEnd: quotaPeriod.endsAt,
    idleTimeoutMs: REALTIME_VOICE_IDLE_TIMEOUT_SECONDS * 1000,
    now,
  });

  const remainingSeconds = Math.max(0, limitSeconds - usedSeconds);

  return {
    limitSeconds,
    usedSeconds,
    remainingSeconds,
    periodKey: quotaPeriod.key,
    startedAt: quotaPeriod.startedAt,
    resetsAt: quotaPeriod.endsAt,
  } satisfies RealtimeVoiceQuotaSnapshot;
}

export function resolveRealtimeVoiceMaxDurationSeconds(params: {
  remainingMonthlySeconds: number;
  remainingWeeklyMinutes: number;
}) {
  return Math.max(
    0,
    Math.min(
      params.remainingMonthlySeconds,
      params.remainingWeeklyMinutes * 60,
      REALTIME_VOICE_HARD_CEILING_SECONDS
    )
  );
}
