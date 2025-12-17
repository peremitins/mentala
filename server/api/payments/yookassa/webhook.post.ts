import { createError, getHeader } from 'h3';
import { db } from '@/server/infrastructure/db/client';
import {
  payments,
  subscriptionEvents,
  userSubscriptions,
  users,
} from '@/server/infrastructure/db/schema';
import { and, eq, gt, ne, sql } from 'drizzle-orm';

/**
 * ВАЖНО: По официальной документации YooKassa входящие уведомления НЕ подписываются HMAC.
 * Рекомендация YooKassa — проверять подлинность уведомления по статусу объекта (API) и/или по IP.
 *
 * Документация:
 * - Webhooks: https://yookassa.ru/developers/using-api/webhooks?lang=ru
 * - Payments API (GET payment): https://yookassa.ru/developers/api
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
  // eslint-disable-next-line no-bitwise
  return ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0;
}

function parseCidr(cidr: string): { base: string; prefix: number } | null {
  const trimmed = cidr.trim();
  if (!trimmed) return null;
  if (!trimmed.includes('/')) {
    return { base: trimmed, prefix: trimmed.includes(':') ? 128 : 32 };
  }
  const [base, prefixStr] = trimmed.split('/');
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
  return (ipBig >> BigInt(shift)) === (baseBig >> BigInt(shift));
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

async function fetchYooKassaPayment(
  paymentId: string,
  shopId: string,
  secretKey: string
): Promise<any> {
  const auth = Buffer.from(`${shopId}:${secretKey}`).toString('base64');
  return await $fetch(`https://api.yookassa.ru/v3/payments/${paymentId}`, {
    method: 'GET',
    timeout: 10_000,
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });
}

function toCents(value: number): number {
  return Math.round(value * 100);
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const shopId = config.yookassaShopId;
  const secretKey = config.yookassaSecretKey;

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

  const webhookPayment = body.object || body;
  const paymentId = webhookPayment?.id ? String(webhookPayment.id) : null;
  if (!paymentId) {
    event.context.logger?.warn({ body }, 'YooKassa webhook missing payment.id');
    return { received: true };
  }

  // Мягкая проверка IP: это НЕ блокирующая проверка.
  // Даже если IP не из allowlist (прокси/балансер), подлинность webhook подтверждаем через API YooKassa.
  const clientIp = getClientIp(event);
  if (clientIp && !isAllowedYooKassaIp(clientIp)) {
    event.context.logger?.warn(
      { clientIp, paymentId },
      'YooKassa webhook IP outside allowlist (will verify via API)'
    );
  }

  // Истина — в API YooKassa (проверка статуса объекта)
  let payment: any;
  try {
    payment = await fetchYooKassaPayment(
      paymentId,
      String(shopId),
      String(secretKey)
    );
  } catch (err: any) {
    const status = err?.response?.status || err?.status;

    // 401/403/404: либо платеж не наш, либо не существует — игнорируем
    if (status === 401 || status === 403 || status === 404) {
      event.context.logger?.warn(
        { paymentId, status },
        'YooKassa webhook payment not accessible via API (ignoring)'
      );
      return { received: true };
    }

    event.context.logger?.error(
      { paymentId, status, err },
      'Failed to verify YooKassa payment via API'
    );
    // Для временных/сетевых ошибок лучше дать YooKassa ретраить
    throw createError({
      statusCode: 502,
      statusMessage: 'Failed to verify payment status',
    });
  }

  // Идемпотентность: если уже сохранили paymentId — значит обработали
  const existing = await db
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.id, String(paymentId)))
    .limit(1);

  if (existing.length) {
    return { received: true, status: 'already_processed' };
  }

  // Ищем подписку: сначала по yookassaPaymentId (на будущее), затем по metadata.subscriptionId
  let sub:
    | (typeof userSubscriptions.$inferSelect & Record<string, any>)
    | null = null;

  const byPaymentId = await db
    .select()
    .from(userSubscriptions)
    .where(eq(userSubscriptions.yookassaPaymentId, String(paymentId)))
    .limit(1);

  if (byPaymentId.length) {
    sub = byPaymentId[0] as any;
  } else {
    const metadata = payment?.metadata || {};
    const subscriptionId = metadata.subscriptionId || metadata.subscription_id;
    if (subscriptionId) {
      const rows = await db
        .select()
        .from(userSubscriptions)
        .where(eq(userSubscriptions.id, Number(subscriptionId)))
        .limit(1);
      if (rows.length) sub = rows[0] as any;
    }
  }

  if (!sub) {
    event.context.logger?.warn(
      { paymentId, metadata: payment?.metadata },
      'YooKassa webhook cannot map payment to subscription (ignoring)'
    );
    return { received: true };
  }

  const now = new Date();

  const paidCurrency = payment?.amount?.currency || 'RUB';
  const paidAmount = Number(payment?.amount?.value || 0);

  // Обрабатываем только конечные статусы
  if (payment.status === 'succeeded' && payment.paid === true) {
    const expectedCurrency = sub.checkoutCurrency || 'RUB';
    const expectedAmount = Number(sub.checkoutAmount || 0);

    // Валидация валюты/суммы: если mismatch — не активируем подписку (и не ретраим)
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

    if (toCents(paidAmount) !== toCents(expectedAmount) || expectedAmount <= 0) {
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
      // Сохраняем платеж (фиксируем идемпотентность)
      const inserted = await tx
        .insert(payments)
        .values({
          id: String(paymentId),
          subscriptionId: sub.id,
          userId: sub.userId,
          amount: String(paidAmount),
          currency: paidCurrency,
          status: 'succeeded',
          metadata: payment as any,
        })
        .onConflictDoNothing({ target: payments.id })
        .returning({ id: payments.id });

      // Если конкурентный webhook уже успел обработать paymentId — ничего не делаем
      if (!inserted.length) {
        return;
      }

      // Активируем pending подписку и привязываем paymentId (на будущее).
      // Доп. защита от гонок: делаем переход только если статус всё ещё pending.
      const activated = await tx
        .update(userSubscriptions)
        .set({
          paymentStatus: 'active',
          autoRenew: true,
          yookassaPaymentId: String(paymentId),
        })
        .where(
          and(
            eq(userSubscriptions.id, sub.id),
            eq(userSubscriptions.paymentStatus, 'pending')
          )
        )
        .returning({ id: userSubscriptions.id });

      if (!activated.length) {
        event.context.logger?.warn(
          { paymentId, subscriptionId: sub.id },
          'YooKassa payment succeeded, but subscription was not pending at activation time'
        );
        return;
      }

      // Истекаем другие активные подписки пользователя
      const otherActive = await tx
        .select()
        .from(userSubscriptions)
        .where(
          and(
            eq(userSubscriptions.userId, sub.userId),
            eq(userSubscriptions.paymentStatus, 'active'),
            gt(userSubscriptions.endDate, now),
            ne(userSubscriptions.id, sub.id)
          )
        );

      for (const oldSub of otherActive) {
        await tx
          .update(userSubscriptions)
          .set({ paymentStatus: 'expired' })
          .where(eq(userSubscriptions.id, oldSub.id));
      }

      // Кредит:
      // - billingCreditApplied уже "зарезервирован" в start-checkout (мы НЕ списываем его тут)
      // - billingCreditGranted начисляем здесь при успешной финализации через webhook (когда toPay > 0)
      const creditGranted = Math.max(0, Number(sub.billingCreditGranted || 0));
      // Начисляем только если подписка была pending (защита от повторной финализации/дублей)
      if (creditGranted > 0 && sub.paymentStatus === 'pending') {
        await tx
          .update(users)
          .set({
            billingCredit: sql`${users.billingCredit} + ${creditGranted}`,
            updatedAt: now,
          })
          .where(eq(users.id, sub.userId));
      }

      // Завершаем Trial при покупке платного плана (не Basic)
      if (sub.planId !== 'basic') {
        await tx
          .update(users)
          .set({ trialEndedAt: now, updatedAt: now })
          .where(
            and(eq(users.id, sub.userId), gt(users.trialEndedAt, now))
          );
      }

      await tx.insert(subscriptionEvents).values({
        userId: sub.userId,
        eventType: 'purchase_success',
        planId: sub.planId,
        metadata: {
          subscriptionId: sub.id,
          paymentId: String(paymentId),
          amount: paidAmount,
          currency: paidCurrency,
        },
      });
    });

    event.context.logger?.info(
      { paymentId, subscriptionId: sub.id, userId: sub.userId },
      'YooKassa webhook payment succeeded, subscription activated'
    );

    return { received: true };
  }

  if (payment.status === 'canceled') {
    await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(payments)
        .values({
          id: String(paymentId),
          subscriptionId: sub.id,
          userId: sub.userId,
          amount: String(paidAmount),
          currency: paidCurrency,
          status: 'canceled',
          metadata: payment as any,
        })
        .onConflictDoNothing({ target: payments.id })
        .returning({ id: payments.id });

      // Если конкурентный webhook уже успел обработать paymentId — ничего не делаем
      if (!inserted.length) {
        return;
      }

      const canceled = await tx
        .update(userSubscriptions)
        .set({ paymentStatus: 'canceled' })
        .where(
          and(
            eq(userSubscriptions.id, sub.id),
            eq(userSubscriptions.paymentStatus, 'pending')
          )
        )
        .returning({ id: userSubscriptions.id });

      if (!canceled.length) {
        event.context.logger?.warn(
          {
            paymentId,
            subscriptionId: sub.id,
            subscriptionStatusAtRead: sub.paymentStatus,
          },
          'YooKassa payment canceled, but subscription was not pending at cancel time'
        );
        return;
      }

      // Возвращаем зарезервированный кредит, если оплата отменена
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
          paymentId: String(paymentId),
          reason: 'canceled',
        },
      });
    });

    event.context.logger?.info(
      { paymentId, subscriptionId: sub.id, userId: sub.userId },
      'YooKassa webhook payment canceled'
    );

    return { received: true };
  }

  // Другие статусы/события нам пока не важны (waiting_for_capture, pending и т.п.)
  return { received: true };
});
