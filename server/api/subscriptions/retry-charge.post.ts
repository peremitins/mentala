import { createError } from 'h3';
import { eq } from 'drizzle-orm';
import { getSessionUser } from '@/server/application/auth/session';
import { db } from '@/server/infrastructure/db/client';
import {
  billingChargeAttempts,
  payments,
  subscriptionPlans,
  users,
} from '@/server/infrastructure/db/schema';
import {
  buildChargeAttemptKey,
  buildProviderIdempotenceKey,
  isTrialBillingPeriod,
  isTrialBillingPlanId,
} from '@/server/application/subscriptions/trial-billing.service';
import {
  createYooKassaPayment,
  extractPaymentMethodPresentation,
  buildYooKassaReceipt,
} from '@/server/application/payments/yookassa.client';
import {
  markTrialChargeFailure,
  markTrialChargeSuccess,
} from '@/server/application/subscriptions/trial-charge-reconcile.service';
import { calculatePlanPrice } from '@/server/application/subscriptions/price-calculator';
import {
  releaseDiscountGrantReservation,
  reserveBestDiscountGrant,
} from '@/server/application/promo-codes/promo-discount-grants.service';
import {
  applyAvailableBillingCredit,
  restoreAppliedBillingCredit,
} from '@/server/application/subscriptions/billing-credit.service';

/**
 * POST /api/subscriptions/retry-charge
 * Ручной retry списания для состояния past_due/scheduled.
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
  let billingCreditApplied = 0;

  const userRows = await db
    .select({
      id: users.id,
      email: users.email,
      billingPlanId: users.billingPlanId,
      billingPeriod: users.billingPeriod,
      nextChargeAt: users.nextChargeAt,
      paymentMethodBound: users.paymentMethodBound,
      paymentMethodId: users.paymentMethodId,
      billingCollectionStatus: users.billingCollectionStatus,
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

  if (
    !isTrialBillingPlanId(user.billingPlanId) ||
    !isTrialBillingPeriod(user.billingPeriod)
  ) {
    throw createError({
      statusCode: 409,
      statusMessage: 'No scheduled trial billing found for retry',
    });
  }

  if (!user.nextChargeAt || user.nextChargeAt.getTime() > now.getTime()) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Retry is available only after nextChargeAt',
    });
  }

  if (!user.paymentMethodBound || !user.paymentMethodId) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Payment method is not bound',
    });
  }

  if (
    user.billingCollectionStatus !== 'scheduled' &&
    user.billingCollectionStatus !== 'past_due'
  ) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Billing collection status does not allow retry',
    });
  }

  const chargeAttemptKey = buildChargeAttemptKey({
    userId,
    nextChargeAt: user.nextChargeAt,
    billingPlanId: user.billingPlanId,
    billingPeriod: user.billingPeriod,
  });

  const existingAttemptRows = await db
    .select({
      status: billingChargeAttempts.status,
      attemptCount: billingChargeAttempts.attemptCount,
    })
    .from(billingChargeAttempts)
    .where(eq(billingChargeAttempts.chargeAttemptKey, chargeAttemptKey))
    .limit(1);

  const existingAttempt = existingAttemptRows[0];
  if (existingAttempt?.status === 'success') {
    return {
      status: 'noop',
      message: 'Charge already succeeded for this billing cycle',
      chargeAttemptKey,
    };
  }

  await db
    .insert(billingChargeAttempts)
    .values({
      userId,
      chargeAttemptKey,
      billingPlanId: user.billingPlanId,
      billingPeriod: user.billingPeriod,
      scheduledChargeAt: user.nextChargeAt,
      status: 'processing',
      attemptCount: Number(existingAttempt?.attemptCount || 0),
      autoAttemptCount: 0,
      lockAt: now,
      lockBy: `manual-retry:${userId}`,
      metadata: {
        source: 'manual-retry',
      },
    })
    .onConflictDoUpdate({
      target: billingChargeAttempts.chargeAttemptKey,
      set: {
        status: 'processing',
        lockAt: now,
        lockBy: `manual-retry:${userId}`,
        updatedAt: now,
      },
    });

  try {
    const planRows = await db
      .select({
        basePrice: subscriptionPlans.basePrice,
      })
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, user.billingPlanId))
      .limit(1);

    const plan = planRows[0];
    if (!plan) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Plan config not found',
      });
    }

    const chargeAmount = calculatePlanPrice({
      baseMonthlyPrice: Number(plan.basePrice),
      billingPeriod: user.billingPeriod,
    });
    const discountReservationKey = `trial-charge:${chargeAttemptKey}`;
    const discount = await reserveBestDiscountGrant({
      userId,
      planId: user.billingPlanId,
      billingPeriod: user.billingPeriod,
      amount: chargeAmount,
      reservationKey: discountReservationKey,
    });
    const credit = await applyAvailableBillingCredit({
      userId,
      amount: discount.finalAmount,
      metadata: {
        source: 'trial_charge_manual_retry',
        billingPlanId: user.billingPlanId,
        billingPeriod: user.billingPeriod,
        chargeAttemptKey,
      },
    });
    billingCreditApplied = credit.appliedAmount;
    const effectiveChargeAmount = credit.finalAmount;

    const config = useRuntimeConfig(event);
    const shopId = String(config.yookassaShopId || '').trim();
    const secretKey = String(config.yookassaSecretKey || '').trim();

    if (!shopId || !secretKey) {
      throw createError({
        statusCode: 500,
        statusMessage: 'YooKassa credentials not configured',
      });
    }

    const attemptOrdinal = Number(existingAttempt?.attemptCount || 0) + 1;
    const retryDescription = `Подписка Ментала ${user.billingPlanId === 'premium' ? 'Premium' : 'PRO'} (${user.billingPeriod === 'year' ? 'год' : 'месяц'})`;

    const payment = await createYooKassaPayment({
      shopId,
      secretKey,
      idempotenceKey: buildProviderIdempotenceKey({
        chargeAttemptKey,
        attemptMode: 'manual',
        attemptOrdinal,
      }),
      amount: effectiveChargeAmount,
      description: retryDescription,
      paymentMode: 'recurring',
      paymentMethodId: user.paymentMethodId,
      receipt: user.email
        ? buildYooKassaReceipt({
            email: user.email,
            amount: effectiveChargeAmount,
            description: retryDescription,
          })
        : undefined,
      metadata: {
        chargeType: 'trial_scheduled',
        chargeAttemptKey,
        userId: String(userId),
        billingPlanId: user.billingPlanId,
        billingPeriod: user.billingPeriod,
        nextChargeAt: user.nextChargeAt.toISOString(),
        trigger: 'manual_retry',
        promoDiscountPercent: discount.percent || null,
        promoDiscountAmount: discount.discountAmount || null,
        billingCreditApplied: billingCreditApplied || null,
      },
    });

    const paymentId = String(payment.id || '').trim();
    if (!paymentId) {
      throw createError({
        statusCode: 502,
        statusMessage: 'YooKassa payment response missing payment id',
      });
    }
    const paymentAmount = Number(
      payment.amount?.value || effectiveChargeAmount
    );
    const paymentCurrency = String(payment.amount?.currency || 'RUB');

    await db
      .insert(payments)
      .values({
        id: paymentId,
        subscriptionId: null,
        userId,
        amount: String(paymentAmount),
        currency: paymentCurrency,
        status: payment.status === 'succeeded' ? 'succeeded' : 'pending',
        metadata: payment as any,
      })
      .onConflictDoNothing({ target: payments.id });

    if (payment.status === 'succeeded' && payment.paid === true) {
      const paymentMethodPresentation = extractPaymentMethodPresentation(
        payment.payment_method
      );

      await markTrialChargeSuccess({
        userId,
        paymentId,
        amount: paymentAmount,
        currency: paymentCurrency,
        billingPlanId: user.billingPlanId,
        billingPeriod: user.billingPeriod,
        chargeAttemptKey,
        attemptMode: 'manual',
        now,
        paymentMethodId: payment.payment_method?.id || user.paymentMethodId,
        paymentMethodType: paymentMethodPresentation.paymentMethodType,
        paymentMethodTitle: paymentMethodPresentation.paymentMethodTitle,
        paymentMethodCardBrand: paymentMethodPresentation.cardBrand,
        paymentMethodCardLast4: paymentMethodPresentation.cardLast4,
        paymentMethodCardExpiryMonth: paymentMethodPresentation.cardExpiryMonth,
        paymentMethodCardExpiryYear: paymentMethodPresentation.cardExpiryYear,
        billingCreditApplied,
      });

      return {
        status: 'success',
        paymentId,
        chargeAttemptKey,
      };
    }

    if (payment.status === 'canceled') {
      await markTrialChargeFailure({
        userId,
        paymentId,
        billingPlanId: user.billingPlanId,
        billingPeriod: user.billingPeriod,
        chargeAttemptKey,
        attemptMode: 'manual',
        failureReason: `provider_status_${payment.status}`,
        scheduledChargeAt: user.nextChargeAt,
        billingCreditApplied,
        now,
      });

      return {
        status: 'failed',
        paymentId,
        chargeAttemptKey,
      };
    }

    await db
      .update(billingChargeAttempts)
      .set({
        status: 'processing',
        providerPaymentId: paymentId,
        lockAt: null,
        lockBy: null,
        metadata: {
          source: 'manual-retry',
          billingCreditApplied,
        },
        updatedAt: now,
      })
      .where(eq(billingChargeAttempts.chargeAttemptKey, chargeAttemptKey));

    await db
      .update(users)
      .set({
        billingLockedAt: null,
        billingLockedBy: null,
        updatedAt: now,
      })
      .where(eq(users.id, userId));

    return {
      status: 'processing',
      paymentId,
      chargeAttemptKey,
    };
  } catch (error) {
    await releaseDiscountGrantReservation({
      reservationKey: `trial-charge:${chargeAttemptKey}`,
      now,
    }).catch(() => {
      // noop
    });

    if (billingCreditApplied > 0) {
      await restoreAppliedBillingCredit({
        userId,
        amount: billingCreditApplied,
        entryType: 'payment_restore',
        metadata: {
          source: 'trial_charge_manual_retry_error',
          billingPlanId: user.billingPlanId,
          billingPeriod: user.billingPeriod,
          chargeAttemptKey,
        },
        now,
      }).catch(() => {
        // noop
      });
      billingCreditApplied = 0;
    }

    await db
      .update(users)
      .set({
        billingLockedAt: null,
        billingLockedBy: null,
        updatedAt: now,
      })
      .where(eq(users.id, userId));

    await db
      .update(billingChargeAttempts)
      .set({
        status: 'failed',
        lockAt: null,
        lockBy: null,
        metadata: {
          source: 'manual-retry',
          billingCreditApplied,
        },
        updatedAt: now,
      })
      .where(eq(billingChargeAttempts.chargeAttemptKey, chargeAttemptKey));

    throw error;
  }
});
