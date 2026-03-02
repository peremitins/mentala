import crypto from 'node:crypto';
import { and, eq, gt, inArray, isNotNull, lte, ne } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  payments,
  subscriptionEvents,
  subscriptionPlans,
  userSubscriptions,
  users,
} from '@/server/infrastructure/db/schema';
import {
  createYooKassaPayment,
  extractPaymentMethodPresentation,
} from '@/server/application/payments/yookassa.client';
import {
  expireOutdatedActiveSubscriptions,
  getCurrentActiveSubscription,
} from '@/server/application/subscriptions/current-subscription.service';
import {
  calculatePlanPrice,
  type BillingPeriod,
} from '@/server/application/subscriptions/price-calculator';
import { activateUserPaymentMethod } from './payment-methods.service';

type ScheduledBillingPeriod = BillingPeriod;
type ScheduledApplyStatus = 'noop' | 'success' | 'processing' | 'failed';

interface ApplyScheduledPlanChangeResult {
  status: ScheduledApplyStatus;
  reason?: string;
}

function isScheduledBillingPeriod(
  value: string | null | undefined
): value is ScheduledBillingPeriod {
  return value === 'month' || value === 'year';
}

function getPeriodDays(period: ScheduledBillingPeriod): number {
  return period === 'year' ? 365 : 30;
}

function toCents(value: number): number {
  return Math.round(value * 100);
}

function buildScheduledChangeIdempotenceKey(params: {
  userId: number;
  planId: string;
  billingPeriod: ScheduledBillingPeriod;
  scheduledChangeAt: Date;
}): string {
  return crypto
    .createHash('sha256')
    .update(
      `scheduled-plan-change:${params.userId}:${params.planId}:${params.billingPeriod}:${params.scheduledChangeAt.toISOString()}`,
      'utf8'
    )
    .digest('hex');
}

/**
 * Применяет запланированный downgrade/смену тарифа после наступления effectiveAt.
 * Важный инвариант: schedule "захватывается" (очищается) до внешнего вызова в YooKassa,
 * чтобы исключить дублирующие попытки параллельных воркеров.
 */
async function applyScheduledPlanChangeForUser(params: {
  userId: number;
  workerId: string;
  shopId: string;
  secretKey: string;
  now: Date;
}): Promise<ApplyScheduledPlanChangeResult> {
  const { userId, workerId, shopId, secretKey, now } = params;

  await expireOutdatedActiveSubscriptions({
    userId,
    now,
  });

  const userRows = await db
    .select({
      id: users.id,
      trialEndedAt: users.trialEndedAt,
      scheduledPlanId: users.scheduledPlanId,
      scheduledBillingPeriod: users.scheduledBillingPeriod,
      scheduledChangeAt: users.scheduledChangeAt,
      scheduledFromSubscriptionId: users.scheduledFromSubscriptionId,
      paymentMethodBound: users.paymentMethodBound,
      paymentMethodId: users.paymentMethodId,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const user = userRows[0];
  if (!user) {
    return { status: 'noop', reason: 'user_not_found' };
  }

  if (
    !user.scheduledPlanId ||
    !isScheduledBillingPeriod(user.scheduledBillingPeriod) ||
    !user.scheduledChangeAt
  ) {
    return { status: 'noop', reason: 'scheduled_change_not_set' };
  }

  if (user.scheduledChangeAt.getTime() > now.getTime()) {
    return { status: 'noop', reason: 'scheduled_change_not_due' };
  }

  const activeSubscription = await getCurrentActiveSubscription({
    userId,
    now,
  });
  if (activeSubscription) {
    return { status: 'noop', reason: 'active_subscription_still_running' };
  }

  const scheduledPlanId = user.scheduledPlanId;
  const scheduledBillingPeriod = user.scheduledBillingPeriod;
  const scheduledChangeAt = user.scheduledChangeAt;
  const scheduledFromSubscriptionId = user.scheduledFromSubscriptionId;
  const periodStart = scheduledChangeAt;
  const periodEnd = new Date(
    periodStart.getTime() +
      getPeriodDays(scheduledBillingPeriod) * 24 * 60 * 60 * 1000
  );

  const claimedRows = await db
    .update(users)
    .set({
      scheduledPlanId: null,
      scheduledBillingPeriod: null,
      scheduledChangeAt: null,
      scheduledFromSubscriptionId: null,
      scheduledChangeUpdatedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(users.id, userId),
        eq(users.scheduledPlanId, scheduledPlanId),
        eq(users.scheduledBillingPeriod, scheduledBillingPeriod),
        eq(users.scheduledChangeAt, scheduledChangeAt)
      )
    )
    .returning({ id: users.id });

  if (!claimedRows.length) {
    return { status: 'noop', reason: 'scheduled_change_already_claimed' };
  }

  // Переход на Basic выполняем без платежа.
  if (scheduledPlanId === 'basic') {
    const [newSubscription] = await db
      .insert(userSubscriptions)
      .values({
        userId,
        planId: 'basic',
        billingPeriod: 'month',
        checkoutAmount: '0',
        checkoutCurrency: 'RUB',
        billingCreditApplied: '0',
        billingCreditGranted: '0',
        startDate: periodStart,
        endDate: periodEnd,
        paymentStatus: 'active',
        autoRenew: false,
        sourcePlatform: 'web',
      })
      .returning({ id: userSubscriptions.id });

    await db
      .update(userSubscriptions)
      .set({ paymentStatus: 'expired', updatedAt: now })
      .where(
        and(
          eq(userSubscriptions.userId, userId),
          eq(userSubscriptions.paymentStatus, 'active'),
          gt(userSubscriptions.endDate, now),
          ne(userSubscriptions.id, newSubscription.id)
        )
      );

    await db.insert(subscriptionEvents).values({
      userId,
      eventType: 'subscription_change_applied',
      planId: scheduledPlanId,
      metadata: {
        source: 'scheduled_plan_change_worker',
        workerId,
        subscriptionId: newSubscription.id,
        billingPeriod: 'month',
        effectiveAt: scheduledChangeAt.toISOString(),
        fromSubscriptionId: scheduledFromSubscriptionId,
      },
    });

    return { status: 'success' };
  }

  if (!user.paymentMethodBound || !user.paymentMethodId) {
    await db.insert(subscriptionEvents).values({
      userId,
      eventType: 'subscription_change_failed',
      planId: scheduledPlanId,
      metadata: {
        source: 'scheduled_plan_change_worker',
        workerId,
        reason: 'payment_method_not_bound',
        billingPeriod: scheduledBillingPeriod,
        effectiveAt: scheduledChangeAt.toISOString(),
        fromSubscriptionId: scheduledFromSubscriptionId,
      },
    });

    return { status: 'failed', reason: 'payment_method_not_bound' };
  }

  const planRows = await db
    .select({
      basePrice: subscriptionPlans.basePrice,
    })
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.id, scheduledPlanId))
    .limit(1);

  const plan = planRows[0];
  if (!plan) {
    await db.insert(subscriptionEvents).values({
      userId,
      eventType: 'subscription_change_failed',
      planId: scheduledPlanId,
      metadata: {
        source: 'scheduled_plan_change_worker',
        workerId,
        reason: 'target_plan_not_found',
        billingPeriod: scheduledBillingPeriod,
        effectiveAt: scheduledChangeAt.toISOString(),
        fromSubscriptionId: scheduledFromSubscriptionId,
      },
    });

    return { status: 'failed', reason: 'target_plan_not_found' };
  }

  const checkoutAmount = calculatePlanPrice({
    baseMonthlyPrice: Number(plan.basePrice),
    billingPeriod: scheduledBillingPeriod,
  });

  const [pendingSubscription] = await db
    .insert(userSubscriptions)
    .values({
      userId,
      planId: scheduledPlanId,
      billingPeriod: scheduledBillingPeriod,
      checkoutAmount: String(checkoutAmount),
      checkoutCurrency: 'RUB',
      billingCreditApplied: '0',
      billingCreditGranted: '0',
      startDate: periodStart,
      endDate: periodEnd,
      paymentStatus: 'pending',
      autoRenew: true,
      sourcePlatform: 'web',
    })
    .returning({
      id: userSubscriptions.id,
    });

  await db.insert(subscriptionEvents).values({
    userId,
    eventType: 'checkout_started',
    planId: scheduledPlanId,
    metadata: {
      source: 'scheduled_plan_change_worker',
      workerId,
      subscriptionId: pendingSubscription.id,
      billingPeriod: scheduledBillingPeriod,
      toPay: checkoutAmount,
      effectiveAt: scheduledChangeAt.toISOString(),
      fromSubscriptionId: scheduledFromSubscriptionId,
    },
  });

  const yookassaIdempotenceKey = buildScheduledChangeIdempotenceKey({
    userId,
    planId: scheduledPlanId,
    billingPeriod: scheduledBillingPeriod,
    scheduledChangeAt,
  });

  let payment;
  try {
    payment = await createYooKassaPayment({
      shopId,
      secretKey,
      idempotenceKey: yookassaIdempotenceKey,
      amount: checkoutAmount,
      description: `Mentala scheduled plan change ${scheduledPlanId} (${scheduledBillingPeriod})`,
      metadata: {
        userId: String(userId),
        subscriptionId: String(pendingSubscription.id),
        planId: scheduledPlanId,
        billingPeriod: scheduledBillingPeriod,
        chargeType: 'scheduled_downgrade',
        effectiveAt: scheduledChangeAt.toISOString(),
      },
      paymentMode: 'recurring',
      paymentMethodId: user.paymentMethodId,
    });
  } catch {
    // Если платеж не создан — откатываем subscription в canceled и возвращаем schedule.
    await db.transaction(async (tx) => {
      await tx
        .update(userSubscriptions)
        .set({
          paymentStatus: 'canceled',
          updatedAt: now,
        })
        .where(eq(userSubscriptions.id, pendingSubscription.id));

      await tx
        .update(users)
        .set({
          scheduledPlanId,
          scheduledBillingPeriod,
          scheduledChangeAt,
          scheduledFromSubscriptionId,
          scheduledChangeUpdatedAt: now,
          updatedAt: now,
        })
        .where(eq(users.id, userId));

      await tx.insert(subscriptionEvents).values({
        userId,
        eventType: 'subscription_change_failed',
        planId: scheduledPlanId,
        metadata: {
          source: 'scheduled_plan_change_worker',
          workerId,
          reason: 'payment_create_failed',
          subscriptionId: pendingSubscription.id,
          billingPeriod: scheduledBillingPeriod,
          effectiveAt: scheduledChangeAt.toISOString(),
          fromSubscriptionId: scheduledFromSubscriptionId,
        },
      });
    });

    return { status: 'failed', reason: 'payment_create_failed' };
  }

  const paymentId = String(payment.id || '').trim();
  if (!paymentId) {
    await db
      .update(userSubscriptions)
      .set({
        paymentStatus: 'canceled',
        updatedAt: now,
      })
      .where(eq(userSubscriptions.id, pendingSubscription.id));

    await db.insert(subscriptionEvents).values({
      userId,
      eventType: 'subscription_change_failed',
      planId: scheduledPlanId,
      metadata: {
        source: 'scheduled_plan_change_worker',
        workerId,
        reason: 'payment_id_missing',
        subscriptionId: pendingSubscription.id,
        billingPeriod: scheduledBillingPeriod,
        effectiveAt: scheduledChangeAt.toISOString(),
      },
    });

    return { status: 'failed', reason: 'payment_id_missing' };
  }

  const paymentStatusRaw = String(payment.status || '')
    .trim()
    .toLowerCase();
  const paymentStatus =
    paymentStatusRaw === 'succeeded'
      ? 'succeeded'
      : paymentStatusRaw === 'canceled'
        ? 'canceled'
        : 'pending';
  const paymentAmount = Number(payment.amount?.value || checkoutAmount);
  const paymentCurrency = String(payment.amount?.currency || 'RUB')
    .trim()
    .toUpperCase();

  await db.transaction(async (tx) => {
    await tx
      .update(userSubscriptions)
      .set({
        yookassaPaymentId: paymentId,
        updatedAt: now,
      })
      .where(eq(userSubscriptions.id, pendingSubscription.id));

    await tx
      .insert(payments)
      .values({
        id: paymentId,
        subscriptionId: pendingSubscription.id,
        userId,
        amount: String(paymentAmount),
        currency: paymentCurrency,
        status: paymentStatus,
        metadata: payment as any,
      })
      .onConflictDoUpdate({
        target: payments.id,
        set: {
          subscriptionId: pendingSubscription.id,
          amount: String(paymentAmount),
          currency: paymentCurrency,
          status: paymentStatus,
          metadata: payment as any,
          updatedAt: now,
        },
      });
  });

  if (paymentStatus === 'succeeded' && payment.paid === true) {
    const amountMatches =
      paymentCurrency === 'RUB' &&
      toCents(paymentAmount) === toCents(checkoutAmount);

    if (!amountMatches) {
      await db.transaction(async (tx) => {
        await tx
          .update(userSubscriptions)
          .set({
            paymentStatus: 'canceled',
            updatedAt: now,
          })
          .where(eq(userSubscriptions.id, pendingSubscription.id));

        await tx.insert(subscriptionEvents).values({
          userId,
          eventType: 'subscription_change_failed',
          planId: scheduledPlanId,
          metadata: {
            source: 'scheduled_plan_change_worker',
            workerId,
            reason: 'amount_currency_mismatch',
            subscriptionId: pendingSubscription.id,
            paymentId,
            expectedAmount: checkoutAmount,
            actualAmount: paymentAmount,
            expectedCurrency: 'RUB',
            actualCurrency: paymentCurrency,
          },
        });
      });

      return { status: 'failed', reason: 'amount_currency_mismatch' };
    }

    await db.transaction(async (tx) => {
      await tx
        .update(userSubscriptions)
        .set({
          paymentStatus: 'active',
          autoRenew: true,
          updatedAt: now,
        })
        .where(
          and(
            eq(userSubscriptions.id, pendingSubscription.id),
            eq(userSubscriptions.paymentStatus, 'pending')
          )
        );

      await tx
        .update(userSubscriptions)
        .set({
          paymentStatus: 'expired',
          updatedAt: now,
        })
        .where(
          and(
            eq(userSubscriptions.userId, userId),
            eq(userSubscriptions.paymentStatus, 'active'),
            gt(userSubscriptions.endDate, now),
            ne(userSubscriptions.id, pendingSubscription.id)
          )
        );

      if (user.trialEndedAt && user.trialEndedAt > now) {
        await tx
          .update(users)
          .set({
            trialEndedAt: now,
            updatedAt: now,
          })
          .where(eq(users.id, userId));
      }

      const paymentMethodPresentation = extractPaymentMethodPresentation(
        payment.payment_method
      );
      if (
        payment.payment_method?.saved === true &&
        payment.payment_method?.id
      ) {
        await activateUserPaymentMethod({
          userId,
          paymentMethodId: payment.payment_method.id,
          paymentMethodType: paymentMethodPresentation.paymentMethodType,
          paymentMethodTitle: paymentMethodPresentation.paymentMethodTitle,
          cardBrand: paymentMethodPresentation.cardBrand,
          cardLast4: paymentMethodPresentation.cardLast4,
          cardExpiryMonth: paymentMethodPresentation.cardExpiryMonth,
          cardExpiryYear: paymentMethodPresentation.cardExpiryYear,
          now,
          tx,
        });
      }

      await tx.insert(subscriptionEvents).values({
        userId,
        eventType: 'purchase_success',
        planId: scheduledPlanId,
        metadata: {
          source: 'scheduled_plan_change_worker',
          workerId,
          subscriptionId: pendingSubscription.id,
          paymentId,
          amount: paymentAmount,
          currency: paymentCurrency,
          billingPeriod: scheduledBillingPeriod,
          effectiveAt: scheduledChangeAt.toISOString(),
          fromSubscriptionId: scheduledFromSubscriptionId,
        },
      });

      await tx.insert(subscriptionEvents).values({
        userId,
        eventType: 'subscription_change_applied',
        planId: scheduledPlanId,
        metadata: {
          source: 'scheduled_plan_change_worker',
          workerId,
          subscriptionId: pendingSubscription.id,
          paymentId,
          billingPeriod: scheduledBillingPeriod,
          effectiveAt: scheduledChangeAt.toISOString(),
          fromSubscriptionId: scheduledFromSubscriptionId,
        },
      });
    });

    return { status: 'success' };
  }

  if (paymentStatus === 'canceled') {
    await db.transaction(async (tx) => {
      await tx
        .update(userSubscriptions)
        .set({
          paymentStatus: 'canceled',
          updatedAt: now,
        })
        .where(eq(userSubscriptions.id, pendingSubscription.id));

      await tx.insert(subscriptionEvents).values({
        userId,
        eventType: 'purchase_failed',
        planId: scheduledPlanId,
        metadata: {
          source: 'scheduled_plan_change_worker',
          workerId,
          subscriptionId: pendingSubscription.id,
          paymentId,
          reason: 'provider_canceled',
          billingPeriod: scheduledBillingPeriod,
          effectiveAt: scheduledChangeAt.toISOString(),
        },
      });
    });

    return { status: 'failed', reason: 'provider_canceled' };
  }

  await db.insert(subscriptionEvents).values({
    userId,
    eventType: 'checkout_payment_created',
    planId: scheduledPlanId,
    metadata: {
      source: 'scheduled_plan_change_worker',
      workerId,
      subscriptionId: pendingSubscription.id,
      paymentId,
      billingPeriod: scheduledBillingPeriod,
      toPay: checkoutAmount,
      effectiveAt: scheduledChangeAt.toISOString(),
    },
  });

  return { status: 'processing' };
}

export async function runScheduledPlanChangeWorker(params: {
  workerId: string;
  shopId: string;
  secretKey: string;
  now?: Date;
  targetUserId?: number;
  limit?: number;
}) {
  const now = params.now ?? new Date();

  const whereClause = params.targetUserId
    ? and(
        eq(users.id, params.targetUserId),
        isNotNull(users.scheduledPlanId),
        isNotNull(users.scheduledBillingPeriod),
        inArray(users.scheduledBillingPeriod, ['month', 'year']),
        isNotNull(users.scheduledChangeAt),
        lte(users.scheduledChangeAt, now)
      )
    : and(
        isNotNull(users.scheduledPlanId),
        isNotNull(users.scheduledBillingPeriod),
        inArray(users.scheduledBillingPeriod, ['month', 'year']),
        isNotNull(users.scheduledChangeAt),
        lte(users.scheduledChangeAt, now)
      );

  const dueUsers = await db
    .select({
      id: users.id,
    })
    .from(users)
    .where(whereClause)
    .limit(params.limit ?? 100);

  for (const user of dueUsers) {
    try {
      await applyScheduledPlanChangeForUser({
        userId: user.id,
        workerId: params.workerId,
        shopId: params.shopId,
        secretKey: params.secretKey,
        now,
      });
    } catch (error) {
      console.error('[ScheduledPlanChange] apply failed', {
        userId: user.id,
        workerId: params.workerId,
        error,
      });
    }
  }
}

export async function runScheduledPlanChangeForUser(params: {
  userId: number;
  workerId: string;
  shopId: string;
  secretKey: string;
  now?: Date;
}) {
  await runScheduledPlanChangeWorker({
    workerId: params.workerId,
    shopId: params.shopId,
    secretKey: params.secretKey,
    now: params.now,
    targetUserId: params.userId,
    limit: 1,
  });
}
