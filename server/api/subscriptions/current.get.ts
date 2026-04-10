import { getSessionUser } from '@/server/application/auth/session';
import { setHeader, getQuery, createError, getHeader } from 'h3';
import { db } from '@/server/infrastructure/db/client';
import {
  subscriptionEvents,
  subscriptionPlans,
  users,
} from '@/server/infrastructure/db/schema';
import { eq } from 'drizzle-orm';
import { getFeatures } from '@/server/application/subscriptions/access.service';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import {
  expireOutdatedActiveSubscriptions,
  getCurrentActiveSubscriptionWithPlan,
} from '@/server/application/subscriptions/current-subscription.service';
import {
  isTrialActiveAt,
  canRunTrialBillingAttemptNow,
  isTrialBillingPeriod,
  isTrialBillingPlanId,
  normalizeBillingCollectionStatus,
  resolveCurrentEntitlementsPlan,
} from '@/server/application/subscriptions/trial-billing.service';
import { syncPendingPaymentMethodBinding } from '@/server/application/subscriptions/payment-methods.service';
import { runTrialBillingForUser } from '@/server/application/subscriptions/trial-billing-worker.service';
import { runScheduledPlanChangeForUser } from '@/server/application/subscriptions/scheduled-plan-change.service';
import { getOrCreateAppleAppAccountToken } from '@/server/application/subscriptions/apple-app-account-token.service';
import { normalizeStorefrontCountryCode } from '@/shared/utils/storefront';
import { resolveEffectiveEntitlementsPlanWithAccessGrant } from '@/server/application/promo-codes/promo-access-grants.service';
import { getEffectiveBillingShiftDaysForUser } from '@/server/application/promo-codes/billing-schedule-adjustments.service';
import { listPendingDiscountGrantsForUser } from '@/server/application/promo-codes/promo-discount-grants.service';
import { isMissingPromoOrReferralInfrastructureError } from '@/server/application/promo-codes/promo-infrastructure-compat.service';
import { getReferralSummary } from '@/server/application/referral/referral-rewards.service';
import { releaseDueBillingCredits } from '@/server/application/subscriptions/billing-credit.service';

interface ScheduledChangeResponse {
  planId: string;
  billingPeriod: 'month' | 'year';
  effectiveAt: string;
}

type SourcePlatform = 'web' | 'ios' | 'android';

function resolveSourcePlatform(event: any): SourcePlatform {
  const platformHeader = String(getHeader(event, 'x-platform') || '')
    .trim()
    .toLowerCase();
  if (platformHeader === 'ios') return 'ios';
  if (platformHeader === 'android') return 'android';
  return 'web';
}

function normalizeStorefrontCountry(value: unknown): string | null {
  return normalizeStorefrontCountryCode(value);
}

function resolveBillingProviderHint(params: {
  platform: SourcePlatform;
  storefrontCountry: string | null;
}): 'yookassa' | 'apple_iap' {
  // Разводим payment-flow только на iOS. На остальных платформах пока используется YooKassa.
  if (params.platform !== 'ios') {
    return 'yookassa';
  }

  // Безопасное поведение: если storefront не получили — по умолчанию WW-flow (Apple IAP).
  return params.storefrontCountry === 'RU' ? 'yookassa' : 'apple_iap';
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
      billingRegionSource: users.billingRegionSource,
      billingStorefrontCountry: users.billingStorefrontCountry,
      billingStorefrontUpdatedAt: users.billingStorefrontUpdatedAt,
      appleAppAccountToken: users.appleAppAccountToken,
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
 * Поддерживает query-параметр ?userId=123 только для admin.
 */
export default defineEventHandler(async (event) => {
  const sourcePlatform = resolveSourcePlatform(event);
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
      storefrontCountry: null,
      appleAppAccountToken: null,
      billingProviderHint: resolveBillingProviderHint({
        platform: sourcePlatform,
        storefrontCountry: null,
      }),
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
      if (!viewer || viewer.role !== 'admin') {
        throw createError({
          statusCode: 403,
          statusMessage:
            'Forbidden: Only admin can view other users subscriptions',
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
  await releaseDueBillingCredits({
    userId: targetUserId,
    now,
  }).catch(() => {
    // Не валим текущее чтение из-за фона release-path.
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

  const billingStatusAfterBindingSync = normalizeBillingCollectionStatus(
    userRecord.billingCollectionStatus
  );
  // Deferred finalize нужен только для незавершенного trial-case:
  // nextChargeAt должен оставаться в окне исходного trial (не позже trialEndedAt).
  const hasDeferredTrialChargeWindow = Boolean(
    userRecord.nextChargeAt &&
      userRecord.trialEndedAt &&
      userRecord.nextChargeAt.getTime() <= userRecord.trialEndedAt.getTime()
  );
  const shouldFinalizeDeferredTrialScheduling =
    Boolean(userRecord.paymentMethodBound && userRecord.paymentMethodId) &&
    isTrialBillingPlanId(userRecord.billingPlanId) &&
    isTrialBillingPeriod(userRecord.billingPeriod) &&
    billingStatusAfterBindingSync === 'none' &&
    hasDeferredTrialChargeWindow;

  // Self-heal: если пользователь выбрал план в trial, прошел bind-flow,
  // но не вернулся в ожидаемом фронтовом сценарии (повторный start-checkout),
  // финализируем scheduled-состояние автоматически на чтении /current.
  if (shouldFinalizeDeferredTrialScheduling) {
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          billingCollectionStatus: 'scheduled',
          graceEndsAt: null,
          billingReminderSentAt: null,
          billingLockedAt: null,
          billingLockedBy: null,
          updatedAt: now,
        })
        .where(eq(users.id, targetUserId));

      await tx.insert(subscriptionEvents).values({
        userId: targetUserId,
        eventType: 'trial_billing_scheduled',
        planId: userRecord.billingPlanId,
        metadata: {
          billingPlanId: userRecord.billingPlanId,
          billingPeriod: userRecord.billingPeriod,
          nextChargeAt: userRecord.nextChargeAt?.toISOString() || null,
          paymentMethodId: userRecord.paymentMethodId,
          source: 'current_self_heal_after_binding',
        },
      });
    });

    const refreshed = await readCurrentUserBillingRow(targetUserId);
    if (refreshed) {
      userRecord = refreshed;
    }
  }

  const billingStatus = normalizeBillingCollectionStatus(
    userRecord.billingCollectionStatus
  );
  const shouldTryOnDemandTrialCharge =
    isTrialBillingPlanId(userRecord.billingPlanId) &&
    isTrialBillingPeriod(userRecord.billingPeriod) &&
    billingStatus !== 'none' &&
    canRunTrialBillingAttemptNow({
      nextChargeAt: userRecord.nextChargeAt,
      billingCollectionStatus: billingStatus,
      now,
    }) &&
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

  let activeSubscription = await getCurrentActiveSubscriptionWithPlan({
    userId: targetUserId,
    now,
  });

  // Self-heal stale состояния:
  // если уже есть активная paid-подписка и trial billing-поля указывают на post-trial
  // период, значит это "хвост" старого trial-scheduled состояния — очищаем.
  const shouldClearStaleTrialBillingState = Boolean(
    activeSubscription &&
      activeSubscription.subscription.planId !== 'basic' &&
      isTrialBillingPlanId(userRecord.billingPlanId) &&
      isTrialBillingPeriod(userRecord.billingPeriod) &&
      userRecord.trialEndedAt &&
      userRecord.nextChargeAt &&
      userRecord.nextChargeAt.getTime() > userRecord.trialEndedAt.getTime()
  );

  if (shouldClearStaleTrialBillingState) {
    await db
      .update(users)
      .set({
        billingPlanId: null,
        billingPeriod: null,
        nextChargeAt: null,
        billingCollectionStatus: 'none',
        graceEndsAt: null,
        billingReminderSentAt: null,
        billingLockedAt: null,
        billingLockedBy: null,
        updatedAt: now,
      })
      .where(eq(users.id, targetUserId));

    const refreshed = await readCurrentUserBillingRow(targetUserId);
    if (refreshed) {
      userRecord = refreshed;
    }
  }

  const scheduledPeriodRaw = String(
    userRecord.scheduledBillingPeriod || ''
  ).trim();
  const scheduledPeriod =
    scheduledPeriodRaw === 'month' || scheduledPeriodRaw === 'year'
      ? scheduledPeriodRaw
      : null;
  const shouldTryOnDemandScheduledPlanChange = Boolean(
    !activeSubscription &&
      userRecord.scheduledPlanId &&
      scheduledPeriod &&
      userRecord.scheduledChangeAt &&
      userRecord.scheduledChangeAt.getTime() <= now.getTime()
  );

  // Self-heal: если фоновый worker задержался, применяем due scheduled_downgrade
  // точечно при чтении /api/subscriptions/current.
  if (shouldTryOnDemandScheduledPlanChange) {
    const config = useRuntimeConfig(event);
    const shopId = String(config.yookassaShopId || '').trim();
    const secretKey = String(config.yookassaSecretKey || '').trim();

    if (shopId && secretKey) {
      try {
        await runScheduledPlanChangeForUser({
          userId: targetUserId,
          workerId: `api-current-scheduled-change-self-heal:${process.pid}`,
          shopId,
          secretKey,
          now,
        });

        const refreshed = await readCurrentUserBillingRow(targetUserId);
        if (refreshed) {
          userRecord = refreshed;
        }

        activeSubscription = await getCurrentActiveSubscriptionWithPlan({
          userId: targetUserId,
          now,
        });
      } catch (error) {
        event.context.logger?.warn(
          {
            userId: targetUserId,
            scheduledPlanId: userRecord.scheduledPlanId,
            scheduledBillingPeriod: userRecord.scheduledBillingPeriod,
            scheduledChangeAt: userRecord.scheduledChangeAt,
            error,
          },
          'Failed to run on-demand scheduled plan change in /current'
        );
      }
    }
  }

  let scheduledChange = buildScheduledChange({
    planId: userRecord.scheduledPlanId,
    billingPeriod: userRecord.scheduledBillingPeriod,
    effectiveAt: userRecord.scheduledChangeAt,
  });

  const shouldClearStaleScheduledChange =
    scheduledChange &&
    Boolean(
      activeSubscription &&
        userRecord.scheduledChangeAt &&
        userRecord.scheduledChangeAt.getTime() <= now.getTime()
    );

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
  const baseEntitlementsPlan = resolveCurrentEntitlementsPlan({
    now,
    trialActive,
    billingPlanId: userRecord.billingPlanId,
    billingCollectionStatus,
    graceEndsAt: userRecord.graceEndsAt,
    activePaidPlanId: activeSubscription?.subscription.planId ?? null,
  });
  const effectiveAccess = await resolveEffectiveEntitlementsPlanWithAccessGrant(
    {
      userId: targetUserId,
      basePlanId: baseEntitlementsPlan,
      now,
    }
  );
  const currentEntitlementsPlan = effectiveAccess.planId;

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
        paymentProvider: activeSubscription.subscription.paymentProvider,
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

  const storefrontCountry = normalizeStorefrontCountry(
    userRecord.billingStorefrontCountry
  );
  const billingProviderHint = resolveBillingProviderHint({
    platform: sourcePlatform,
    storefrontCountry,
  });
  const appleAppAccountToken =
    sourcePlatform === 'ios'
      ? await getOrCreateAppleAppAccountToken(targetUserId)
      : null;
  const shouldExposeInternalPromo = billingProviderHint === 'yookassa';
  let pendingDiscounts: any[] = [];
  let effectiveBillingShiftDays = 0;
  let referralSummary: Awaited<ReturnType<typeof getReferralSummary>> | null =
    null;

  if (shouldExposeInternalPromo) {
    try {
      [pendingDiscounts, effectiveBillingShiftDays, referralSummary] =
        await Promise.all([
          listPendingDiscountGrantsForUser({
            userId: targetUserId,
            now,
          }),
          getEffectiveBillingShiftDaysForUser({
            userId: targetUserId,
          }),
          getReferralSummary({
            userId: targetUserId,
            now,
          }),
        ]);
    } catch (error) {
      if (!isMissingPromoOrReferralInfrastructureError(error)) {
        throw error;
      }

      pendingDiscounts = [];
      effectiveBillingShiftDays = 0;
      referralSummary = null;
    }
  }

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
    storefrontCountry,
    appleAppAccountToken,
    billingProviderHint,
    features,
    subscription: subscriptionDto,
    user: {
      billingCredit: Number(userRecord.billingCredit),
      hasUsedTrial: userRecord.hasUsedTrial,
      timezone: userRecord.timezone,
    },
    noActiveSubscription: !activeSubscription,
    scheduledChange,
    promo: shouldExposeInternalPromo
      ? {
          activeAccessGrant: effectiveAccess.activeAccessGrant
            ? {
                id: effectiveAccess.activeAccessGrant.id,
                planId: effectiveAccess.activeAccessGrant.planId,
                startsAt:
                  effectiveAccess.activeAccessGrant.startsAt.toISOString(),
                endsAt: effectiveAccess.activeAccessGrant.endsAt.toISOString(),
                sourceLabel:
                  (
                    effectiveAccess.activeAccessGrant.metadata as Record<
                      string,
                      unknown
                    >
                  )?.sourceLabel || 'Промокод',
              }
            : null,
          pendingDiscount:
            pendingDiscounts.length > 0
              ? {
                  id: pendingDiscounts[0].id,
                  kind: pendingDiscounts[0].grantKind,
                  percent: Number(pendingDiscounts[0].percent),
                  status: pendingDiscounts[0].status,
                  expiresAt:
                    pendingDiscounts[0].expiresAt?.toISOString() || null,
                  sourceLabel:
                    (pendingDiscounts[0].metadata as Record<string, unknown>)
                      ?.sourceLabel || 'Скидка',
                  targetPlanScope: pendingDiscounts[0].targetPlanScope,
                  targetPeriodScope: pendingDiscounts[0].targetPeriodScope,
                }
              : null,
          effectiveBillingShiftDays,
        }
      : {
          activeAccessGrant: null,
          pendingDiscount: null,
          effectiveBillingShiftDays: 0,
        },
    referral:
      shouldExposeInternalPromo && referralSummary
        ? {
            myCode: referralSummary.profile.code,
            pendingRewardsCount: referralSummary.pendingRewardsCount,
            successfulInvitesCount: referralSummary.successfulInvitesCount,
          }
        : {
            myCode: null,
            pendingRewardsCount: 0,
            successfulInvitesCount: 0,
          },
  };

  setHeader(event, 'Cache-Control', 'private, no-store');
  if (userRecord.updatedAt) {
    setHeader(
      event,
      'ETag',
      `"${targetUserId}-${currentEntitlementsPlan}-${userRecord.updatedAt.getTime()}-${effectiveAccess.activeAccessGrant?.id || 0}-${pendingDiscounts?.length || 0}"`
    );
  }

  return response;
});
