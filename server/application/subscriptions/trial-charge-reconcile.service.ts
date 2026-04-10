import { and, eq, gt, sql } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  billingChargeAttempts,
  subscriptionEvents,
  userSubscriptions,
  users,
} from '@/server/infrastructure/db/schema';
import { resolveNextAutoRetryAt } from './trial-billing.service';
import {
  dispatchBillingPurchaseFailedEvent,
  dispatchBillingPurchaseSuccessEvent,
} from '@/server/application/events/app-events.dispatchers';
import {
  finalizeDiscountGrantSuccess,
  releaseDiscountGrantReservation,
} from '@/server/application/promo-codes/promo-discount-grants.service';
import { restoreAppliedBillingCredit } from '@/server/application/subscriptions/billing-credit.service';
import type {
  TrialBillingPeriod,
  TrialBillingPlanId,
} from './trial-billing.service';

type AttemptMode = 'automatic' | 'manual' | 'webhook';

function getPeriodDays(period: TrialBillingPeriod): number {
  return period === 'year' ? 365 : 30;
}

function resolveDbClient(tx?: any) {
  return tx ?? db;
}

/**
 * Успешное списание по trial-scheduled billing:
 * переводим пользователя в paid период и очищаем past_due/scheduled состояние.
 */
export async function markTrialChargeSuccess(params: {
  userId: number;
  paymentId: string;
  amount: number;
  currency: string;
  billingPlanId: TrialBillingPlanId;
  billingPeriod: TrialBillingPeriod;
  chargeAttemptKey: string;
  attemptMode: AttemptMode;
  now?: Date;
  paymentMethodId?: string | null;
  paymentMethodType?: string | null;
  paymentMethodTitle?: string | null;
  paymentMethodCardBrand?: string | null;
  paymentMethodCardLast4?: string | null;
  paymentMethodCardExpiryMonth?: string | null;
  paymentMethodCardExpiryYear?: string | null;
  billingCreditApplied?: number;
  tx?: any;
}) {
  const now = params.now ?? new Date();
  const client = resolveDbClient(params.tx);
  const discountReservationKey = `trial-charge:${params.chargeAttemptKey}`;

  const periodEnd = new Date(
    now.getTime() + getPeriodDays(params.billingPeriod) * 24 * 60 * 60 * 1000
  );

  await client.transaction(async (tx: any) => {
    await tx
      .update(userSubscriptions)
      .set({
        paymentStatus: 'expired',
        updatedAt: now,
      })
      .where(
        and(
          eq(userSubscriptions.userId, params.userId),
          eq(userSubscriptions.paymentStatus, 'active'),
          gt(userSubscriptions.endDate, now)
        )
      );

    const [createdSubscription] = await tx
      .insert(userSubscriptions)
      .values({
        userId: params.userId,
        planId: params.billingPlanId,
        billingPeriod: params.billingPeriod,
        checkoutAmount: String(params.amount),
        checkoutCurrency: params.currency,
        billingCreditApplied: String(params.billingCreditApplied || 0),
        billingCreditGranted: '0',
        yookassaPaymentId: params.paymentId,
        startDate: now,
        endDate: periodEnd,
        paymentStatus: 'active',
        autoRenew: true,
        sourcePlatform: 'web',
      })
      .returning({
        id: userSubscriptions.id,
      });

    await tx
      .update(users)
      .set({
        billingCollectionStatus: 'none',
        graceEndsAt: null,
        nextChargeAt: periodEnd,
        billingReminderSentAt: null,
        billingLockedAt: null,
        billingLockedBy: null,
        paymentMethodBound: true,
        paymentMethodId: params.paymentMethodId || undefined,
        paymentMethodType: params.paymentMethodType || undefined,
        paymentMethodTitle: params.paymentMethodTitle || undefined,
        paymentMethodCardBrand: params.paymentMethodCardBrand || undefined,
        paymentMethodCardLast4: params.paymentMethodCardLast4 || undefined,
        paymentMethodCardExpiryMonth:
          params.paymentMethodCardExpiryMonth || undefined,
        paymentMethodCardExpiryYear:
          params.paymentMethodCardExpiryYear || undefined,
        updatedAt: now,
      })
      .where(eq(users.id, params.userId));

    await finalizeDiscountGrantSuccess({
      reservationKey: discountReservationKey,
      paymentId: params.paymentId,
      now,
      tx,
    });

    await tx
      .update(billingChargeAttempts)
      .set({
        status: 'success',
        providerPaymentId: params.paymentId,
        attemptCount: sql`${billingChargeAttempts.attemptCount} + 1`,
        autoAttemptCount:
          params.attemptMode === 'automatic'
            ? sql`${billingChargeAttempts.autoAttemptCount} + 1`
            : sql`${billingChargeAttempts.autoAttemptCount}`,
        lastAttemptAt: now,
        lastAutoAttemptAt:
          params.attemptMode === 'automatic'
            ? now
            : sql`${billingChargeAttempts.lastAutoAttemptAt}`,
        nextAutoRetryAt: null,
        lockAt: null,
        lockBy: null,
        updatedAt: now,
      })
      .where(
        eq(billingChargeAttempts.chargeAttemptKey, params.chargeAttemptKey)
      );

    await tx.insert(subscriptionEvents).values({
      userId: params.userId,
      eventType: 'trial_charge_success',
      planId: params.billingPlanId,
      metadata: {
        paymentId: params.paymentId,
        subscriptionId: createdSubscription?.id || null,
        billingPeriod: params.billingPeriod,
        chargeAttemptKey: params.chargeAttemptKey,
        amount: params.amount,
        currency: params.currency,
        attemptMode: params.attemptMode,
        billingCreditApplied: params.billingCreditApplied || 0,
      },
    });
  });

  dispatchBillingPurchaseSuccessEvent({
    userId: params.userId,
    subscriptionId: null,
    paymentId: params.paymentId,
    planId: params.billingPlanId,
    billingPeriod: params.billingPeriod,
    amount: params.amount,
    currency: params.currency,
    source: 'subscriptions.trial-charge-reconcile',
    reason: 'trial_charge_success',
  });
}

/**
 * Неуспешное списание: переводим в past_due и ставим дедлайн grace period.
 */
export async function markTrialChargeFailure(params: {
  userId: number;
  paymentId: string | null;
  billingPlanId: TrialBillingPlanId;
  billingPeriod: TrialBillingPeriod;
  chargeAttemptKey: string;
  attemptMode: AttemptMode;
  failureReason: string;
  scheduledChargeAt: Date;
  billingCreditApplied?: number;
  now?: Date;
  tx?: any;
}) {
  const now = params.now ?? new Date();
  const client = resolveDbClient(params.tx);
  const discountReservationKey = `trial-charge:${params.chargeAttemptKey}`;

  await client.transaction(async (tx: any) => {
    const existingAttempts = await tx
      .select({
        attemptCount: billingChargeAttempts.attemptCount,
        autoAttemptCount: billingChargeAttempts.autoAttemptCount,
        metadata: billingChargeAttempts.metadata,
      })
      .from(billingChargeAttempts)
      .where(
        eq(billingChargeAttempts.chargeAttemptKey, params.chargeAttemptKey)
      )
      .limit(1);

    const currentAttemptCount = Number(existingAttempts[0]?.attemptCount || 0);
    const currentAutoAttemptCount = Number(
      existingAttempts[0]?.autoAttemptCount || 0
    );
    const nextAttemptCount = currentAttemptCount + 1;
    const autoAttemptCount =
      params.attemptMode === 'automatic'
        ? currentAutoAttemptCount + 1
        : currentAutoAttemptCount;
    const currentMetadata =
      (existingAttempts[0]?.metadata as Record<string, unknown> | undefined) ??
      {};
    const billingCreditApplied = Number(
      params.billingCreditApplied ?? currentMetadata.billingCreditApplied ?? 0
    );
    const creditAlreadyRestored = Boolean(currentMetadata.creditRestoredAt);
    const nextAutoRetryAt =
      params.attemptMode === 'automatic'
        ? resolveNextAutoRetryAt({
            scheduledChargeAt: params.scheduledChargeAt,
            autoAttemptCount,
          })
        : resolveNextAutoRetryAt({
            scheduledChargeAt: params.scheduledChargeAt,
            autoAttemptCount,
          });

    await tx
      .update(users)
      .set({
        billingCollectionStatus: 'past_due',
        graceEndsAt: new Date(now.getTime() + 48 * 60 * 60 * 1000),
        billingLockedAt: null,
        billingLockedBy: null,
        updatedAt: now,
      })
      .where(eq(users.id, params.userId));

    await tx
      .update(billingChargeAttempts)
      .set({
        status: 'failed',
        providerPaymentId: params.paymentId,
        attemptCount: nextAttemptCount,
        autoAttemptCount,
        lastAttemptAt: now,
        lastAutoAttemptAt:
          params.attemptMode === 'automatic'
            ? now
            : sql`${billingChargeAttempts.lastAutoAttemptAt}`,
        nextAutoRetryAt,
        lockAt: null,
        lockBy: null,
        metadata: {
          ...currentMetadata,
          billingCreditApplied,
          creditRestoredAt:
            billingCreditApplied > 0 && !creditAlreadyRestored
              ? now.toISOString()
              : (currentMetadata.creditRestoredAt ?? null),
        },
        updatedAt: now,
      })
      .where(
        eq(billingChargeAttempts.chargeAttemptKey, params.chargeAttemptKey)
      );

    await tx.insert(subscriptionEvents).values({
      userId: params.userId,
      eventType: 'trial_charge_failed',
      planId: params.billingPlanId,
      metadata: {
        paymentId: params.paymentId,
        billingPeriod: params.billingPeriod,
        chargeAttemptKey: params.chargeAttemptKey,
        failureReason: params.failureReason,
        attemptMode: params.attemptMode,
        nextAutoRetryAt: nextAutoRetryAt?.toISOString() || null,
        billingCreditApplied,
      },
    });

    if (billingCreditApplied > 0 && !creditAlreadyRestored) {
      await restoreAppliedBillingCredit({
        userId: params.userId,
        amount: billingCreditApplied,
        entryType: 'payment_restore',
        metadata: {
          source: 'trial_charge_failure',
          chargeAttemptKey: params.chargeAttemptKey,
          billingPlanId: params.billingPlanId,
          billingPeriod: params.billingPeriod,
        },
        now,
        tx,
      });
    }

    await releaseDiscountGrantReservation({
      reservationKey: discountReservationKey,
      now,
      tx,
    });
  });

  if (params.paymentId) {
    dispatchBillingPurchaseFailedEvent({
      userId: params.userId,
      subscriptionId: null,
      paymentId: params.paymentId,
      planId: params.billingPlanId,
      billingPeriod: params.billingPeriod,
      source: 'subscriptions.trial-charge-reconcile',
      reason: params.failureReason,
    });
  }
}

/**
 * Когда grace period истек и оплаты нет, доступы должны откатиться до Basic.
 */
export async function enforcePastDueGraceExpiration(params: {
  userId: number;
  now?: Date;
  tx?: any;
}) {
  const now = params.now ?? new Date();
  const client = resolveDbClient(params.tx);

  await client
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
    .where(eq(users.id, params.userId));

  await client.insert(subscriptionEvents).values({
    userId: params.userId,
    eventType: 'trial_past_due_expired_to_basic',
    planId: 'basic',
    metadata: {
      at: now.toISOString(),
    },
  });
}
