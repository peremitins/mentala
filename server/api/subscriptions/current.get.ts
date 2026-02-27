import { getSessionUser } from '@/server/application/auth/session';
import { setHeader, getQuery, createError } from 'h3';
import { db } from '@/server/infrastructure/db/client';
import { subscriptionPlans, users } from '@/server/infrastructure/db/schema';
import { eq } from 'drizzle-orm';
import { getFeatures } from '@/server/application/subscriptions/access.service';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import {
  expireOutdatedActiveSubscriptions,
  getCurrentActiveSubscriptionWithPlan,
} from '@/server/application/subscriptions/current-subscription.service';
import {
  isTrialActiveAt,
  canRunChargeAttemptNow,
  isTrialBillingPeriod,
  isTrialBillingPlanId,
  normalizeBillingCollectionStatus,
  resolveCurrentEntitlementsPlan,
} from '@/server/application/subscriptions/trial-billing.service';
import { syncPendingPaymentMethodBinding } from '@/server/application/subscriptions/payment-methods.service';
import { runTrialBillingForUser } from '@/server/application/subscriptions/trial-billing-worker.service';

interface ScheduledChangeResponse {
  planId: string;
  billingPeriod: 'month' | 'year';
  effectiveAt: string;
}

async function readCurrentUserBillingRow(userId: number) {
  const rows = await db
    .select({
      id: users.id,
      billingCredit: users.billingCredit,
      hasUsedTrial: users.hasUsedTrial,
      timezone: users.timezone,
      trialEndedAt: users.trialEndedAt,
      roleId: users.roleId,
      updatedAt: users.updatedAt,
      scheduledPlanId: users.scheduledPlanId,
      scheduledBillingPeriod: users.scheduledBillingPeriod,
      scheduledChangeAt: users.scheduledChangeAt,
      billingPlanId: users.billingPlanId,
      billingPeriod: users.billingPeriod,
      nextChargeAt: users.nextChargeAt,
      paymentMethodBound: users.paymentMethodBound,
      paymentMethodId: users.paymentMethodId,
      paymentMethodType: users.paymentMethodType,
      paymentMethodTitle: users.paymentMethodTitle,
      paymentMethodCardBrand: users.paymentMethodCardBrand,
      paymentMethodCardLast4: users.paymentMethodCardLast4,
      paymentMethodCardExpiryMonth: users.paymentMethodCardExpiryMonth,
      paymentMethodCardExpiryYear: users.paymentMethodCardExpiryYear,
      paymentMethodBindingId: users.paymentMethodBindingId,
      paymentMethodBindingStatus: users.paymentMethodBindingStatus,
      billingCollectionStatus: users.billingCollectionStatus,
      graceEndsAt: users.graceEndsAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return rows[0];
}

function buildScheduledChange(params: {
  planId?: string | null;
  billingPeriod?: string | null;
  effectiveAt?: Date | null;
}): ScheduledChangeResponse | null {
  const planId = String(params.planId || '').trim();
  const billingPeriodRaw = String(params.billingPeriod || '').trim();
  if (!planId) return null;
  if (billingPeriodRaw !== 'month' && billingPeriodRaw !== 'year') return null;
  if (!params.effectiveAt) return null;

  return {
    planId,
    billingPeriod: billingPeriodRaw,
    effectiveAt: params.effectiveAt.toISOString(),
  };
}

/**
 * GET /api/subscriptions/current
 * Текущее состояние подписки/триала/billing для UI.
 * Поддерживает query-параметр ?userId=123 только для admin/support.
 */
export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    setHeader(event, 'Cache-Control', 'private, no-store');
    return {
      plan: 'basic',
      trialActive: false,
      trialEndsAt: null,
      currentEntitlementsPlan: 'basic',
      billingPlan: null,
      billingPeriod: null,
      nextChargeAt: null,
      paymentMethodBound: false,
      paymentMethod: null,
      billingCollectionStatus: 'none',
      graceEndsAt: null,
      features: {
        ai: false,
        avatar: false,
        aiChatMode: 'disabled' as const,
        weeklyMinutesLimit: 0,
        fairUseGuardMinutesPerWeek: null,
      },
      subscription: null,
      noActiveSubscription: true,
      scheduledChange: null,
    };
  }

  const query = getQuery(event);
  let targetUserId = sessionResult.user.id;

  if (query.userId) {
    const requestedUserId = Number(query.userId);
    if (
      Number.isFinite(requestedUserId) &&
      requestedUserId !== sessionResult.user.id
    ) {
      const viewer = await getSessionUserWithRole(event);
      if (!viewer || !['admin', 'support'].includes(viewer.role)) {
        throw createError({
          statusCode: 403,
          statusMessage:
            'Forbidden: Only admin and support can view other users subscriptions',
        });
      }
      targetUserId = requestedUserId;
    }
  }

  const now = new Date();
  await expireOutdatedActiveSubscriptions({
    userId: targetUserId,
    now,
  });

  let userRecord = await readCurrentUserBillingRow(targetUserId);
  if (!userRecord) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found',
    });
  }

  const shouldSyncPendingBinding =
    !userRecord.paymentMethodBound &&
    !userRecord.paymentMethodId &&
    userRecord.paymentMethodBindingId &&
    userRecord.paymentMethodBindingStatus === 'pending';

  if (shouldSyncPendingBinding) {
    const config = useRuntimeConfig(event);
    const shopId = String(config.yookassaShopId || '').trim();
    const secretKey = String(config.yookassaSecretKey || '').trim();

    if (shopId && secretKey) {
      try {
        const syncResult = await syncPendingPaymentMethodBinding({
          userId: targetUserId,
          shopId,
          secretKey,
          now,
        });

        if (syncResult.synced) {
          const refreshed = await readCurrentUserBillingRow(targetUserId);
          if (refreshed) {
            userRecord = refreshed;
          }
        }
      } catch (error) {
        event.context.logger?.warn(
          {
            userId: targetUserId,
            paymentMethodBindingId: userRecord.paymentMethodBindingId,
            error,
          },
          'Failed to sync pending payment method binding in /current'
        );
      }
    }
  }

  const billingStatus = normalizeBillingCollectionStatus(
    userRecord.billingCollectionStatus
  );
  const shouldTryOnDemandTrialCharge =
    isTrialBillingPlanId(userRecord.billingPlanId) &&
    isTrialBillingPeriod(userRecord.billingPeriod) &&
    billingStatus !== 'none' &&
    canRunChargeAttemptNow(userRecord.nextChargeAt, now) &&
    Boolean(userRecord.paymentMethodBound && userRecord.paymentMethodId);

  // Self-heal: если фоновой worker задержался/не запущен, пробуем точечно
  // выполнить списание при запросе /api/subscriptions/current.
  if (shouldTryOnDemandTrialCharge) {
    const config = useRuntimeConfig(event);
    const shopId = String(config.yookassaShopId || '').trim();
    const secretKey = String(config.yookassaSecretKey || '').trim();

    if (shopId && secretKey) {
      try {
        await runTrialBillingForUser({
          userId: targetUserId,
          workerId: `api-current-self-heal:${process.pid}`,
          shopId,
          secretKey,
          now,
        });

        const refreshed = await readCurrentUserBillingRow(targetUserId);
        if (refreshed) {
          userRecord = refreshed;
        }
      } catch (error) {
        event.context.logger?.warn(
          {
            userId: targetUserId,
            nextChargeAt: userRecord.nextChargeAt,
            billingStatus,
            error,
          },
          'Failed to run on-demand trial charge in /current'
        );
      }
    }
  }

  const activeSubscription = await getCurrentActiveSubscriptionWithPlan({
    userId: targetUserId,
    now,
  });

  let scheduledChange = buildScheduledChange({
    planId: userRecord.scheduledPlanId,
    billingPeriod: userRecord.scheduledBillingPeriod,
    effectiveAt: userRecord.scheduledChangeAt,
  });

  const shouldClearStaleScheduledChange =
    scheduledChange &&
    (!activeSubscription ||
      (userRecord.scheduledChangeAt
        ? userRecord.scheduledChangeAt.getTime() <= now.getTime()
        : true));

  if (shouldClearStaleScheduledChange) {
    await db
      .update(users)
      .set({
        scheduledPlanId: null,
        scheduledBillingPeriod: null,
        scheduledChangeAt: null,
        scheduledFromSubscriptionId: null,
        scheduledChangeUpdatedAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, targetUserId));
    scheduledChange = null;
  }

  const trialActive = isTrialActiveAt(userRecord.trialEndedAt, now);
  const billingCollectionStatus = normalizeBillingCollectionStatus(
    userRecord.billingCollectionStatus
  );
  const currentEntitlementsPlan = resolveCurrentEntitlementsPlan({
    now,
    trialActive,
    billingPlanId: userRecord.billingPlanId,
    billingCollectionStatus,
    graceEndsAt: userRecord.graceEndsAt,
    activePaidPlanId: activeSubscription?.subscription.planId ?? null,
  });

  // Для корректного расчета лимитов берем конфиг эффективного плана доступа.
  const effectivePlanRows = await db
    .select({
      id: subscriptionPlans.id,
      weeklyMinutesLimit: subscriptionPlans.weeklyMinutesLimit,
    })
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.id, currentEntitlementsPlan))
    .limit(1);

  const features = await getFeatures(
    { id: targetUserId, trialEndedAt: userRecord.trialEndedAt },
    { planId: currentEntitlementsPlan },
    effectivePlanRows[0] ?? null,
    userRecord.roleId || 'user'
  );

  const subscriptionDto = activeSubscription
    ? {
        id: activeSubscription.subscription.id,
        planId: activeSubscription.subscription.planId,
        startDate: activeSubscription.subscription.startDate,
        endDate: activeSubscription.subscription.endDate,
        paymentStatus: activeSubscription.subscription.paymentStatus,
        autoRenew: activeSubscription.subscription.autoRenew,
        sourcePlatform: activeSubscription.subscription.sourcePlatform,
        billingPeriod: activeSubscription.subscription.billingPeriod,
        createdAt: activeSubscription.subscription.createdAt,
        updatedAt: activeSubscription.subscription.updatedAt,
        plan: {
          id: activeSubscription.plan.id,
          name: activeSubscription.plan.name,
          basePrice: Number(activeSubscription.plan.basePrice),
          weeklyMinutesLimit: activeSubscription.plan.weeklyMinutesLimit,
          avatarEnabled: false,
        },
      }
    : null;

  const response = {
    plan: currentEntitlementsPlan,
    trialActive,
    trialEndsAt: userRecord.trialEndedAt?.toISOString() || null,
    currentEntitlementsPlan,
    billingPlan: isTrialBillingPlanId(userRecord.billingPlanId)
      ? userRecord.billingPlanId
      : null,
    billingPeriod: isTrialBillingPeriod(userRecord.billingPeriod)
      ? userRecord.billingPeriod
      : null,
    nextChargeAt: userRecord.nextChargeAt?.toISOString() || null,
    paymentMethodBound: Boolean(
      userRecord.paymentMethodBound && userRecord.paymentMethodId
    ),
    paymentMethod:
      userRecord.paymentMethodBound && userRecord.paymentMethodId
        ? {
            id: userRecord.paymentMethodId,
            type: userRecord.paymentMethodType || null,
            title: userRecord.paymentMethodTitle || null,
            cardBrand: userRecord.paymentMethodCardBrand || null,
            last4: userRecord.paymentMethodCardLast4 || null,
            expiryMonth: userRecord.paymentMethodCardExpiryMonth || null,
            expiryYear: userRecord.paymentMethodCardExpiryYear || null,
          }
        : null,
    billingCollectionStatus,
    graceEndsAt: userRecord.graceEndsAt?.toISOString() || null,
    features,
    subscription: subscriptionDto,
    user: {
      billingCredit: Number(userRecord.billingCredit),
      hasUsedTrial: userRecord.hasUsedTrial,
      timezone: userRecord.timezone,
    },
    noActiveSubscription: !activeSubscription,
    scheduledChange,
  };

  setHeader(event, 'Cache-Control', 'private, no-store');
  if (userRecord.updatedAt) {
    setHeader(
      event,
      'ETag',
      `"${targetUserId}-${currentEntitlementsPlan}-${userRecord.updatedAt.getTime()}"`
    );
  }

  return response;
});
