import { and, eq, gt } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  subscriptionEvents,
  userSubscriptions,
  users,
} from '@/server/infrastructure/db/schema';
import { getCurrentActiveSubscription } from './current-subscription.service';
import { dispatchBillingSubscriptionResumedEvent } from '@/server/application/events/app-events.dispatchers';

export interface ResumeSubscriptionResult {
  success: boolean;
  subscriptionId: number;
  planId: string;
  billingPeriod: string;
  nextChargeAt: Date;
  endDate: Date;
}

export async function resumeSubscription(params: {
  userId: number;
  now?: Date;
}): Promise<ResumeSubscriptionResult> {
  const now = params.now ?? new Date();

  const activeSubscription = await getCurrentActiveSubscription({
    userId: params.userId,
    now,
  });

  if (!activeSubscription) {
    const error = new Error(
      'Нет активной подписки для возобновления'
    ) as Error & {
      statusCode?: number;
      statusMessage?: string;
    };
    error.statusCode = 409;
    error.statusMessage = 'No active subscription to resume';
    throw error;
  }

  if (activeSubscription.autoRenew === true) {
    const error = new Error('Автопродление уже включено') as Error & {
      statusCode?: number;
      statusMessage?: string;
    };
    error.statusCode = 409;
    error.statusMessage = 'Subscription auto-renewal is already active';
    throw error;
  }

  if (activeSubscription.endDate <= now) {
    const error = new Error('Период подписки истёк') as Error & {
      statusCode?: number;
      statusMessage?: string;
    };
    error.statusCode = 409;
    error.statusMessage = 'Subscription period has ended';
    throw error;
  }

  if (activeSubscription.paymentProvider === 'apple_iap') {
    const error = new Error(
      'Apple-подписками можно управлять только через App Store'
    ) as Error & {
      statusCode?: number;
      statusMessage?: string;
    };
    error.statusCode = 409;
    error.statusMessage =
      'Apple subscriptions must be managed through the App Store';
    throw error;
  }

  if (activeSubscription.planId === 'basic') {
    const error = new Error(
      'Базовый план не поддерживает автопродление'
    ) as Error & {
      statusCode?: number;
      statusMessage?: string;
    };
    error.statusCode = 409;
    error.statusMessage = 'Basic plan does not support auto-renewal';
    throw error;
  }

  // Проверяем привязку карты
  const [user] = await db
    .select({
      paymentMethodBound: users.paymentMethodBound,
      paymentMethodId: users.paymentMethodId,
    })
    .from(users)
    .where(eq(users.id, params.userId))
    .limit(1);

  if (!user) {
    const error = new Error('User not found') as Error & {
      statusCode?: number;
      statusMessage?: string;
    };
    error.statusCode = 404;
    error.statusMessage = 'User not found';
    throw error;
  }

  if (!user.paymentMethodBound || !user.paymentMethodId) {
    const error = new Error(
      'Для автопродления необходимо привязать карту'
    ) as Error & {
      statusCode?: number;
      statusMessage?: string;
      data?: Record<string, unknown>;
    };
    error.statusCode = 409;
    error.statusMessage = 'payment_method_required';
    throw error;
  }

  const billingPeriod = activeSubscription.billingPeriod || 'month';
  const nextChargeAt = activeSubscription.endDate;

  await db.transaction(async (tx) => {
    await tx
      .update(userSubscriptions)
      .set({
        autoRenew: true,
        updatedAt: now,
      })
      .where(
        and(
          eq(userSubscriptions.id, activeSubscription.id),
          eq(userSubscriptions.userId, params.userId),
          eq(userSubscriptions.paymentStatus, 'active'),
          gt(userSubscriptions.endDate, now)
        )
      );

    await tx
      .update(users)
      .set({
        billingPlanId: activeSubscription.planId,
        billingPeriod: billingPeriod,
        nextChargeAt: nextChargeAt,
        billingCollectionStatus: 'scheduled',
        billingLockedAt: null,
        billingLockedBy: null,
        updatedAt: now,
      })
      .where(eq(users.id, params.userId));

    await tx.insert(subscriptionEvents).values({
      userId: params.userId,
      eventType: 'subscription_resumed',
      planId: activeSubscription.planId,
      metadata: {
        subscriptionId: activeSubscription.id,
        billingPeriod,
        nextChargeAt: nextChargeAt.toISOString(),
        endDate: activeSubscription.endDate.toISOString(),
      },
    });
  });

  dispatchBillingSubscriptionResumedEvent({
    userId: params.userId,
    subscriptionId: activeSubscription.id,
    planId: activeSubscription.planId,
    billingPeriod,
    nextChargeAt,
    endDate: activeSubscription.endDate,
  });

  return {
    success: true,
    subscriptionId: activeSubscription.id,
    planId: activeSubscription.planId,
    billingPeriod,
    nextChargeAt,
    endDate: activeSubscription.endDate,
  };
}
