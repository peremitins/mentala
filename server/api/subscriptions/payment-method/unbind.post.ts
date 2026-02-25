import { createError } from 'h3';
import { getSessionUser } from '@/server/application/auth/session';
import { db } from '@/server/infrastructure/db/client';
import { subscriptionEvents, users } from '@/server/infrastructure/db/schema';
import { eq } from 'drizzle-orm';
import { detachUserPaymentMethod } from '@/server/application/subscriptions/payment-methods.service';

/**
 * POST /api/subscriptions/payment-method/unbind
 * Отвязывает текущую карту автосписания.
 */
export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }

  const userId = sessionResult.user.id;
  const now = new Date();

  const userRows = await db
    .select({
      paymentMethodId: users.paymentMethodId,
      paymentMethodBound: users.paymentMethodBound,
      billingPlanId: users.billingPlanId,
      billingPeriod: users.billingPeriod,
      nextChargeAt: users.nextChargeAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const user = userRows[0];
  if (!user) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found',
    });
  }

  const hadPaymentMethod = Boolean(
    user.paymentMethodBound && user.paymentMethodId
  );
  const hadScheduledTrialCharge = Boolean(
    user.billingPlanId && user.billingPeriod && user.nextChargeAt
  );

  await detachUserPaymentMethod({
    userId,
    cancelScheduledTrialBilling: true,
    now,
  });

  await db.insert(subscriptionEvents).values({
    userId,
    eventType: 'payment_method_unbound',
    planId: user.billingPlanId || 'basic',
    metadata: {
      hadPaymentMethod,
      hadScheduledTrialCharge,
      unboundPaymentMethodId: user.paymentMethodId,
      billingPlanId: user.billingPlanId,
      billingPeriod: user.billingPeriod,
      nextChargeAt: user.nextChargeAt?.toISOString() || null,
      scheduledTrialBillingCanceled: true,
    },
  });

  return {
    success: true,
    paymentMethodBound: false,
    scheduledTrialBillingCanceled: true,
  };
});
