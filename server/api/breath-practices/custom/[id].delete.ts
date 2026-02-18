import { eq, and } from 'drizzle-orm';
import { breathPracticesCustom } from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import {
  getBillingSnapshot,
  getFeatureAccessOrDefault,
  toFeaturePlanRequiredPayload,
} from '@/server/application/subscriptions/entitlements.service';

/**
 * DELETE /api/breath-practices/custom/:id
 * Удалить кастомную дыхательную практику
 */
export default defineEventHandler(
  async (event): Promise<{ success: boolean }> => {
    const sessionUser = await getSessionUserWithRole(event);
    if (!sessionUser?.id) {
      throw createError({
        statusCode: 401,
        message: 'Unauthorized',
      });
    }
    const userId = sessionUser.id;

    const featureKey = 'breath.custom.manage';
    const billing = await getBillingSnapshot(userId, sessionUser.role);
    const access = getFeatureAccessOrDefault(billing, featureKey);

    if (!access.available) {
      throw createError({
        statusCode: 402,
        statusMessage: 'Feature requires higher plan',
        data: toFeaturePlanRequiredPayload({ featureKey, access }),
      });
    }

    const id = getRouterParam(event, 'id');
    if (!id) {
      throw createError({
        statusCode: 400,
        message: 'ID практики обязателен',
      });
    }

    // Проверяем, существует ли практика и принадлежит ли она пользователю
    const [existing] = await db
      .select()
      .from(breathPracticesCustom)
      .where(
        and(
          eq(breathPracticesCustom.id, id),
          eq(breathPracticesCustom.userId, userId)
        )
      )
      .limit(1);

    if (!existing) {
      throw createError({
        statusCode: 404,
        message: 'Практика не найдена',
      });
    }

    await db
      .delete(breathPracticesCustom)
      .where(
        and(
          eq(breathPracticesCustom.id, id),
          eq(breathPracticesCustom.userId, userId)
        )
      );

    return { success: true };
  }
);
