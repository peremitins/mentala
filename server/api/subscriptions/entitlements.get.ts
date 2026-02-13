import { getSessionUserWithRole } from '@/server/utils/require-role';
import { getBillingSnapshot } from '@/server/application/subscriptions/entitlements.service';

/**
 * GET /api/subscriptions/entitlements
 * Отдаёт актуальный snapshot доступов (entitlements/paywall).
 */
export default defineEventHandler(async (event) => {
  const user = await getSessionUserWithRole(event);
  if (!user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }

  return getBillingSnapshot(user.id, user.role);
});
