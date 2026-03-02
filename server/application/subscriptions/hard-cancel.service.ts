import { and, desc, eq, gt, inArray, ne } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  payments,
  subscriptionEvents,
  userSubscriptions,
  users,
} from '@/server/infrastructure/db/schema';
import {
  cancelYooKassaPayment,
  getYooKassaPayment,
} from '@/server/application/payments/yookassa.client';
import { getCurrentActiveSubscription } from './current-subscription.service';
import { detachUserPaymentMethod } from './payment-methods.service';
import {
  resolvePendingForHardCancel,
  type HardCancelUnresolvedPayment,
  type ProviderPaymentSnapshot,
} from './hard-cancel-pending-resolver';

function normalizeProviderPaymentStatus(
  rawStatus: string
): ProviderPaymentSnapshot {
  const status = rawStatus.trim().toLowerCase();
  if (
    status === 'pending' ||
    status === 'waiting_for_capture' ||
    status === 'canceled' ||
    status === 'succeeded'
  ) {
    return { status, paid: false };
  }
  return { status: 'unknown', paid: false };
}

async function fetchProviderPayment(params: {
  shopId: string;
  secretKey: string;
  paymentId: string;
}): Promise<ProviderPaymentSnapshot> {
  const payment = await getYooKassaPayment({
    shopId: params.shopId,
    secretKey: params.secretKey,
    paymentId: params.paymentId,
  });
  const normalized = normalizeProviderPaymentStatus(
    String(payment.status || '')
  );
  return {
    status: normalized.status,
    paid: payment.paid === true,
  };
}

async function cancelProviderPayment(params: {
  shopId: string;
  secretKey: string;
  paymentId: string;
  idempotenceKey: string;
}): Promise<ProviderPaymentSnapshot | null> {
  try {
    const canceled = await cancelYooKassaPayment({
      shopId: params.shopId,
      secretKey: params.secretKey,
      paymentId: params.paymentId,
      idempotenceKey: params.idempotenceKey,
    });
    const normalized = normalizeProviderPaymentStatus(
      String(canceled.status || '')
    );
    return {
      status: normalized.status,
      paid: canceled.paid === true,
    };
  } catch {
    // Фолбэк: иногда cancel может вернуть ошибку при гонке статусов,
    // поэтому перечитываем платеж и работаем по факту текущего статуса.
    try {
      return await fetchProviderPayment({
        shopId: params.shopId,
        secretKey: params.secretKey,
        paymentId: params.paymentId,
      });
    } catch {
      return null;
    }
  }
}

export interface HardCancelSubscriptionResult {
  success: boolean;
  endDate: Date | null;
  message: string;
  activeSubscriptionId: number | null;
  canceledPendingSubscriptions: number;
  unresolvedPendingPayments: HardCancelUnresolvedPayment[];
  paymentMethodDetached: boolean;
}

export async function hardCancelSubscription(params: {
  userId: number;
  shopId?: string | null;
  secretKey?: string | null;
  now?: Date;
}): Promise<HardCancelSubscriptionResult> {
  const now = params.now ?? new Date();

  const activeSubscription = await getCurrentActiveSubscription({
    userId: params.userId,
    now,
  });

  const userRows = await db
    .select({
      id: users.id,
      scheduledPlanId: users.scheduledPlanId,
      scheduledBillingPeriod: users.scheduledBillingPeriod,
      scheduledChangeAt: users.scheduledChangeAt,
      scheduledFromSubscriptionId: users.scheduledFromSubscriptionId,
      billingPlanId: users.billingPlanId,
      billingPeriod: users.billingPeriod,
      nextChargeAt: users.nextChargeAt,
      billingCollectionStatus: users.billingCollectionStatus,
      graceEndsAt: users.graceEndsAt,
      paymentMethodBound: users.paymentMethodBound,
      paymentMethodId: users.paymentMethodId,
    })
    .from(users)
    .where(eq(users.id, params.userId))
    .limit(1);

  const user = userRows[0];
  if (!user) {
    const error = new Error('User not found') as Error & {
      statusCode?: number;
      statusMessage?: string;
    };
    error.statusCode = 404;
    error.statusMessage = 'User not found';
    throw error;
  }

  const pendingSubscriptions = await db
    .select({
      id: userSubscriptions.id,
      planId: userSubscriptions.planId,
      yookassaPaymentId: userSubscriptions.yookassaPaymentId,
    })
    .from(userSubscriptions)
    .where(
      and(
        eq(userSubscriptions.userId, params.userId),
        eq(userSubscriptions.paymentStatus, 'pending')
      )
    )
    .orderBy(desc(userSubscriptions.createdAt));

  const pendingResolution = await resolvePendingForHardCancel({
    pendingSubscriptions,
    shopId: params.shopId,
    secretKey: params.secretKey,
    now,
    fetchProviderPayment,
    cancelProviderPayment,
  });

  const paymentMethodDetached = Boolean(
    user.paymentMethodBound && user.paymentMethodId
  );
  const canceledPendingSubscriptionIds =
    pendingResolution.cancelableSubscriptionIds;
  let canceledPendingRows: Array<{
    id: number;
    planId: string;
    yookassaPaymentId: string | null;
  }> = [];

  await db.transaction(async (tx) => {
    // Отключаем автопродление у всех текущих активных периодов.
    await tx
      .update(userSubscriptions)
      .set({
        autoRenew: false,
        updatedAt: now,
      })
      .where(
        and(
          eq(userSubscriptions.userId, params.userId),
          eq(userSubscriptions.paymentStatus, 'active'),
          gt(userSubscriptions.endDate, now)
        )
      );

    if (paymentMethodDetached) {
      // В hard-cancel отвязываем карту, чтобы наш backend не мог запускать recurring.
      await detachUserPaymentMethod({
        userId: params.userId,
        cancelScheduledTrialBilling: true,
        now,
        tx,
      });
    }

    await tx
      .update(users)
      .set({
        scheduledPlanId: null,
        scheduledBillingPeriod: null,
        scheduledChangeAt: null,
        scheduledFromSubscriptionId: null,
        scheduledChangeUpdatedAt: now,
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

    if (canceledPendingSubscriptionIds.length > 0) {
      canceledPendingRows = await tx
        .update(userSubscriptions)
        .set({
          paymentStatus: 'canceled',
          updatedAt: now,
        })
        .where(
          and(
            eq(userSubscriptions.userId, params.userId),
            eq(userSubscriptions.paymentStatus, 'pending'),
            inArray(userSubscriptions.id, canceledPendingSubscriptionIds)
          )
        )
        .returning({
          id: userSubscriptions.id,
          planId: userSubscriptions.planId,
          yookassaPaymentId: userSubscriptions.yookassaPaymentId,
        });
    }

    if (pendingResolution.providerCanceledPaymentIds.length > 0) {
      await tx
        .update(payments)
        .set({
          status: 'canceled',
          updatedAt: now,
        })
        .where(
          and(
            inArray(payments.id, pendingResolution.providerCanceledPaymentIds),
            ne(payments.status, 'succeeded')
          )
        );
    }

    if (canceledPendingRows.length > 0) {
      await tx.insert(subscriptionEvents).values(
        canceledPendingRows.map((pending) => ({
          userId: params.userId,
          eventType: 'purchase_failed',
          planId: pending.planId,
          metadata: {
            subscriptionId: pending.id,
            paymentId: pending.yookassaPaymentId,
            reason: 'canceled_by_hard_cancel',
          },
        }))
      );
    }

    await tx.insert(subscriptionEvents).values({
      userId: params.userId,
      eventType: 'subscription_canceled',
      planId: activeSubscription?.planId || null,
      metadata: {
        hardCancel: true,
        subscriptionId: activeSubscription?.id || null,
        endDate: activeSubscription?.endDate?.toISOString() || null,
        paymentMethodDetached,
        canceledPendingSubscriptions: canceledPendingRows.map((row) => row.id),
        unresolvedPendingPayments: pendingResolution.unresolvedPendingPayments,
        clearedScheduledChange: Boolean(
          user.scheduledPlanId ||
            user.scheduledBillingPeriod ||
            user.scheduledChangeAt
        ),
        clearedTrialBilling: Boolean(
          user.billingPlanId ||
            user.billingPeriod ||
            user.nextChargeAt ||
            user.billingCollectionStatus !== 'none' ||
            user.graceEndsAt
        ),
      },
    });
  });

  const requiresManualReview =
    pendingResolution.unresolvedPendingPayments.length > 0;

  return {
    success: !requiresManualReview,
    endDate: activeSubscription?.endDate || null,
    message: requiresManualReview
      ? 'Автопродление отключено и локальные будущие списания отменены. Часть платежей у провайдера требует ручной проверки.'
      : 'Автопродление отключено. Подписка останется активной до конца оплаченного периода.',
    activeSubscriptionId: activeSubscription?.id || null,
    canceledPendingSubscriptions: canceledPendingRows.length,
    unresolvedPendingPayments: pendingResolution.unresolvedPendingPayments,
    paymentMethodDetached,
  };
}
