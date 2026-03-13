import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { userPaymentMethods, users } from '@/server/infrastructure/db/schema';
import {
  extractPaymentMethodPresentation,
  getYooKassaPaymentMethod,
} from '@/server/application/payments/yookassa.client';
import { dispatchBillingPaymentMethodBoundEvent } from '@/server/application/events/app-events.dispatchers';

function normalizeCardMonth(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return null;
  return digits.padStart(2, '0').slice(-2);
}

function normalizeCardYear(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return null;

  if (digits.length === 2) {
    return `20${digits}`;
  }

  return digits.slice(-4);
}

export interface ActivatePaymentMethodParams {
  userId: number;
  paymentMethodId: string;
  paymentMethodType?: string | null;
  paymentMethodTitle?: string | null;
  cardBrand?: string | null;
  cardLast4?: string | null;
  cardExpiryMonth?: string | null;
  cardExpiryYear?: string | null;
  now?: Date;
  tx?: any;
}

export interface SyncPendingBindingResult {
  paymentMethodBound: boolean;
  bindingStatus: 'none' | 'pending' | 'active' | 'failed';
  synced: boolean;
}

/**
 * Назначает новый дефолтный способ оплаты.
 * Если ранее у пользователя был другой активный метод — помечаем его archived.
 */
export async function activateUserPaymentMethod(
  params: ActivatePaymentMethodParams
) {
  const now = params.now ?? new Date();
  const paymentMethodId = String(params.paymentMethodId || '').trim();

  if (!paymentMethodId) {
    throw new Error('paymentMethodId is required');
  }

  const run = async (tx: any) => {
    const existingRows = await tx
      .select({
        paymentMethodId: users.paymentMethodId,
        paymentMethodType: users.paymentMethodType,
        paymentMethodTitle: users.paymentMethodTitle,
        paymentMethodCardBrand: users.paymentMethodCardBrand,
        paymentMethodCardLast4: users.paymentMethodCardLast4,
        paymentMethodCardExpiryMonth: users.paymentMethodCardExpiryMonth,
        paymentMethodCardExpiryYear: users.paymentMethodCardExpiryYear,
      })
      .from(users)
      .where(eq(users.id, params.userId))
      .limit(1);

    const existing = existingRows[0];
    if (!existing) {
      throw new Error(`User ${params.userId} not found`);
    }

    // Если дефолтная карта изменилась — архивируем прежнюю.
    if (
      existing.paymentMethodId &&
      existing.paymentMethodId !== paymentMethodId
    ) {
      await tx
        .insert(userPaymentMethods)
        .values({
          userId: params.userId,
          provider: 'yookassa',
          providerPaymentMethodId: existing.paymentMethodId,
          status: 'archived',
          isDefault: false,
          paymentMethodType: existing.paymentMethodType,
          paymentMethodTitle: existing.paymentMethodTitle,
          cardBrand: existing.paymentMethodCardBrand,
          cardLast4: existing.paymentMethodCardLast4,
          cardExpiryMonth: existing.paymentMethodCardExpiryMonth,
          cardExpiryYear: existing.paymentMethodCardExpiryYear,
          archivedAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            userPaymentMethods.userId,
            userPaymentMethods.providerPaymentMethodId,
          ],
          set: {
            status: 'archived',
            isDefault: false,
            archivedAt: now,
            updatedAt: now,
          },
        });
    }

    await tx
      .insert(userPaymentMethods)
      .values({
        userId: params.userId,
        provider: 'yookassa',
        providerPaymentMethodId: paymentMethodId,
        status: 'active',
        isDefault: true,
        paymentMethodType: params.paymentMethodType || null,
        paymentMethodTitle: params.paymentMethodTitle || null,
        cardBrand: params.cardBrand || null,
        cardLast4: params.cardLast4 || null,
        cardExpiryMonth: normalizeCardMonth(params.cardExpiryMonth),
        cardExpiryYear: normalizeCardYear(params.cardExpiryYear),
        archivedAt: null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          userPaymentMethods.userId,
          userPaymentMethods.providerPaymentMethodId,
        ],
        set: {
          status: 'active',
          isDefault: true,
          paymentMethodType: params.paymentMethodType || null,
          paymentMethodTitle: params.paymentMethodTitle || null,
          cardBrand: params.cardBrand || null,
          cardLast4: params.cardLast4 || null,
          cardExpiryMonth: normalizeCardMonth(params.cardExpiryMonth),
          cardExpiryYear: normalizeCardYear(params.cardExpiryYear),
          archivedAt: null,
          updatedAt: now,
        },
      });

    await tx
      .update(userPaymentMethods)
      .set({
        isDefault: false,
        updatedAt: now,
      })
      .where(
        and(
          eq(userPaymentMethods.userId, params.userId),
          ne(userPaymentMethods.providerPaymentMethodId, paymentMethodId)
        )
      );

    await tx
      .update(users)
      .set({
        paymentMethodBound: true,
        paymentMethodId,
        paymentMethodType: params.paymentMethodType || null,
        paymentMethodTitle: params.paymentMethodTitle || null,
        paymentMethodCardBrand: params.cardBrand || null,
        paymentMethodCardLast4: params.cardLast4 || null,
        paymentMethodCardExpiryMonth: normalizeCardMonth(
          params.cardExpiryMonth
        ),
        paymentMethodCardExpiryYear: normalizeCardYear(params.cardExpiryYear),
        paymentMethodBindingStatus: 'active',
        paymentMethodBindingUpdatedAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, params.userId));
  };

  if (params.tx) {
    await run(params.tx);
    return;
  }

  await db.transaction(async (tx) => {
    await run(tx);
  });
}

/**
 * Пытается синхронизировать pending-привязку карты из YooKassa в локальную БД.
 */
export async function syncPendingPaymentMethodBinding(params: {
  userId: number;
  shopId: string;
  secretKey: string;
  now?: Date;
}): Promise<SyncPendingBindingResult> {
  const now = params.now ?? new Date();

  const userRows = await db
    .select({
      paymentMethodBound: users.paymentMethodBound,
      paymentMethodId: users.paymentMethodId,
      paymentMethodBindingId: users.paymentMethodBindingId,
      paymentMethodBindingSessionId: users.paymentMethodBindingSessionId,
      paymentMethodBindingStatus: users.paymentMethodBindingStatus,
    })
    .from(users)
    .where(eq(users.id, params.userId))
    .limit(1);

  const user = userRows[0];
  if (!user) {
    throw new Error(`User ${params.userId} not found`);
  }

  if (user.paymentMethodBound && user.paymentMethodId) {
    return {
      paymentMethodBound: true,
      bindingStatus: 'active',
      synced: false,
    };
  }

  if (
    !user.paymentMethodBindingId ||
    user.paymentMethodBindingStatus !== 'pending'
  ) {
    return {
      paymentMethodBound: false,
      bindingStatus:
        user.paymentMethodBindingStatus === 'failed' ? 'failed' : 'none',
      synced: false,
    };
  }

  const paymentMethod = await getYooKassaPaymentMethod({
    shopId: params.shopId,
    secretKey: params.secretKey,
    paymentMethodId: user.paymentMethodBindingId,
  });

  if (paymentMethod.status === 'active') {
    const presentation = extractPaymentMethodPresentation(paymentMethod);

    await activateUserPaymentMethod({
      userId: params.userId,
      paymentMethodId: paymentMethod.id,
      paymentMethodType: presentation.paymentMethodType,
      paymentMethodTitle: presentation.paymentMethodTitle,
      cardBrand: presentation.cardBrand,
      cardLast4: presentation.cardLast4,
      cardExpiryMonth: presentation.cardExpiryMonth,
      cardExpiryYear: presentation.cardExpiryYear,
      now,
    });

    dispatchBillingPaymentMethodBoundEvent({
      userId: params.userId,
      source: 'subscriptions.sync-pending-payment-method',
      provider: 'yookassa',
      paymentMethodId: paymentMethod.id,
      bindingSessionId: user.paymentMethodBindingSessionId || null,
      occurredAt: now,
    });

    return {
      paymentMethodBound: true,
      bindingStatus: 'active',
      synced: true,
    };
  }

  if (paymentMethod.status === 'inactive') {
    await db
      .update(users)
      .set({
        paymentMethodBindingStatus: 'failed',
        paymentMethodBindingUpdatedAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, params.userId));

    return {
      paymentMethodBound: false,
      bindingStatus: 'failed',
      synced: true,
    };
  }

  return {
    paymentMethodBound: false,
    bindingStatus: 'pending',
    synced: false,
  };
}

/**
 * Отвязывает текущий способ оплаты и архивирует его.
 */
export async function detachUserPaymentMethod(params: {
  userId: number;
  cancelScheduledTrialBilling?: boolean;
  now?: Date;
  tx?: any;
}) {
  const now = params.now ?? new Date();
  const shouldCancelScheduledTrialBilling =
    params.cancelScheduledTrialBilling === true;

  const run = async (tx: any) => {
    const existingRows = await tx
      .select({
        paymentMethodId: users.paymentMethodId,
        paymentMethodType: users.paymentMethodType,
        paymentMethodTitle: users.paymentMethodTitle,
        paymentMethodCardBrand: users.paymentMethodCardBrand,
        paymentMethodCardLast4: users.paymentMethodCardLast4,
        paymentMethodCardExpiryMonth: users.paymentMethodCardExpiryMonth,
        paymentMethodCardExpiryYear: users.paymentMethodCardExpiryYear,
      })
      .from(users)
      .where(eq(users.id, params.userId))
      .limit(1);

    const existing = existingRows[0];
    if (!existing) {
      throw new Error(`User ${params.userId} not found`);
    }

    if (existing.paymentMethodId) {
      await tx
        .insert(userPaymentMethods)
        .values({
          userId: params.userId,
          provider: 'yookassa',
          providerPaymentMethodId: existing.paymentMethodId,
          status: 'archived',
          isDefault: false,
          paymentMethodType: existing.paymentMethodType,
          paymentMethodTitle: existing.paymentMethodTitle,
          cardBrand: existing.paymentMethodCardBrand,
          cardLast4: existing.paymentMethodCardLast4,
          cardExpiryMonth: existing.paymentMethodCardExpiryMonth,
          cardExpiryYear: existing.paymentMethodCardExpiryYear,
          archivedAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            userPaymentMethods.userId,
            userPaymentMethods.providerPaymentMethodId,
          ],
          set: {
            status: 'archived',
            isDefault: false,
            archivedAt: now,
            updatedAt: now,
          },
        });
    }

    await tx
      .update(userPaymentMethods)
      .set({
        isDefault: false,
        updatedAt: now,
      })
      .where(eq(userPaymentMethods.userId, params.userId));

    await tx
      .update(users)
      .set({
        paymentMethodBound: false,
        paymentMethodId: null,
        paymentMethodType: null,
        paymentMethodTitle: null,
        paymentMethodCardBrand: null,
        paymentMethodCardLast4: null,
        paymentMethodCardExpiryMonth: null,
        paymentMethodCardExpiryYear: null,
        paymentMethodBindingId: null,
        paymentMethodBindingSessionId: null,
        paymentMethodBindingStatus: 'none',
        paymentMethodBindingUpdatedAt: now,
        ...(shouldCancelScheduledTrialBilling
          ? {
              billingPlanId: null,
              billingPeriod: null,
              nextChargeAt: null,
              billingCollectionStatus: 'none' as const,
              graceEndsAt: null,
              billingReminderSentAt: null,
              billingLockedAt: null,
              billingLockedBy: null,
            }
          : {}),
        updatedAt: now,
      })
      .where(eq(users.id, params.userId));
  };

  if (params.tx) {
    await run(params.tx);
    return;
  }

  await db.transaction(async (tx) => {
    await run(tx);
  });
}
