import crypto from 'node:crypto';
import { createError, getHeader } from 'h3';
import { z } from 'zod';
import { getSessionUser } from '@/server/application/auth/session';
import {
  abortIdempotentRequest,
  finishIdempotentRequest,
  startIdempotentRequest,
} from '@/server/application/idempotency/idempotency.service';
import { resolveAppleIapRuntimeConfig } from '@/server/application/payments/apple-iap.config';
import { syncAppleIapTransactionForUser } from '@/server/application/subscriptions/apple-iap.service';

const appleIapConfirmBodySchema = z.object({
  transactionId: z.string().trim().min(1).max(128),
  signedTransactionInfo: z.string().trim().min(20),
  appAccountToken: z.string().uuid().optional().nullable(),
  storefrontCountryCode: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .refine((value) => /^[A-Z]{2}$/.test(value), {
      message: 'storefrontCountryCode must be a 2-letter country code',
    })
    .optional()
    .nullable(),
});

type AppleIapConfirmResponse = {
  status: 'active' | 'none';
  planId: 'pro' | 'premium' | null;
  billingPeriod: 'month' | 'year' | null;
  expiresAt: string | null;
  environment: 'production' | 'sandbox';
};

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * POST /api/subscriptions/apple/confirm
 * StoreKit 2 confirm: клиент отправляет transactionId + signedTransactionInfo (JWS),
 * сервер валидирует транзакцию через App Store Server API и синхронизирует подписку.
 */
export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }

  const idempotencyKeyHeader = getHeader(event, 'idempotency-key');
  const idempotencyKey = idempotencyKeyHeader
    ? String(idempotencyKeyHeader).trim()
    : '';

  if (
    !idempotencyKey ||
    idempotencyKey.length < 8 ||
    idempotencyKey.length > 128
  ) {
    throw createError({
      statusCode: 400,
      statusMessage:
        'Idempotency-Key header is required (8..128 chars) for apple IAP confirm',
    });
  }

  const body = await readBody(event);
  const parsedBody = appleIapConfirmBodySchema.safeParse(body ?? {});
  if (!parsedBody.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid body for apple IAP confirm',
    });
  }

  const requestHash = sha256(
    JSON.stringify({
      transactionId: parsedBody.data.transactionId,
      signedTransactionInfoHash: sha256(parsedBody.data.signedTransactionInfo),
    })
  );

  const route = '/api/subscriptions/apple/confirm';
  const idem = await startIdempotentRequest<AppleIapConfirmResponse>({
    userId: sessionResult.user.id,
    route,
    key: idempotencyKey,
    requestHash,
  });

  if (idem.kind === 'hit') {
    return idem.response;
  }

  if (idem.kind === 'conflict') {
    throw createError({
      statusCode: 409,
      statusMessage:
        'Idempotency-Key reuse with different payload is not allowed for apple IAP confirm',
    });
  }

  if (idem.kind === 'in_progress') {
    throw createError({
      statusCode: 409,
      statusMessage:
        'Apple IAP confirm already in progress for this Idempotency-Key. Retry later.',
    });
  }

  const idempotencyRecordId = idem.recordId;

  try {
    const runtime = resolveAppleIapRuntimeConfig(event);

    const result = await syncAppleIapTransactionForUser({
      userId: sessionResult.user.id,
      transactionId: parsedBody.data.transactionId,
      signedTransactionInfo: parsedBody.data.signedTransactionInfo,
      appAccountToken: parsedBody.data.appAccountToken || null,
      storefrontCountryCode: parsedBody.data.storefrontCountryCode || null,
      allowedBundleIds: runtime.allowedBundleIds,
      issuerId: runtime.issuerId,
      keyId: runtime.keyId,
      privateKeyBase64: runtime.privateKeyBase64,
      serverApiAvailable: runtime.serverApiAvailable,
      source: 'confirm',
    });

    const response: AppleIapConfirmResponse =
      result.kind === 'active'
        ? {
            status: 'active',
            planId: result.planId,
            billingPeriod: result.billingPeriod,
            expiresAt: result.expiresAt.toISOString(),
            environment: result.environment,
          }
        : {
            status: 'none',
            planId: null,
            billingPeriod: null,
            expiresAt: result.expiresAt ? result.expiresAt.toISOString() : null,
            environment: result.environment,
          };

    await finishIdempotentRequest({
      recordId: idempotencyRecordId,
      response,
    });

    return response;
  } catch (error) {
    await abortIdempotentRequest({ recordId: idempotencyRecordId }).catch(
      () => {
        // Игнорируем ошибки abort: важнее вернуть исходную ошибку.
      }
    );
    throw error;
  }
});
