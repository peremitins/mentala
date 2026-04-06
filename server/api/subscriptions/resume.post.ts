import { getSessionUser } from '@/server/application/auth/session';
import { createError } from 'h3';
import { resumeSubscription } from '@/server/application/subscriptions/resume.service';

/**
 * POST /api/subscriptions/resume
 * Возобновление автопродления подписки после отмены.
 * Восстанавливает autoRenew и планирует следующее списание на endDate.
 */
export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }

  const result = await resumeSubscription({
    userId: sessionResult.user.id,
  });

  return {
    success: result.success,
    subscriptionId: result.subscriptionId,
    planId: result.planId,
    billingPeriod: result.billingPeriod,
    nextChargeAt: result.nextChargeAt,
    endDate: result.endDate,
  };
});
