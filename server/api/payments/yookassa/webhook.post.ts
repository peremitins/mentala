import { createError, getHeader } from 'h3';
import { and, eq, gt, ne, or, sql } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  payments,
  subscriptionEvents,
  userSubscriptions,
  users,
} from '@/server/infrastructure/db/schema';
import {
  extractPaymentMethodPresentation,
  getYooKassaPayment,
  getYooKassaPaymentMethod,
} from '@/server/application/payments/yookassa.client';
import {
  isTrialBillingPeriod,
  isTrialBillingPlanId,
} from '@/server/application/subscriptions/trial-billing.service';
import {
  markTrialChargeFailure,
  markTrialChargeSuccess,
} from '@/server/application/subscriptions/trial-charge-reconcile.service';
import { activateUserPaymentMethod } from '@/server/application/subscriptions/payment-methods.service';

/**
 * ВАЖНО: По официальной документации YooKassa входящие уведомления НЕ подписываются HMAC.
 * Рекомендация YooKassa — проверять подлинность уведомления по статусу объекта (API) и/или по IP.
 */
const YOOKASSA_WEBHOOK_IP_ALLOWLIST = [
  '185.71.76.0/27',
  '185.71.77.0/27',
  '77.75.153.0/25',
  '77.75.154.128/25',
  '77.75.156.11',
  '77.75.156.35',
  '2a02:5180::/32',
];

function normalizeRemoteAddress(ip: string): string {
  if (ip.startsWith('::ffff:')) return ip.slice('::ffff:'.length);
  return ip;
}

function getClientIp(event: any): string | null {
  const xForwardedFor = getHeader(event, 'x-forwarded-for');
  if (xForwardedFor) {
    const first = String(xForwardedFor).split(',')[0]?.trim();
    if (first) return normalizeRemoteAddress(first);
  }

  const xRealIp = getHeader(event, 'x-real-ip');
  if (xRealIp) return normalizeRemoteAddress(String(xRealIp).trim());

  const remote = event?.node?.req?.socket?.remoteAddress;
  if (remote) return normalizeRemoteAddress(String(remote));

  return null;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
  const [a, b, c, d] = nums;
  if (
    typeof a !== 'number' ||
    typeof b !== 'number' ||
    typeof c !== 'number' ||
    typeof d !== 'number'
  ) {
    return null;
  }
  // eslint-disable-next-line no-bitwise
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

function parseCidr(cidr: string): { base: string; prefix: number } | null {
  const trimmed = cidr.trim();
  if (!trimmed) return null;
  if (!trimmed.includes('/')) {
    return { base: trimmed, prefix: trimmed.includes(':') ? 128 : 32 };
  }
  const cidrParts = trimmed.split('/');
  if (cidrParts.length !== 2) return null;

  const [base, prefixStr] = cidrParts;
  if (!base || !prefixStr) return null;

  const prefix = Number(prefixStr);
  if (Number.isNaN(prefix)) return null;
  return { base, prefix };
}

function ipv4InCidr(ip: string, cidr: string): boolean {
  const parsed = parseCidr(cidr);
  if (!parsed) return false;
  if (parsed.base.includes(':')) return false;
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(parsed.base);
  if (ipInt === null || baseInt === null) return false;
  const prefix = parsed.prefix;
  if (prefix < 0 || prefix > 32) return false;
  // eslint-disable-next-line no-bitwise
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  // eslint-disable-next-line no-bitwise
  return (ipInt & mask) === (baseInt & mask);
}

function expandIpv6(ip: string): bigint | null {
  const cleaned = ip.split('%')[0] || ip;
  const parts = cleaned.split('::');
  if (parts.length > 2) return null;

  const left = parts[0] ? parts[0].split(':').filter(Boolean) : [];
  const right = parts[1] ? parts[1].split(':').filter(Boolean) : [];
  const missing = 8 - (left.length + right.length);
  if (missing < 0) return null;

  const hextets = [
    ...left,
    ...Array.from({ length: missing }, () => '0'),
    ...right,
  ];
  if (hextets.length !== 8) return null;

  let value = 0n;
  for (const h of hextets) {
    const n = BigInt(`0x${h}`);
    if (n < 0n || n > 0xffffn) return null;
    value = (value << 16n) | n;
  }
  return value;
}

function ipv6InCidr(ip: string, cidr: string): boolean {
  const parsed = parseCidr(cidr);
  if (!parsed) return false;
  if (!parsed.base.includes(':')) return false;
  const ipBig = expandIpv6(ip);
  const baseBig = expandIpv6(parsed.base);
  if (ipBig === null || baseBig === null) return false;
  const prefix = parsed.prefix;
  if (prefix < 0 || prefix > 128) return false;
  const shift = 128 - prefix;
  return ipBig >> BigInt(shift) === baseBig >> BigInt(shift);
}

function isAllowedYooKassaIp(ip: string): boolean {
  if (ip.includes(':')) {
    return YOOKASSA_WEBHOOK_IP_ALLOWLIST.some((cidr) =>
      cidr.includes(':') ? ipv6InCidr(ip, cidr) : false
    );
  }

  return YOOKASSA_WEBHOOK_IP_ALLOWLIST.some((cidr) =>
    cidr.includes(':') ? false : ipv4InCidr(ip, cidr)
  );
}

function toCents(value: number): number {
  return Math.round(value * 100);
}

async function upsertPaymentRecord(params: {
  paymentId: string;
  subscriptionId: number | null;
  userId: number;
  amount: number;
  currency: string;
  status: 'succeeded' | 'canceled' | 'pending';
  metadata: Record<string, any>;
}) {
  await db
    .insert(payments)
    .values({
      id: params.paymentId,
      subscriptionId: params.subscriptionId,
      userId: params.userId,
      amount: String(params.amount),
      currency: params.currency,
      status: params.status,
      metadata: params.metadata as any,
    })
    .onConflictDoUpdate({
      target: payments.id,
      set: {
        subscriptionId: params.subscriptionId,
        amount: String(params.amount),
        currency: params.currency,
        status: params.status,
        metadata: params.metadata as any,
        updatedAt: new Date(),
      },
    });
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const shopId = String(config.yookassaShopId || '').trim();
  const secretKey = String(config.yookassaSecretKey || '').trim();

  if (!shopId || !secretKey) {
    event.context.logger?.error(
      { hasShopId: !!shopId, hasSecretKey: !!secretKey },
      'YooKassa webhook credentials not configured'
    );
    throw createError({
      statusCode: 500,
      statusMessage: 'YooKassa credentials not configured',
    });
  }

  const rawBody = await readRawBody(event, 'utf8');
  if (!rawBody) {
    event.context.logger?.warn({}, 'YooKassa webhook empty body');
    return { received: true };
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch (err) {
    event.context.logger?.warn({ err }, 'YooKassa webhook invalid JSON');
    return { received: true };
  }

  const webhookObject = body.object || body;
  const objectId = webhookObject?.id ? String(webhookObject.id) : '';
  if (!objectId) {
    event.context.logger?.warn({ body }, 'YooKassa webhook missing object.id');
    return { received: true };
  }

  const clientIp = getClientIp(event);
  if (clientIp && !isAllowedYooKassaIp(clientIp)) {
    event.context.logger?.warn(
      { clientIp, objectId },
      'YooKassa webhook IP outside allowlist (will verify via API)'
    );
  }

  const eventType = String(body?.event || '').trim();
  const now = new Date();

  if (eventType.startsWith('payment_method.')) {
    let paymentMethod: any;
    try {
      paymentMethod = await getYooKassaPaymentMethod({
        shopId,
        secretKey,
        paymentMethodId: objectId,
      });
    } catch (error: any) {
      const status = error?.response?.status || error?.status;
      if (status === 401 || status === 403 || status === 404) {
        return { received: true };
      }
      throw createError({
        statusCode: 502,
        statusMessage: 'Failed to verify payment method status',
      });
    }

    const usersByMethod = await db
      .select({
        id: users.id,
        paymentMethodBindingSessionId: users.paymentMethodBindingSessionId,
      })
      .from(users)
      .where(
        or(
          eq(users.paymentMethodBindingId, paymentMethod.id),
          eq(users.paymentMethodId, paymentMethod.id)
        )
      )
      .limit(1);

    const targetUser = usersByMethod[0];
    if (!targetUser) {
      event.context.logger?.warn(
        { paymentMethodId: paymentMethod.id },
        'Payment method webhook cannot map method to user'
      );
      return { received: true };
    }

    const presentation = extractPaymentMethodPresentation(paymentMethod);

    if (paymentMethod.status === 'active') {
      await db.transaction(async (tx) => {
        await activateUserPaymentMethod({
          userId: targetUser.id,
          paymentMethodId: paymentMethod.id,
          paymentMethodType: presentation.paymentMethodType,
          paymentMethodTitle: presentation.paymentMethodTitle,
          cardBrand: presentation.cardBrand,
          cardLast4: presentation.cardLast4,
          cardExpiryMonth: presentation.cardExpiryMonth,
          cardExpiryYear: presentation.cardExpiryYear,
          now,
          tx,
        });

        await tx.insert(subscriptionEvents).values({
          userId: targetUser.id,
          eventType: 'payment_method_bound',
          metadata: {
            paymentMethodId: paymentMethod.id,
            paymentMethodBindingSessionId:
              targetUser.paymentMethodBindingSessionId,
            source: 'yookassa_webhook',
          },
        });
      });
    } else {
      await db
        .update(users)
        .set({
          paymentMethodBindingStatus: 'failed',
          paymentMethodBindingUpdatedAt: now,
          updatedAt: now,
        })
        .where(eq(users.id, targetUser.id));
    }

    return { received: true };
  }

  let payment: any;
  try {
    payment = await getYooKassaPayment({
      shopId,
      secretKey,
      paymentId: objectId,
    });
  } catch (error: any) {
    const status = error?.response?.status || error?.status;
    if (status === 401 || status === 403 || status === 404) {
      return { received: true };
    }

    throw createError({
      statusCode: 502,
      statusMessage: 'Failed to verify payment status',
    });
  }

  const paymentId = String(payment.id || '').trim();
  const paidAmount = Number(payment?.amount?.value || 0);
  const paidCurrency = String(payment?.amount?.currency || 'RUB');

  const paymentRecordRows = await db
    .select({
      id: payments.id,
      status: payments.status,
    })
    .from(payments)
    .where(eq(payments.id, paymentId))
    .limit(1);
  const existingPayment = paymentRecordRows[0];

  if (
    existingPayment?.status === 'succeeded' ||
    existingPayment?.status === 'canceled'
  ) {
    return { received: true, status: 'already_processed' };
  }

  const metadata = payment?.metadata || {};
  const metadataUserId = Number(metadata.userId || metadata.user_id);
  const chargeAttemptKey = String(metadata.chargeAttemptKey || '').trim();
  const chargeType = String(metadata.chargeType || '').trim();

  // Пытаемся сматчить стандартный checkout-платеж к pending подписке.
  let sub:
    | (typeof userSubscriptions.$inferSelect & Record<string, any>)
    | null = null;
  const byPaymentId = await db
    .select()
    .from(userSubscriptions)
    .where(eq(userSubscriptions.yookassaPaymentId, paymentId))
    .limit(1);

  if (byPaymentId.length) {
    sub = byPaymentId[0] as any;
  } else {
    const subscriptionId = metadata.subscriptionId || metadata.subscription_id;
    if (subscriptionId) {
      const rows = await db
        .select()
        .from(userSubscriptions)
        .where(eq(userSubscriptions.id, Number(subscriptionId)))
        .limit(1);
      if (rows.length) {
        sub = rows[0] as any;
      }
    }
  }

  if (
    !sub &&
    chargeType === 'trial_scheduled' &&
    Number.isFinite(metadataUserId)
  ) {
    const billingPlanId = String(metadata.billingPlanId || '').trim();
    const billingPeriod = String(metadata.billingPeriod || '').trim();
    const nextChargeAtRaw = String(metadata.nextChargeAt || '').trim();
    const nextChargeAt = nextChargeAtRaw ? new Date(nextChargeAtRaw) : null;
    const trigger = String(metadata.trigger || '').trim();
    const attemptMode = trigger === 'manual_retry' ? 'manual' : 'automatic';

    if (
      isTrialBillingPlanId(billingPlanId) &&
      isTrialBillingPeriod(billingPeriod) &&
      chargeAttemptKey &&
      nextChargeAt &&
      !Number.isNaN(nextChargeAt.getTime())
    ) {
      await upsertPaymentRecord({
        paymentId,
        subscriptionId: null,
        userId: metadataUserId,
        amount: paidAmount,
        currency: paidCurrency,
        status:
          payment.status === 'succeeded'
            ? 'succeeded'
            : payment.status === 'canceled'
              ? 'canceled'
              : 'pending',
        metadata: payment as any,
      });

      if (payment.status === 'succeeded' && payment.paid === true) {
        const presentation = extractPaymentMethodPresentation(
          payment.payment_method
        );
        await markTrialChargeSuccess({
          userId: metadataUserId,
          paymentId,
          amount: paidAmount,
          currency: paidCurrency,
          billingPlanId,
          billingPeriod,
          chargeAttemptKey,
          attemptMode,
          now,
          paymentMethodId: payment.payment_method?.id || null,
          paymentMethodType: presentation.paymentMethodType,
          paymentMethodTitle: presentation.paymentMethodTitle,
          paymentMethodCardBrand: presentation.cardBrand,
          paymentMethodCardLast4: presentation.cardLast4,
          paymentMethodCardExpiryMonth: presentation.cardExpiryMonth,
          paymentMethodCardExpiryYear: presentation.cardExpiryYear,
        });
      } else if (payment.status === 'canceled') {
        await markTrialChargeFailure({
          userId: metadataUserId,
          paymentId,
          billingPlanId,
          billingPeriod,
          chargeAttemptKey,
          attemptMode,
          failureReason: 'provider_canceled_webhook',
          scheduledChargeAt: nextChargeAt,
          now,
        });
      }

      return { received: true };
    }
  }

  if (!sub) {
    event.context.logger?.warn(
      { paymentId, metadata },
      'YooKassa webhook cannot map payment to subscription (ignoring)'
    );
    return { received: true };
  }

  if (payment.status === 'succeeded' && payment.paid === true) {
    const expectedCurrency = sub.checkoutCurrency || 'RUB';
    const expectedAmount = Number(sub.checkoutAmount || 0);

    if (paidCurrency !== expectedCurrency) {
      event.context.logger?.error(
        {
          paymentId,
          subscriptionId: sub.id,
          paidCurrency,
          expectedCurrency,
        },
        'YooKassa webhook currency mismatch (refusing to activate)'
      );
      return { received: true };
    }

    if (
      toCents(paidAmount) !== toCents(expectedAmount) ||
      expectedAmount <= 0
    ) {
      event.context.logger?.error(
        {
          paymentId,
          subscriptionId: sub.id,
          paidAmount: payment?.amount?.value,
          expectedAmount,
        },
        'YooKassa webhook amount mismatch (refusing to activate)'
      );
      return { received: true };
    }

    if (sub.paymentStatus !== 'pending') {
      event.context.logger?.warn(
        { paymentId, subscriptionId: sub.id, status: sub.paymentStatus },
        'YooKassa payment succeeded, but subscription is not pending (ignoring activation)'
      );
      return { received: true };
    }

    await db.transaction(async (tx) => {
      await tx
        .insert(payments)
        .values({
          id: paymentId,
          subscriptionId: sub.id,
          userId: sub.userId,
          amount: String(paidAmount),
          currency: paidCurrency,
          status: 'succeeded',
          metadata: payment as any,
        })
        .onConflictDoUpdate({
          target: payments.id,
          set: {
            subscriptionId: sub.id,
            amount: String(paidAmount),
            currency: paidCurrency,
            status: 'succeeded',
            metadata: payment as any,
            updatedAt: now,
          },
        });

      const activated = await tx
        .update(userSubscriptions)
        .set({
          paymentStatus: 'active',
          autoRenew: true,
          yookassaPaymentId: paymentId,
          updatedAt: now,
        })
        .where(
          and(
            eq(userSubscriptions.id, sub.id),
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
            eq(userSubscriptions.userId, sub.userId),
            eq(userSubscriptions.paymentStatus, 'active'),
            gt(userSubscriptions.endDate, now),
            ne(userSubscriptions.id, sub.id)
          )
        );

      const creditGranted = Math.max(0, Number(sub.billingCreditGranted || 0));
      if (creditGranted > 0 && sub.paymentStatus === 'pending') {
        await tx
          .update(users)
          .set({
            billingCredit: sql`${users.billingCredit} + ${creditGranted}`,
            updatedAt: now,
          })
          .where(eq(users.id, sub.userId));
      }

      const paymentMethodPresentation = extractPaymentMethodPresentation(
        payment.payment_method
      );
      if (
        payment.payment_method?.saved === true &&
        payment.payment_method?.id
      ) {
        await activateUserPaymentMethod({
          userId: sub.userId,
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

      if (sub.planId !== 'basic') {
        await tx
          .update(users)
          .set({ trialEndedAt: now, updatedAt: now })
          .where(and(eq(users.id, sub.userId), gt(users.trialEndedAt, now)));
      }

      await tx.insert(subscriptionEvents).values({
        userId: sub.userId,
        eventType: 'purchase_success',
        planId: sub.planId,
        metadata: {
          subscriptionId: sub.id,
          paymentId,
          amount: paidAmount,
          currency: paidCurrency,
        },
      });
    });

    return { received: true };
  }

  if (payment.status === 'canceled') {
    await db.transaction(async (tx) => {
      await tx
        .insert(payments)
        .values({
          id: paymentId,
          subscriptionId: sub.id,
          userId: sub.userId,
          amount: String(paidAmount),
          currency: paidCurrency,
          status: 'canceled',
          metadata: payment as any,
        })
        .onConflictDoUpdate({
          target: payments.id,
          set: {
            subscriptionId: sub.id,
            amount: String(paidAmount),
            currency: paidCurrency,
            status: 'canceled',
            metadata: payment as any,
            updatedAt: now,
          },
        });

      const canceled = await tx
        .update(userSubscriptions)
        .set({ paymentStatus: 'canceled', updatedAt: now })
        .where(
          and(
            eq(userSubscriptions.id, sub.id),
            eq(userSubscriptions.paymentStatus, 'pending')
          )
        )
        .returning({ id: userSubscriptions.id });

      if (!canceled.length) {
        return;
      }

      const creditApplied = Math.max(0, Number(sub.billingCreditApplied || 0));
      if (creditApplied > 0) {
        await tx
          .update(users)
          .set({
            billingCredit: sql`${users.billingCredit} + ${creditApplied}`,
            updatedAt: now,
          })
          .where(eq(users.id, sub.userId));
      }

      await tx.insert(subscriptionEvents).values({
        userId: sub.userId,
        eventType: 'purchase_failed',
        planId: sub.planId,
        metadata: {
          subscriptionId: sub.id,
          paymentId,
          reason: 'canceled',
        },
      });
    });

    return { received: true };
  }

  return { received: true };
});
