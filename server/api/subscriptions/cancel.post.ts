import { getSessionUser } from '@/server/application/auth/session';
import { createError } from 'h3';
import { hardCancelSubscription } from '@/server/application/subscriptions/hard-cancel.service';

/**
 * POST /api/subscriptions/cancel
 * Hard-cancel подписки: отключает future-billing в локальной модели
 * и пытается отменить pending платежи у провайдера.
 */
export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }

  const config = useRuntimeConfig(event);
  const result = await hardCancelSubscription({
    userId: sessionResult.user.id,
    shopId: String(config.yookassaShopId || '').trim(),
    secretKey: String(config.yookassaSecretKey || '').trim(),
  });

  return {
    success: result.success,
    message: result.message,
    endDate: result.endDate,
    activeSubscriptionId: result.activeSubscriptionId,
    canceledPendingSubscriptions: result.canceledPendingSubscriptions,
    unresolvedPendingPayments: result.unresolvedPendingPayments,
    paymentMethodDetached: result.paymentMethodDetached,
  };
});
