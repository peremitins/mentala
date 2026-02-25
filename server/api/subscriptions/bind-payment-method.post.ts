import crypto from 'node:crypto';
import { createError, getHeader } from 'h3';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getSessionUser } from '@/server/application/auth/session';
import { db } from '@/server/infrastructure/db/client';
import { subscriptionEvents, users } from '@/server/infrastructure/db/schema';
import {
  startIdempotentRequest,
  finishIdempotentRequest,
  abortIdempotentRequest,
} from '@/server/application/idempotency/idempotency.service';
import { createYooKassaPaymentMethodBinding } from '@/server/application/payments/yookassa.client';
import { resolveExternalFlowAppUrl } from '@/server/application/auth/oauth-redirect';

type BindPaymentMethodResponse = {
  checkoutAction: 'bind_payment_method_required' | 'noop';
  paymentMode: 'none' | 'redirect';
  paymentUrl: string | null;
  bindingSessionId: string | null;
  paymentMethodBound: boolean;
};

const bindPaymentMethodBodySchema = z.object({
  force: z.boolean().optional(),
  appUrl: z.string().trim().optional(),
});

function buildBindReturnUrl(params: {
  appUrl: string;
  bindingSessionId: string;
}): string {
  return `${params.appUrl}/subscription?bindReturn=1&bindingSessionId=${encodeURIComponent(params.bindingSessionId)}`;
}

/**
 * POST /api/subscriptions/bind-payment-method
 * Отдельная команда привязки способа оплаты без немедленного списания за подписку.
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
        'Idempotency-Key header is required (8..128 chars) for bind-payment-method',
    });
  }

  const body = await readBody(event);
  const parsedBody = bindPaymentMethodBodySchema.safeParse(body ?? {});
  if (!parsedBody.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid body for bind-payment-method',
    });
  }

  const force = parsedBody.data.force === true;
  const requestedAppUrl = parsedBody.data.appUrl || null;

  const requestHash = crypto
    .createHash('sha256')
    .update(
      `bind-payment-method:${force ? 'force' : 'default'}:${requestedAppUrl || 'none'}`,
      'utf8'
    )
    .digest('hex');

  const route = '/api/subscriptions/bind-payment-method';
  const idem = await startIdempotentRequest<BindPaymentMethodResponse>({
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
        'Idempotency-Key reuse with different payload is not allowed for bind-payment-method',
    });
  }

  if (idem.kind === 'in_progress') {
    throw createError({
      statusCode: 409,
      statusMessage:
        'Bind payment method already in progress for this Idempotency-Key. Retry later.',
    });
  }

  const idempotencyRecordId = idem.recordId;
  const now = new Date();

  try {
    const userId = sessionResult.user.id;

    const userRows = await db
      .select({
        paymentMethodBound: users.paymentMethodBound,
        paymentMethodId: users.paymentMethodId,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const user = userRows[0];
    if (!user) {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found',
      });
    }

    if (!force && user.paymentMethodBound && user.paymentMethodId) {
      const response: BindPaymentMethodResponse = {
        checkoutAction: 'noop',
        paymentMode: 'none',
        paymentUrl: null,
        bindingSessionId: null,
        paymentMethodBound: true,
      };

      await finishIdempotentRequest({
        recordId: idempotencyRecordId,
        response,
      });

      return response;
    }

    const config = useRuntimeConfig(event);
    const appUrl = resolveExternalFlowAppUrl({
      event,
      configuredAppUrl: String(config.public.appUrl || 'http://localhost:3000'),
      requestedAppUrl,
    });
    const shopId = String(config.yookassaShopId || '').trim();
    const secretKey = String(config.yookassaSecretKey || '').trim();

    if (!shopId || !secretKey) {
      throw createError({
        statusCode: 500,
        statusMessage: 'YooKassa credentials not configured',
      });
    }

    const bindingSessionId = crypto.randomUUID();
    const returnUrl = buildBindReturnUrl({ appUrl, bindingSessionId });
    const yookassaIdempotenceKey = crypto
      .createHash('sha256')
      .update(`${userId}:${bindingSessionId}:${idempotencyKey}`, 'utf8')
      .digest('hex');

    const bindingResponse = await createYooKassaPaymentMethodBinding({
      shopId,
      secretKey,
      idempotenceKey: yookassaIdempotenceKey,
      returnUrl,
    });

    const paymentUrl = String(
      bindingResponse.confirmation?.confirmation_url || ''
    ).trim();
    if (!paymentUrl) {
      throw createError({
        statusCode: 502,
        statusMessage: 'YooKassa binding response missing confirmation_url',
      });
    }

    const response = await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          paymentMethodBindingId: bindingResponse.id,
          paymentMethodBindingSessionId: bindingSessionId,
          paymentMethodBindingStatus: 'pending',
          paymentMethodBindingUpdatedAt: now,
          updatedAt: now,
        })
        .where(eq(users.id, userId));

      await tx.insert(subscriptionEvents).values({
        userId,
        eventType: 'payment_method_binding_started',
        metadata: {
          bindingSessionId,
          paymentMethodBindingId: bindingResponse.id,
          source: 'bind-payment-method-endpoint',
        },
      });

      const responsePayload: BindPaymentMethodResponse = {
        checkoutAction: 'bind_payment_method_required',
        paymentMode: 'redirect',
        paymentUrl,
        bindingSessionId,
        paymentMethodBound: false,
      };

      await finishIdempotentRequest({
        recordId: idempotencyRecordId,
        response: responsePayload,
        tx,
      });

      return responsePayload;
    });

    return response;
  } catch (error) {
    await abortIdempotentRequest({ recordId: idempotencyRecordId }).catch(
      () => undefined
    );
    throw error;
  }
});
