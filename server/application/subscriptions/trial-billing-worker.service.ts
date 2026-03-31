import { and, eq, isNotNull, isNull, lt, lte, or } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  billingChargeAttempts,
  payments,
  subscriptionPlans,
  users,
} from '@/server/infrastructure/db/schema';
import { calculatePlanPrice } from './price-calculator';
import {
  buildChargeAttemptKey,
  isTrialBillingPeriod,
  isTrialBillingPlanId,
} from './trial-billing.service';
import {
  enforcePastDueGraceExpiration,
  markTrialChargeFailure,
  markTrialChargeSuccess,
} from './trial-charge-reconcile.service';
import {
  createYooKassaPayment,
  extractPaymentMethodPresentation,
} from '@/server/application/payments/yookassa.client';
import { TRIAL_BILLING_EARLY_CHARGE_MS } from '@/server/config/subscription';

const LOCK_TTL_MS = 10 * 60 * 1000;

async function processGraceExpirationBatch(now: Date) {
  const expiredPastDueUsers = await db
    .select({
      id: users.id,
      graceEndsAt: users.graceEndsAt,
    })
    .from(users)
    .where(
      and(
        eq(users.billingCollectionStatus, 'past_due'),
        isNotNull(users.graceEndsAt),
        lte(users.graceEndsAt, now)
      )
    )
    .limit(200);

  for (const user of expiredPastDueUsers) {
    try {
      await enforcePastDueGraceExpiration({
        userId: user.id,
        now,
      });
    } catch (error) {
      console.error('[TrialBillingWorker] grace expiration failed', {
        userId: user.id,
        error,
      });
    }
  }
}

async function processChargeBatch(params: {
  now: Date;
  workerId: string;
  shopId: string;
  secretKey: string;
  targetUserId?: number;
  limit?: number;
}) {
  const scheduledDueAt = new Date(
    params.now.getTime() + TRIAL_BILLING_EARLY_CHARGE_MS
  );
  const dueUsersWhere = params.targetUserId
    ? and(
        eq(users.id, params.targetUserId),
        isNotNull(users.billingPlanId),
        isNotNull(users.billingPeriod),
        isNotNull(users.nextChargeAt),
        eq(users.paymentMethodBound, true),
        isNotNull(users.paymentMethodId),
        or(
          and(
            eq(users.billingCollectionStatus, 'scheduled'),
            lte(users.nextChargeAt, scheduledDueAt)
          ),
          and(
            eq(users.billingCollectionStatus, 'past_due'),
            lte(users.nextChargeAt, params.now)
          )
        )
      )
    : and(
        isNotNull(users.billingPlanId),
        isNotNull(users.billingPeriod),
        isNotNull(users.nextChargeAt),
        eq(users.paymentMethodBound, true),
        isNotNull(users.paymentMethodId),
        or(
          and(
            eq(users.billingCollectionStatus, 'scheduled'),
            lte(users.nextChargeAt, scheduledDueAt)
          ),
          and(
            eq(users.billingCollectionStatus, 'past_due'),
            lte(users.nextChargeAt, params.now)
          )
        )
      );

  const dueUsers = await db
    .select({
      id: users.id,
      billingPlanId: users.billingPlanId,
      billingPeriod: users.billingPeriod,
      nextChargeAt: users.nextChargeAt,
      paymentMethodId: users.paymentMethodId,
      paymentMethodBound: users.paymentMethodBound,
      billingCollectionStatus: users.billingCollectionStatus,
      billingLockedAt: users.billingLockedAt,
    })
    .from(users)
    .where(dueUsersWhere)
    .limit(params.limit ?? 200);

  for (const user of dueUsers) {
    if (
      !isTrialBillingPlanId(user.billingPlanId) ||
      !isTrialBillingPeriod(user.billingPeriod) ||
      !user.nextChargeAt ||
      !user.paymentMethodId
    ) {
      continue;
    }

    const lockExpiredAt = new Date(params.now.getTime() - LOCK_TTL_MS);
    const dueAtForLock =
      user.billingCollectionStatus === 'scheduled'
        ? scheduledDueAt
        : params.now;
    const lockBillingStatus =
      user.billingCollectionStatus === 'past_due' ? 'past_due' : 'scheduled';

    const lockResult = await db
      .update(users)
      .set({
        billingLockedAt: params.now,
        billingLockedBy: params.workerId,
        updatedAt: params.now,
      })
      .where(
        and(
          eq(users.id, user.id),
          isNotNull(users.nextChargeAt),
          lte(users.nextChargeAt, dueAtForLock),
          eq(users.billingCollectionStatus, lockBillingStatus),
          or(
            isNull(users.billingLockedAt),
            lt(users.billingLockedAt, lockExpiredAt)
          )
        )
      )
      .returning({ id: users.id });

    if (!lockResult.length) {
      continue;
    }

    const chargeAttemptKey = buildChargeAttemptKey({
      userId: user.id,
      nextChargeAt: user.nextChargeAt,
      billingPlanId: user.billingPlanId,
      billingPeriod: user.billingPeriod,
    });

    try {
      const existingAttemptRows = await db
        .select({
          status: billingChargeAttempts.status,
          nextAutoRetryAt: billingChargeAttempts.nextAutoRetryAt,
          providerPaymentId: billingChargeAttempts.providerPaymentId,
          lockAt: billingChargeAttempts.lockAt,
        })
        .from(billingChargeAttempts)
        .where(eq(billingChargeAttempts.chargeAttemptKey, chargeAttemptKey))
        .limit(1);
      const existingAttempt = existingAttemptRows[0];

      if (existingAttempt?.status === 'success') {
        await db
          .update(users)
          .set({
            billingLockedAt: null,
            billingLockedBy: null,
            updatedAt: params.now,
          })
          .where(eq(users.id, user.id));
        continue;
      }

      if (existingAttempt?.status === 'failed') {
        const nextRetryAt = existingAttempt.nextAutoRetryAt;
        const shouldSkipUntilRetryWindow =
          !nextRetryAt || nextRetryAt.getTime() > params.now.getTime();

        if (shouldSkipUntilRetryWindow) {
          await db
            .update(users)
            .set({
              billingLockedAt: null,
              billingLockedBy: null,
              updatedAt: params.now,
            })
            .where(eq(users.id, user.id));
          continue;
        }
      }

      if (existingAttempt?.status === 'processing') {
        const attemptLockExpiredAt = new Date(
          params.now.getTime() - LOCK_TTL_MS
        );
        const hasFreshProcessingLock = Boolean(
          existingAttempt.lockAt &&
            existingAttempt.lockAt.getTime() > attemptLockExpiredAt.getTime()
        );
        const hasProviderPaymentInFlight = Boolean(
          existingAttempt.providerPaymentId
        );

        // Пока lock свежий или уже есть provider payment в обработке,
        // повторную попытку не запускаем, чтобы исключить дубли списания.
        if (hasFreshProcessingLock || hasProviderPaymentInFlight) {
          await db
            .update(users)
            .set({
              billingLockedAt: null,
              billingLockedBy: null,
              updatedAt: params.now,
            })
            .where(eq(users.id, user.id));
          continue;
        }
      }

      await db
        .insert(billingChargeAttempts)
        .values({
          userId: user.id,
          chargeAttemptKey,
          billingPlanId: user.billingPlanId,
          billingPeriod: user.billingPeriod,
          scheduledChargeAt: user.nextChargeAt,
          status: 'processing',
          attemptCount: 0,
          autoAttemptCount: 0,
          lockAt: params.now,
          lockBy: params.workerId,
          metadata: {
            source: 'trial-billing-worker',
          },
        })
        .onConflictDoUpdate({
          target: billingChargeAttempts.chargeAttemptKey,
          set: {
            status: 'processing',
            lockAt: params.now,
            lockBy: params.workerId,
            updatedAt: params.now,
          },
        });

      const planRows = await db
        .select({
          basePrice: subscriptionPlans.basePrice,
        })
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, user.billingPlanId))
        .limit(1);

      const planRow = planRows[0];
      if (!planRow) {
        throw new Error('Billing plan for scheduled charge not found');
      }

      const chargeAmount = calculatePlanPrice({
        baseMonthlyPrice: Number(planRow.basePrice),
        billingPeriod: user.billingPeriod,
      });

      const payment = await createYooKassaPayment({
        shopId: params.shopId,
        secretKey: params.secretKey,
        idempotenceKey: chargeAttemptKey,
        amount: chargeAmount,
        description: `Ментала trial charge ${user.billingPlanId} (${user.billingPeriod})`,
        paymentMode: 'recurring',
        paymentMethodId: user.paymentMethodId,
        metadata: {
          chargeType: 'trial_scheduled',
          chargeAttemptKey,
          userId: String(user.id),
          billingPlanId: user.billingPlanId,
          billingPeriod: user.billingPeriod,
          nextChargeAt: user.nextChargeAt.toISOString(),
          trigger: 'automatic',
        },
      });

      const paymentId = String(payment.id || '').trim();
      const paymentAmount = Number(payment.amount?.value || chargeAmount);
      const paymentCurrency = String(payment.amount?.currency || 'RUB');
      const paymentMethodPresentation = extractPaymentMethodPresentation(
        payment.payment_method
      );

      await db
        .insert(payments)
        .values({
          id: paymentId,
          subscriptionId: null,
          userId: user.id,
          amount: String(paymentAmount),
          currency: paymentCurrency,
          status: payment.status === 'succeeded' ? 'succeeded' : 'pending',
          metadata: payment as any,
        })
        .onConflictDoNothing({ target: payments.id });

      if (payment.status === 'succeeded' && payment.paid === true) {
        await markTrialChargeSuccess({
          userId: user.id,
          paymentId,
          amount: paymentAmount,
          currency: paymentCurrency,
          billingPlanId: user.billingPlanId,
          billingPeriod: user.billingPeriod,
          chargeAttemptKey,
          attemptMode: 'automatic',
          now: params.now,
          paymentMethodId: payment.payment_method?.id || user.paymentMethodId,
          paymentMethodType: paymentMethodPresentation.paymentMethodType,
          paymentMethodTitle: paymentMethodPresentation.paymentMethodTitle,
          paymentMethodCardBrand: paymentMethodPresentation.cardBrand,
          paymentMethodCardLast4: paymentMethodPresentation.cardLast4,
          paymentMethodCardExpiryMonth:
            paymentMethodPresentation.cardExpiryMonth,
          paymentMethodCardExpiryYear: paymentMethodPresentation.cardExpiryYear,
        });
      } else if (payment.status === 'canceled') {
        await markTrialChargeFailure({
          userId: user.id,
          paymentId,
          billingPlanId: user.billingPlanId,
          billingPeriod: user.billingPeriod,
          chargeAttemptKey,
          attemptMode: 'automatic',
          failureReason: `provider_status_${payment.status}`,
          scheduledChargeAt: user.nextChargeAt,
          now: params.now,
        });
      } else {
        // Для промежуточного статуса ждём webhook, чтобы не пометить платеж как failed раньше времени.
        await db.transaction(async (tx) => {
          await tx
            .update(billingChargeAttempts)
            .set({
              status: 'processing',
              providerPaymentId: paymentId,
              lockAt: null,
              lockBy: null,
              updatedAt: params.now,
            })
            .where(
              eq(billingChargeAttempts.chargeAttemptKey, chargeAttemptKey)
            );

          await tx
            .update(users)
            .set({
              billingLockedAt: null,
              billingLockedBy: null,
              updatedAt: params.now,
            })
            .where(eq(users.id, user.id));
        });
      }
    } catch (error) {
      // Освобождаем lock, чтобы следующая итерация могла повторить попытку.
      await db
        .update(users)
        .set({
          billingLockedAt: null,
          billingLockedBy: null,
          updatedAt: params.now,
        })
        .where(eq(users.id, user.id));

      console.error('[TrialBillingWorker] scheduled charge failed', {
        userId: user.id,
        chargeAttemptKey,
        error,
      });
    }
  }
}

export async function runTrialBillingWorker(params: {
  workerId: string;
  shopId: string;
  secretKey: string;
  now?: Date;
}) {
  const now = params.now ?? new Date();

  await processGraceExpirationBatch(now);
  await processChargeBatch({
    now,
    workerId: params.workerId,
    shopId: params.shopId,
    secretKey: params.secretKey,
  });
}

/**
 * Точечный self-heal для одного пользователя:
 * запускает только попытку списания (без полного batch по всем пользователям).
 */
export async function runTrialBillingForUser(params: {
  userId: number;
  workerId: string;
  shopId: string;
  secretKey: string;
  now?: Date;
}) {
  const now = params.now ?? new Date();

  await processChargeBatch({
    now,
    workerId: params.workerId,
    shopId: params.shopId,
    secretKey: params.secretKey,
    targetUserId: params.userId,
    limit: 1,
  });
}
