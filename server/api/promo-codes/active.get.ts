import { createError } from 'h3';
import { getSessionUser } from '@/server/application/auth/session';
import { getActiveAccessGrantForUser } from '@/server/application/promo-codes/promo-access-grants.service';
import { getEffectiveBillingShiftDaysForUser } from '@/server/application/promo-codes/billing-schedule-adjustments.service';
import { listPendingDiscountGrantsForUser } from '@/server/application/promo-codes/promo-discount-grants.service';
import { assertInternalPromoAvailable } from '@/server/application/promo-codes/promo-provider-guard.service';
import { isMissingPromoInfrastructureError } from '@/server/application/promo-codes/promo-infrastructure-compat.service';

export default defineEventHandler(async (event) => {
  const session = await getSessionUser(event);
  if (!session?.user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }

  await assertInternalPromoAvailable({
    event,
    userId: session.user.id,
  });

  const now = new Date();
  let activeAccessGrant = null;
  let pendingDiscounts: any[] = [];
  let effectiveBillingShiftDays = 0;

  try {
    [activeAccessGrant, pendingDiscounts, effectiveBillingShiftDays] =
      await Promise.all([
        getActiveAccessGrantForUser({
          userId: session.user.id,
          now,
        }),
        listPendingDiscountGrantsForUser({
          userId: session.user.id,
          now,
        }),
        getEffectiveBillingShiftDaysForUser({
          userId: session.user.id,
        }),
      ]);
  } catch (error) {
    if (!isMissingPromoInfrastructureError(error)) {
      throw error;
    }
  }

  return {
    activeAccessGrant: activeAccessGrant
      ? {
          id: activeAccessGrant.id,
          planId: activeAccessGrant.planId,
          startsAt: activeAccessGrant.startsAt.toISOString(),
          endsAt: activeAccessGrant.endsAt.toISOString(),
          sourceLabel:
            (activeAccessGrant.metadata as Record<string, unknown>)
              ?.sourceLabel || 'Промокод',
        }
      : null,
    pendingDiscounts: pendingDiscounts.map((grant) => ({
      id: grant.id,
      kind: grant.grantKind,
      percent: Number(grant.percent),
      status: grant.status,
      expiresAt: grant.expiresAt?.toISOString() || null,
      sourceLabel:
        (grant.metadata as Record<string, unknown>)?.sourceLabel || 'Скидка',
      targetPlanScope: grant.targetPlanScope,
      targetPeriodScope: grant.targetPeriodScope,
    })),
    effectiveBillingShiftDays,
  };
});
