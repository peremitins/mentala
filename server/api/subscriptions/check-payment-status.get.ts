import { createError, getQuery } from 'h3';
import { and, desc, eq, gt, ne, sql } from 'drizzle-orm';
import { getSessionUser } from '@/server/application/auth/session';
import { db } from '@/server/infrastructure/db/client';
import {
  payments,
  subscriptionEvents,
  userSubscriptions,
  users,
} from '@/server/infrastructure/db/schema';
import { extractPaymentMethodPresentation } from '@/server/application/payments/yookassa.client';
import { activateUserPaymentMethod } from '@/server/application/subscriptions/payment-methods.service';

interface YooKassaPaymentResponse {
  id?: string;
  status?: string;
  paid?: boolean;
  amount?: {
    value?: string;
    currency?: string;
  };
  payment_method?: {
    id?: string;
    saved?: boolean;
    type?: string;
    title?: string;
    card?: {
      first6?: string;
      last4?: string;
      expiry_month?: string;
      expiry_year?: string;
      card_type?: string;
    };
  };
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

interface CheckPaymentStatusResponse {
  subscriptionId: number | null;
  localStatus: string | null;
  paymentStatus: string | null;
  providerVerified: boolean;
  paymentId: string | null;
  providerStatus: string | null;
  paid: boolean;
  shouldContinuePolling: boolean;
  updatedAt?: string | null;
  amount?: number;
  currency?: string;
  providerErrorStatus?: number | string | null;
}

async function fetchYooKassaPayment(
  paymentId: string,
  shopId: string,
  secretKey: string
): Promise<YooKassaPaymentResponse> {
  const auth = Buffer.from(`${shopId}:${secretKey}`).toString('base64');
  return await $fetch<YooKassaPaymentResponse>(
    `https://api.yookassa.ru/v3/payments/${paymentId}`,
    {
      method: 'GET',
      timeout: 10_000,
      headers: {
        Authorization: `Basic ${auth}`,
      },
    }
  );
}

function toCents(value: number): number {
  return Math.round(value * 100);
}

/**
 * GET /api/subscriptions/check-payment-status
 * Серверная верификация pending checkout по YooKassa API для short polling UI.
 *
 * Важно:
 * если у провайдера платеж уже финальный (`succeeded`/`canceled`), а локально
 * подписка всё ещё `pending`, endpoint делает reconciliation (self-heal).
 * Это закрывает гонку, когда webhook задержался или не был доставлен.
 */
export default defineEventHandler(
  async (event): Promise<CheckPaymentStatusResponse> => {
    const sessionResult = await getSessionUser(event);
    if (!sessionResult?.user?.id) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Unauthorized',
      });
    }

    const query = getQuery(event);
    const querySubscriptionId = Number(query.subscriptionId);
    const hasSubscriptionIdFilter = Number.isFinite(querySubscriptionId);
    let targetSubscription: typeof userSubscriptions.$inferSelect | undefined;

    if (hasSubscriptionIdFilter) {
      const exactRows = await db
        .select()
        .from(userSubscriptions)
        .where(
          and(
            eq(userSubscriptions.userId, sessionResult.user.id),
            eq(userSubscriptions.id, querySubscriptionId)
          )
        )
        .limit(1);

      targetSubscription = exactRows[0];
    } else {
      const pendingRows = await db
        .select()
        .from(userSubscriptions)
        .where(
          and(
            eq(userSubscriptions.userId, sessionResult.user.id),
            eq(userSubscriptions.paymentStatus, 'pending')
          )
        )
        .orderBy(desc(userSubscriptions.createdAt))
        .limit(1);

      targetSubscription = pendingRows[0];
    }

    if (!targetSubscription) {
      return {
        subscriptionId: hasSubscriptionIdFilter ? querySubscriptionId : null,
        localStatus: 'none',
        paymentStatus: null,
        providerVerified: false,
        paymentId: null,
        providerStatus: null,
        paid: false,
        shouldContinuePolling: false,
      };
    }

    if (targetSubscription.paymentStatus !== 'pending') {
      return {
        subscriptionId: targetSubscription.id,
        localStatus: targetSubscription.paymentStatus,
        paymentStatus: targetSubscription.paymentStatus,
        providerVerified: false,
        paymentId: targetSubscription.yookassaPaymentId,
        providerStatus: null,
        paid: false,
        shouldContinuePolling: false,
        updatedAt: targetSubscription.updatedAt?.toISOString?.() || null,
      };
    }

    if (!targetSubscription.yookassaPaymentId) {
      return {
        subscriptionId: targetSubscription.id,
        localStatus: targetSubscription.paymentStatus,
        paymentStatus: targetSubscription.paymentStatus,
        providerVerified: false,
        paymentId: null,
        providerStatus: null,
        paid: false,
        shouldContinuePolling: true,
      };
    }

    const config = useRuntimeConfig(event);
    const shopId = String(config.yookassaShopId || '').trim();
    const secretKey = String(config.yookassaSecretKey || '').trim();

    if (!shopId || !secretKey) {
      return {
        subscriptionId: targetSubscription.id,
        localStatus: targetSubscription.paymentStatus,
        paymentStatus: targetSubscription.paymentStatus,
        providerVerified: false,
        paymentId: targetSubscription.yookassaPaymentId,
        providerStatus: null,
        paid: false,
        shouldContinuePolling: true,
      };
    }

    try {
      const payment: YooKassaPaymentResponse = await fetchYooKassaPayment(
        targetSubscription.yookassaPaymentId,
        shopId,
        secretKey
      );
      const providerStatus = String(payment?.status || '');
      const isPaid = payment?.paid === true;
      const paidAmount = Number(payment?.amount?.value || 0);
      const paidCurrency = String(
        payment?.amount?.currency ||
          targetSubscription.checkoutCurrency ||
          'RUB'
      );
      const now = new Date();

      if (providerStatus === 'succeeded' && isPaid) {
        const expectedCurrency = targetSubscription.checkoutCurrency || 'RUB';
        const expectedAmount = Number(targetSubscription.checkoutAmount || 0);

        // Не активируем подписку без строгой валидации суммы и валюты.
        const amountMatches =
          expectedAmount > 0 &&
          paidCurrency === expectedCurrency &&
          toCents(paidAmount) === toCents(expectedAmount);

        if (!amountMatches) {
          event.context.logger?.error(
            {
              subscriptionId: targetSubscription.id,
              paymentId: targetSubscription.yookassaPaymentId,
              paidAmount,
              expectedAmount,
              paidCurrency,
              expectedCurrency,
            },
            'check-payment-status reconcile refused: amount/currency mismatch'
          );
        } else {
          await db.transaction(async (tx) => {
            const inserted = await tx
              .insert(payments)
              .values({
                id: String(targetSubscription!.yookassaPaymentId),
                subscriptionId: targetSubscription!.id,
                userId: targetSubscription!.userId,
                amount: String(paidAmount),
                currency: paidCurrency,
                status: 'succeeded',
                metadata: payment as any,
              })
              .onConflictDoNothing({ target: payments.id })
              .returning({ id: payments.id });

            // Уже обработано webhook/предыдущим reconcile.
            if (!inserted.length) {
              return;
            }

            const activated = await tx
              .update(userSubscriptions)
              .set({
                paymentStatus: 'active',
                autoRenew: true,
                yookassaPaymentId: String(
                  targetSubscription!.yookassaPaymentId
                ),
                updatedAt: now,
              })
              .where(
                and(
                  eq(userSubscriptions.id, targetSubscription!.id),
                  eq(userSubscriptions.paymentStatus, 'pending')
                )
              )
              .returning({ id: userSubscriptions.id });

            if (!activated.length) {
              return;
            }

            await tx
              .update(userSubscriptions)
              .set({ paymentStatus: 'expired', updatedAt: now })
              .where(
                and(
                  eq(userSubscriptions.userId, targetSubscription!.userId),
                  eq(userSubscriptions.paymentStatus, 'active'),
                  gt(userSubscriptions.endDate, now),
                  ne(userSubscriptions.id, targetSubscription!.id)
                )
              );

            const creditGranted = Math.max(
              0,
              Number(targetSubscription!.billingCreditGranted || 0)
            );
            if (creditGranted > 0) {
              await tx
                .update(users)
                .set({
                  billingCredit: sql`${users.billingCredit} + ${creditGranted}`,
                  updatedAt: now,
                })
                .where(eq(users.id, targetSubscription!.userId));
            }

            if (targetSubscription!.planId !== 'basic') {
              await tx
                .update(users)
                .set({ trialEndedAt: now, updatedAt: now })
                .where(
                  and(
                    eq(users.id, targetSubscription!.userId),
                    gt(users.trialEndedAt, now)
                  )
                );
            }

            const paymentMethodPresentation = extractPaymentMethodPresentation(
              payment.payment_method
            );
            if (payment.payment_method?.saved === true) {
              const resolvedPaymentMethodId = String(
                payment.payment_method?.id || ''
              ).trim();
              if (resolvedPaymentMethodId) {
                await activateUserPaymentMethod({
                  userId: targetSubscription!.userId,
                  paymentMethodId: resolvedPaymentMethodId,
                  paymentMethodType:
                    paymentMethodPresentation.paymentMethodType,
                  paymentMethodTitle:
                    paymentMethodPresentation.paymentMethodTitle,
                  cardBrand: paymentMethodPresentation.cardBrand,
                  cardLast4: paymentMethodPresentation.cardLast4,
                  cardExpiryMonth: paymentMethodPresentation.cardExpiryMonth,
                  cardExpiryYear: paymentMethodPresentation.cardExpiryYear,
                  now,
                  tx,
                });
              }
            }

            await tx.insert(subscriptionEvents).values({
              userId: targetSubscription!.userId,
              eventType: 'purchase_success',
              planId: targetSubscription!.planId,
              metadata: {
                subscriptionId: targetSubscription!.id,
                paymentId: String(targetSubscription!.yookassaPaymentId),
                amount: paidAmount,
                currency: paidCurrency,
                source: 'check-payment-status',
              },
            });
          });
        }
      } else if (providerStatus === 'canceled') {
        await db.transaction(async (tx) => {
          const inserted = await tx
            .insert(payments)
            .values({
              id: String(targetSubscription!.yookassaPaymentId),
              subscriptionId: targetSubscription!.id,
              userId: targetSubscription!.userId,
              amount: String(paidAmount),
              currency: paidCurrency,
              status: 'canceled',
              metadata: payment as any,
            })
            .onConflictDoNothing({ target: payments.id })
            .returning({ id: payments.id });

          if (!inserted.length) {
            return;
          }

          const canceled = await tx
            .update(userSubscriptions)
            .set({ paymentStatus: 'canceled', updatedAt: now })
            .where(
              and(
                eq(userSubscriptions.id, targetSubscription!.id),
                eq(userSubscriptions.paymentStatus, 'pending')
              )
            )
            .returning({ id: userSubscriptions.id });

          if (!canceled.length) {
            return;
          }

          const creditApplied = Math.max(
            0,
            Number(targetSubscription!.billingCreditApplied || 0)
          );
          if (creditApplied > 0) {
            await tx
              .update(users)
              .set({
                billingCredit: sql`${users.billingCredit} + ${creditApplied}`,
                updatedAt: now,
              })
              .where(eq(users.id, targetSubscription!.userId));
          }

          await tx.insert(subscriptionEvents).values({
            userId: targetSubscription!.userId,
            eventType: 'purchase_failed',
            planId: targetSubscription!.planId,
            metadata: {
              subscriptionId: targetSubscription!.id,
              paymentId: String(targetSubscription!.yookassaPaymentId),
              reason: 'canceled',
              source: 'check-payment-status',
            },
          });
        });
      }

      // Читаем уже обновлённый локальный статус после reconcile.
      const latestRows = await db
        .select({
          paymentStatus: userSubscriptions.paymentStatus,
          updatedAt: userSubscriptions.updatedAt,
        })
        .from(userSubscriptions)
        .where(
          and(
            eq(userSubscriptions.userId, sessionResult.user.id),
            eq(userSubscriptions.id, targetSubscription.id)
          )
        )
        .limit(1);
      const latestLocalStatus = latestRows[0]?.paymentStatus || 'pending';
      const latestUpdatedAt =
        latestRows[0]?.updatedAt || targetSubscription.updatedAt;

      // Даже если провайдер уже в terminal-статусе, продолжаем polling, пока локальная
      // запись остаётся pending (например, в момент конкурентной обработки webhook).
      const shouldContinuePolling =
        latestLocalStatus === 'pending' &&
        (providerStatus === 'pending' ||
          providerStatus === 'waiting_for_capture' ||
          (providerStatus === 'succeeded' && isPaid) ||
          providerStatus === 'canceled');

      return {
        subscriptionId: targetSubscription.id,
        localStatus: latestLocalStatus,
        paymentStatus: latestLocalStatus,
        providerVerified: true,
        paymentId: targetSubscription.yookassaPaymentId,
        providerStatus,
        paid: isPaid,
        amount: paidAmount,
        currency: paidCurrency,
        shouldContinuePolling,
        updatedAt: latestUpdatedAt?.toISOString?.() || null,
      };
    } catch (error: any) {
      const status = error?.response?.status || error?.status || null;
      return {
        subscriptionId: targetSubscription.id,
        localStatus: targetSubscription.paymentStatus,
        paymentStatus: targetSubscription.paymentStatus,
        providerVerified: false,
        paymentId: targetSubscription.yookassaPaymentId,
        providerStatus: null,
        paid: false,
        providerErrorStatus: status,
        shouldContinuePolling: true,
      };
    }
  }
);
