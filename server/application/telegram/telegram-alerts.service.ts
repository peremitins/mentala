import { createHash } from 'node:crypto';
import { getTelegramAlertsConfig } from './telegram-alerts.config';
import {
  isAmbiguousTelegramDeliveryError,
  isRetryableTelegramTransportError,
  sendTelegramMessage,
  TelegramApiError,
} from './telegram.client';
import { formatTelegramAlertMessage } from './telegram.formatter';
import { resolveTelegramAlertChannel } from './telegram-routing';
import {
  createQueuedTelegramDelivery,
  markTelegramDeliveryFailed,
  markTelegramDeliveryProcessing,
  markTelegramDeliveryQueueFailure,
  markTelegramDeliverySent,
  markTelegramDeliveryUncertain,
} from './repositories/telegram-deliveries.repository';
import {
  buildTelegramAlertsJobId,
  telegramAlertsQueue,
} from './queues/telegramAlerts.queue';
import {
  buildTelegramAlertBucketedDedupKey,
  normalizeTelegramAlertErrorDetails,
} from './telegram-alert.utils';
import { resolveTelegramAlertUserEmail } from './telegram-alert-user-context';
import { isStaticGenerateProcess } from '@/server/utils/static-generate';
import type {
  TelegramAlertEnvelope,
  TelegramUserRegistrationMethod,
} from './telegram-alert.types';

function toMinorUnits(value: unknown): number | null {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return null;
  }

  return Math.round(normalized * 100);
}

export function buildTelegramAlertStableHash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 16);
}

function normalizeNullableString(value: unknown): string | null {
  const normalized = String(value || '').trim();
  return normalized ? normalized : null;
}

function normalizeNullableNumber(value: unknown): number | null {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

export function buildTelegramAlertEvent<
  T extends Record<string, unknown>,
>(params: {
  type: TelegramAlertEnvelope<T>['type'];
  dedupKey: string;
  source: string;
  payload: T;
}): TelegramAlertEnvelope<T> {
  const config = getTelegramAlertsConfig();

  return {
    type: params.type,
    dedupKey: params.dedupKey,
    payload: params.payload,
    source: params.source,
    createdAt: new Date().toISOString(),
    environment: config.envLabel,
  };
}

export function isTelegramAlertsQueueAvailable(): boolean {
  const isStaticBuild = isStaticGenerateProcess();
  const notificationsEnabled =
    process.env.ENABLE_NOTIFICATIONS_WORKER !== 'false';

  return !isStaticBuild && notificationsEnabled;
}

export async function enqueueTelegramAlert(
  event: TelegramAlertEnvelope
): Promise<{ enqueued: boolean; reason?: string }> {
  const config = getTelegramAlertsConfig();
  if (!config.enabled) {
    return { enqueued: false, reason: 'not_configured' };
  }

  if (!isTelegramAlertsQueueAvailable()) {
    return { enqueued: false, reason: 'queue_unavailable' };
  }

  const targetChannel = resolveTelegramAlertChannel(event.type);
  const created = await createQueuedTelegramDelivery({
    event,
    targetChannel,
  });

  if (!created) {
    return { enqueued: false, reason: 'duplicate' };
  }

  try {
    await telegramAlertsQueue.add(
      'telegram-alert',
      { event },
      {
        jobId: buildTelegramAlertsJobId(event.dedupKey),
      }
    );

    return { enqueued: true };
  } catch (error: any) {
    await markTelegramDeliveryQueueFailure({
      dedupKey: event.dedupKey,
      errorMessage: error?.message || 'queue_enqueue_failed',
    });

    throw error;
  }
}

export async function enqueueTelegramAlertSafe(
  event: TelegramAlertEnvelope
): Promise<void> {
  try {
    await enqueueTelegramAlert(event);
  } catch (error) {
    console.error('[Telegram Alerts] Failed to enqueue alert:', error);
  }
}

export async function processTelegramAlertDelivery(params: {
  event: TelegramAlertEnvelope;
  attempt: number;
}): Promise<void> {
  const channel = resolveTelegramAlertChannel(params.event.type);
  await markTelegramDeliveryProcessing({
    dedupKey: params.event.dedupKey,
    attempt: params.attempt,
  });

  const message = formatTelegramAlertMessage(params.event, channel);
  let lastError: TelegramApiError | null = null;
  const maxInlineAttempts = 3;

  for (let iteration = 0; iteration < maxInlineAttempts; iteration += 1) {
    try {
      const result = await sendTelegramMessage({ text: message });
      await markTelegramDeliverySent({
        dedupKey: params.event.dedupKey,
        attempt: params.attempt,
        providerResponseCode: result.providerResponseCode,
        telegramMessageId: result.telegramMessageId,
      });
      return;
    } catch (error) {
      if (error instanceof TelegramApiError) {
        lastError = error;

        // Таймаут после отправки запроса не даёт понять, дошёл ли alert до Telegram.
        // Автоповтор в этом случае создаёт дубли, что особенно опасно для billing-событий.
        if (isAmbiguousTelegramDeliveryError(error)) {
          const errorMessage = `${error.message}; automatic retry skipped to avoid duplicate Telegram alerts`;

          await markTelegramDeliveryUncertain({
            dedupKey: params.event.dedupKey,
            attempt: params.attempt,
            errorMessage,
          });

          console.warn(
            `[Telegram Alerts] Ambiguous delivery for ${params.event.dedupKey}; skipping automatic retry to avoid duplicates: ${error.message}`
          );

          return;
        }

        const hasAttemptsLeft = iteration < maxInlineAttempts - 1;
        const isRetryable = isRetryableTelegramTransportError(error);

        if (hasAttemptsLeft && isRetryable) {
          const delayMs =
            error.statusCode === 429 && error.retryAfterSeconds
              ? error.retryAfterSeconds * 1000
              : Math.min(5_000, 1_000 * 2 ** iteration);

          console.warn(
            `[Telegram Alerts] Retryable delivery error for ${params.event.dedupKey}; retrying in ${delayMs}ms: ${error.message}`
          );

          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        break;
      }

      lastError = new TelegramApiError({
        message: (error as any)?.message || 'Unknown Telegram delivery error',
      });
      break;
    }
  }

  await markTelegramDeliveryFailed({
    dedupKey: params.event.dedupKey,
    attempt: params.attempt,
    errorMessage: lastError?.message || 'Unknown Telegram delivery error',
    providerResponseCode: lastError?.statusCode ?? null,
    providerRetryAfterSeconds: lastError?.retryAfterSeconds ?? null,
  });

  throw lastError || new Error('Unknown Telegram delivery error');
}

export async function enqueueUserRegisteredAlertSafe(params: {
  userId: number;
  method: TelegramUserRegistrationMethod;
}): Promise<void> {
  const userEmail = await resolveTelegramAlertUserEmail({
    userId: params.userId,
  });
  const event = buildTelegramAlertEvent({
    type: 'user.registered',
    dedupKey: `users:registered:user:${params.userId}`,
    source: `auth:${params.method}`,
    payload: {
      userId: params.userId,
      userEmail,
      method: params.method,
      occurredAt: new Date().toISOString(),
    },
  });

  await enqueueTelegramAlertSafe(event);
}

export async function enqueueUserDeletionRequestedAlertSafe(params: {
  userId: number;
  mode: 'grace_period' | 'immediate';
  userEmail?: string | null;
}): Promise<void> {
  const userEmail = await resolveTelegramAlertUserEmail({
    userId: params.userId,
    userEmail: params.userEmail,
  });

  await enqueueTelegramAlertSafe(
    buildTelegramAlertEvent({
      type: 'user.deletion_requested',
      dedupKey: `users:deletion_requested:user:${params.userId}`,
      source: 'user.delete',
      payload: {
        userId: params.userId,
        userEmail,
        mode: params.mode,
        occurredAt: new Date().toISOString(),
      },
    })
  );
}

export async function enqueueBillingPurchaseSuccessAlertSafe(params: {
  userId: number;
  subscriptionId: number | null;
  paymentId: string | null;
  planId: string | null;
  billingPeriod?: string | null;
  amount: unknown;
  currency?: string | null;
  source: string;
  reason?: string | null;
}): Promise<void> {
  const paymentId = String(params.paymentId || '').trim();
  if (!paymentId) {
    return;
  }

  const userEmail = await resolveTelegramAlertUserEmail({
    userId: params.userId,
  });

  await enqueueTelegramAlertSafe(
    buildTelegramAlertEvent({
      type: 'billing.purchase_success',
      dedupKey: `billing:purchase_success:payment:${paymentId}`,
      source: params.source,
      payload: {
        userId: params.userId,
        userEmail,
        subscriptionId: params.subscriptionId,
        paymentId,
        planId: params.planId,
        billingPeriod: params.billingPeriod ?? null,
        amountMinor: toMinorUnits(params.amount),
        currency: String(params.currency || 'RUB')
          .trim()
          .toUpperCase(),
        source: params.source,
        reason: params.reason ?? null,
        occurredAt: new Date().toISOString(),
      },
    })
  );
}

export async function enqueueBillingPurchaseFailedAlertSafe(params: {
  userId: number;
  subscriptionId: number | null;
  paymentId: string | null;
  planId: string | null;
  billingPeriod?: string | null;
  amount?: unknown;
  currency?: string | null;
  source: string;
  reason: string;
}): Promise<void> {
  const paymentId = String(params.paymentId || '').trim();
  if (!paymentId) {
    return;
  }

  const userEmail = await resolveTelegramAlertUserEmail({
    userId: params.userId,
  });

  await enqueueTelegramAlertSafe(
    buildTelegramAlertEvent({
      type: 'billing.purchase_failed',
      dedupKey: `billing:purchase_failed:payment:${paymentId}`,
      source: params.source,
      payload: {
        userId: params.userId,
        userEmail,
        subscriptionId: params.subscriptionId,
        paymentId,
        planId: params.planId,
        billingPeriod: params.billingPeriod ?? null,
        amountMinor:
          typeof params.amount === 'undefined'
            ? null
            : toMinorUnits(params.amount),
        currency: String(params.currency || 'RUB')
          .trim()
          .toUpperCase(),
        source: params.source,
        reason: params.reason,
        occurredAt: new Date().toISOString(),
      },
    })
  );
}

export async function enqueueBillingPaymentMethodBoundAlertSafe(params: {
  userId: number;
  source: string;
  provider: 'yookassa';
  paymentMethodId?: string | null;
  bindingSessionId?: string | null;
  occurredAt?: Date;
}): Promise<void> {
  const bindingSessionId = String(params.bindingSessionId || '').trim();
  const paymentMethodId = String(params.paymentMethodId || '').trim();
  const userEmail = await resolveTelegramAlertUserEmail({
    userId: params.userId,
  });
  const dedupKey = bindingSessionId
    ? `billing:payment_method_bound:binding:${bindingSessionId}`
    : paymentMethodId
      ? `billing:payment_method_bound:payment_method:${paymentMethodId}`
      : `billing:payment_method_bound:user:${params.userId}:${buildTelegramAlertStableHash(params.source)}`;

  await enqueueTelegramAlertSafe(
    buildTelegramAlertEvent({
      type: 'billing.payment_method_bound',
      dedupKey,
      source: params.source,
      payload: {
        userId: params.userId,
        userEmail,
        provider: params.provider,
        paymentMethodId: paymentMethodId || null,
        bindingSessionId: bindingSessionId || null,
        occurredAt: (params.occurredAt ?? new Date()).toISOString(),
      },
    })
  );
}

export async function enqueueBillingPlanChangedAlertSafe(params: {
  userId: number;
  source: string;
  fromSubscriptionId?: number | null;
  fromPlanId: string;
  fromBillingPeriod?: string | null;
  toSubscriptionId?: number | null;
  toPlanId: string;
  toBillingPeriod?: string | null;
  paymentId?: string | null;
  effectiveAt?: Date | string | null;
  occurredAt?: Date;
}): Promise<void> {
  const toSubscriptionId = Number(params.toSubscriptionId);
  const normalizedPaymentId = String(params.paymentId || '').trim();
  const userEmail = await resolveTelegramAlertUserEmail({
    userId: params.userId,
  });
  const dedupKey =
    Number.isFinite(toSubscriptionId) && toSubscriptionId > 0
      ? `billing:plan_changed:subscription:${toSubscriptionId}`
      : normalizedPaymentId
        ? `billing:plan_changed:payment:${normalizedPaymentId}`
        : `billing:plan_changed:user:${params.userId}:${buildTelegramAlertStableHash(`${params.fromPlanId}:${params.toPlanId}:${params.source}`)}`;

  await enqueueTelegramAlertSafe(
    buildTelegramAlertEvent({
      type: 'billing.plan_changed',
      dedupKey,
      source: params.source,
      payload: {
        userId: params.userId,
        userEmail,
        fromSubscriptionId: params.fromSubscriptionId ?? null,
        fromPlanId: params.fromPlanId,
        fromBillingPeriod: params.fromBillingPeriod ?? null,
        toSubscriptionId: params.toSubscriptionId ?? null,
        toPlanId: params.toPlanId,
        toBillingPeriod: params.toBillingPeriod ?? null,
        paymentId: normalizedPaymentId || null,
        effectiveAt: params.effectiveAt ?? null,
        occurredAt: (params.occurredAt ?? new Date()).toISOString(),
      },
    })
  );
}

export async function enqueueBillingSubscriptionCanceledAlertSafe(params: {
  userId: number;
  subscriptionId: number | null;
  planId: string | null;
  endDate?: Date | string | null;
}): Promise<void> {
  const userEmail = await resolveTelegramAlertUserEmail({
    userId: params.userId,
  });
  const dedupKey = params.subscriptionId
    ? `billing:subscription_canceled:subscription:${params.subscriptionId}`
    : `billing:subscription_canceled:user:${params.userId}`;

  await enqueueTelegramAlertSafe(
    buildTelegramAlertEvent({
      type: 'billing.subscription_canceled',
      dedupKey,
      source: 'subscriptions.cancel',
      payload: {
        userId: params.userId,
        userEmail,
        subscriptionId: params.subscriptionId,
        planId: params.planId,
        endDate: params.endDate ?? null,
        occurredAt: new Date().toISOString(),
      },
    })
  );
}

export async function enqueueBillingCheckoutErrorAlertSafe(params: {
  userId: number | null;
  planId: string | null;
  billingPeriod?: string | null;
  statusCode?: number | null;
  errorMessage: string;
}): Promise<void> {
  const userEmail = await resolveTelegramAlertUserEmail({
    userId: params.userId,
  });
  const keyBase = [
    params.userId ?? 'anonymous',
    params.planId ?? 'unknown',
    params.billingPeriod ?? 'unknown',
    params.statusCode ?? 'no-status',
    buildTelegramAlertStableHash(params.errorMessage),
  ].join(':');

  await enqueueTelegramAlertSafe(
    buildTelegramAlertEvent({
      type: 'billing.checkout_error',
      dedupKey: `billing:checkout_error:${keyBase}`,
      source: 'subscriptions.start-checkout',
      payload: {
        userId: params.userId,
        userEmail,
        planId: params.planId,
        billingPeriod: params.billingPeriod ?? null,
        statusCode: params.statusCode ?? null,
        errorMessage: params.errorMessage,
        occurredAt: new Date().toISOString(),
      },
    })
  );
}

export async function enqueueBillingWebhookErrorAlertSafe(params: {
  paymentId?: string | null;
  statusCode?: number | null;
  errorMessage: string;
}): Promise<void> {
  const normalizedPaymentId =
    String(params.paymentId || '').trim() || 'unknown';

  await enqueueTelegramAlertSafe(
    buildTelegramAlertEvent({
      type: 'billing.webhook_error',
      dedupKey: `billing:webhook_error:${normalizedPaymentId}:${buildTelegramAlertStableHash(params.errorMessage)}`,
      source: 'payments.yookassa.webhook',
      payload: {
        paymentId:
          normalizedPaymentId === 'unknown' ? null : normalizedPaymentId,
        statusCode: params.statusCode ?? null,
        errorMessage: params.errorMessage,
        occurredAt: new Date().toISOString(),
      },
    })
  );
}

export async function enqueueBillingCriticalAlertSafe(params: {
  source: string;
  operation?: string | null;
  reason?: string | null;
  userId?: number | null;
  userEmail?: string | null;
  subscriptionId?: number | null;
  paymentId?: string | null;
  planId?: string | null;
  billingPeriod?: string | null;
  statusCode?: number | null;
  error: unknown;
  context?: Record<string, unknown>;
  occurredAt?: Date;
}): Promise<void> {
  const details = normalizeTelegramAlertErrorDetails(
    params.error,
    'billing_critical_error'
  );
  const operation = normalizeNullableString(params.operation);
  const reason = normalizeNullableString(params.reason);
  const userId = normalizeNullableNumber(params.userId);
  const userEmail = await resolveTelegramAlertUserEmail({
    userId,
    userEmail: params.userEmail,
  });
  const subscriptionId = normalizeNullableNumber(params.subscriptionId);
  const paymentId = normalizeNullableString(params.paymentId);
  const planId = normalizeNullableString(params.planId);
  const billingPeriod = normalizeNullableString(params.billingPeriod);
  const statusCode = params.statusCode ?? details.statusCode;
  const entityKey = paymentId
    ? `payment:${paymentId}`
    : subscriptionId
      ? `subscription:${subscriptionId}`
      : userId
        ? `user:${userId}`
        : 'global';
  const errorHash = buildTelegramAlertStableHash(
    [
      params.source,
      operation ?? 'unknown_operation',
      reason ?? 'unknown_reason',
      statusCode ?? 'no-status',
      details.message,
    ].join(':')
  );

  await enqueueTelegramAlertSafe(
    buildTelegramAlertEvent({
      type: 'billing.critical_error',
      dedupKey: buildTelegramAlertBucketedDedupKey({
        prefix: 'billing:critical_error',
        parts: [
          params.source,
          operation ?? 'unknown_operation',
          reason ?? 'unknown_reason',
          entityKey,
          statusCode ?? 'no-status',
          errorHash,
        ],
      }),
      source: params.source,
      payload: {
        source: params.source,
        operation,
        reason,
        userId,
        userEmail,
        subscriptionId,
        paymentId,
        planId,
        billingPeriod,
        statusCode,
        errorMessage: details.message,
        errorCode: details.code,
        errorName: details.name,
        context: params.context ?? null,
        occurredAt: (params.occurredAt ?? new Date()).toISOString(),
      },
    })
  );
}
