import { eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  billingScheduleAdjustments,
  userSubscriptions,
  users,
} from '@/server/infrastructure/db/schema';
import { addDays } from './promo.shared';
import { getCurrentActiveSubscription } from '@/server/application/subscriptions/current-subscription.service';
import { handleMissingPromoInfrastructureError } from './promo-infrastructure-compat.service';

function resolveDbClient(tx?: any) {
  return tx ?? db;
}

export async function getEffectiveBillingShiftDaysForUser(params: {
  userId: number;
  now?: Date;
  tx?: any;
}) {
  const now = params.now ?? new Date();
  const client = resolveDbClient(params.tx);

  try {
    const activeSubscription = await getCurrentActiveSubscription({
      userId: params.userId,
      now,
      tx: client,
    });

    // Для basic-плана и отсутствия активной подписки (trial/expired) — 0:
    // у них смещение видно через trialEndedAt/nextChargeAt, а не через endDate подписки.
    if (!activeSubscription || activeSubscription.planId === 'basic') {
      return 0;
    }

    // Вычисляем сдвиг относительно «нативной» длины периода.
    // Это правильная семантика: после того как пользователь оплатил следующий
    // цикл, исторический сдвиг уже поглощён — сумма всех billing_schedule_adjustments
    // за всё время жизни аккаунта больше не отражает реальное состояние.
    const periodMs =
      (activeSubscription.billingPeriod === 'year' ? 365 : 30) *
      24 *
      60 *
      60 *
      1000;
    const expectedEndMs = activeSubscription.startDate.getTime() + periodMs;
    const diffDays = Math.round(
      (activeSubscription.endDate.getTime() - expectedEndMs) /
        (24 * 60 * 60 * 1000)
    );

    return Math.max(0, diffDays);
  } catch (error) {
    if (
      handleMissingPromoInfrastructureError(
        error,
        'promo-billing-adjustments:get-effective-days'
      )
    ) {
      return 0;
    }

    throw error;
  }
}

export async function applyBillingScheduleAdjustment(params: {
  userId: number;
  days: number;
  reason: string;
  sourceCampaignId?: number | null;
  sourceRedemptionId?: number | null;
  sourceAccessGrantId?: number | null;
  now?: Date;
  tx?: any;
}) {
  const now = params.now ?? new Date();
  const client = resolveDbClient(params.tx);

  if (!Number.isFinite(params.days) || params.days <= 0) {
    return {
      shiftApplied: false,
      activeSubscriptionId: null as number | null,
      nextChargeAt: null as Date | null,
      scheduledChangeAt: null as Date | null,
      shiftedEndDate: null as Date | null,
      trialEndedAt: null as Date | null,
    };
  }

  const activeSubscription = await getCurrentActiveSubscription({
    userId: params.userId,
    now,
    tx: client,
  });

  const [userRow] = await client
    .select({
      nextChargeAt: users.nextChargeAt,
      scheduledChangeAt: users.scheduledChangeAt,
      trialEndedAt: users.trialEndedAt,
    })
    .from(users)
    .where(eq(users.id, params.userId))
    .limit(1);

  // Ветка для trial-пользователя без активной платной подписки: честный сдвиг
  // по смыслу должен сдвинуть trialEndedAt и запланированный nextChargeAt,
  // иначе юзер увидит overlay Pro/Premium, а деньги спишут в исходную дату.
  const hasActivePaid =
    activeSubscription && activeSubscription.planId !== 'basic';
  const trialActive =
    userRow?.trialEndedAt && userRow.trialEndedAt.getTime() > now.getTime();

  if (!hasActivePaid && trialActive) {
    const shiftedTrialEndedAt = addDays(
      userRow!.trialEndedAt as Date,
      params.days
    );
    const shiftedNextChargeAt = userRow?.nextChargeAt
      ? addDays(userRow.nextChargeAt, params.days)
      : null;

    await client
      .update(users)
      .set({
        trialEndedAt: shiftedTrialEndedAt,
        nextChargeAt: shiftedNextChargeAt,
        updatedAt: now,
      })
      .where(eq(users.id, params.userId));

    await client.insert(billingScheduleAdjustments).values({
      userId: params.userId,
      days: params.days,
      reason: params.reason,
      sourceCampaignId: params.sourceCampaignId ?? null,
      sourceRedemptionId: params.sourceRedemptionId ?? null,
      sourceAccessGrantId: params.sourceAccessGrantId ?? null,
      activeSubscriptionId: null,
      appliedAt: now,
      metadata: {
        shiftedFromTrialEndedAt: userRow?.trialEndedAt?.toISOString() || null,
        shiftedToTrialEndedAt: shiftedTrialEndedAt.toISOString(),
        shiftedFromNextChargeAt: userRow?.nextChargeAt?.toISOString() || null,
        shiftedToNextChargeAt: shiftedNextChargeAt?.toISOString() || null,
        trialShift: true,
      },
    });

    return {
      shiftApplied: true,
      activeSubscriptionId: null,
      nextChargeAt: shiftedNextChargeAt,
      scheduledChangeAt: null,
      shiftedEndDate: null,
      trialEndedAt: shiftedTrialEndedAt,
    };
  }

  if (!activeSubscription || activeSubscription.planId === 'basic') {
    return {
      shiftApplied: false,
      activeSubscriptionId: null as number | null,
      nextChargeAt: null as Date | null,
      scheduledChangeAt: null as Date | null,
      shiftedEndDate: null as Date | null,
      trialEndedAt: null as Date | null,
    };
  }

  const shiftedEndDate = addDays(activeSubscription.endDate, params.days);
  const shiftedNextChargeAt = userRow?.nextChargeAt
    ? addDays(userRow.nextChargeAt, params.days)
    : null;
  const shiftedScheduledChangeAt = userRow?.scheduledChangeAt
    ? addDays(userRow.scheduledChangeAt, params.days)
    : null;

  await client
    .update(userSubscriptions)
    .set({
      endDate: shiftedEndDate,
      updatedAt: now,
    })
    .where(eq(userSubscriptions.id, activeSubscription.id));

  await client
    .update(users)
    .set({
      nextChargeAt: shiftedNextChargeAt,
      scheduledChangeAt: shiftedScheduledChangeAt,
      updatedAt: now,
    })
    .where(eq(users.id, params.userId));

  await client.insert(billingScheduleAdjustments).values({
    userId: params.userId,
    days: params.days,
    reason: params.reason,
    sourceCampaignId: params.sourceCampaignId ?? null,
    sourceRedemptionId: params.sourceRedemptionId ?? null,
    sourceAccessGrantId: params.sourceAccessGrantId ?? null,
    activeSubscriptionId: activeSubscription.id,
    appliedAt: now,
    metadata: {
      shiftedFromEndDate: activeSubscription.endDate.toISOString(),
      shiftedToEndDate: shiftedEndDate.toISOString(),
      shiftedFromNextChargeAt: userRow?.nextChargeAt?.toISOString() || null,
      shiftedToNextChargeAt: shiftedNextChargeAt?.toISOString() || null,
      shiftedFromScheduledChangeAt:
        userRow?.scheduledChangeAt?.toISOString() || null,
      shiftedToScheduledChangeAt:
        shiftedScheduledChangeAt?.toISOString() || null,
    },
  });

  return {
    shiftApplied: true,
    activeSubscriptionId: activeSubscription.id,
    nextChargeAt: shiftedNextChargeAt,
    scheduledChangeAt: shiftedScheduledChangeAt,
    shiftedEndDate,
    trialEndedAt: null,
  };
}
