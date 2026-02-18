import { eq } from 'drizzle-orm';
import { breathPracticesCustom } from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import type { BreathCustomPractice } from '@/app/lib/breathPracticesCatalog';
import {
  getBillingSnapshot,
  getFeatureAccessOrDefault,
  toFeaturePlanRequiredPayload,
} from '@/server/application/subscriptions/entitlements.service';

/**
 * GET /api/breath-practices/custom
 * Получить список кастомных дыхательных практик пользователя
 */
export default defineEventHandler(
  async (event): Promise<BreathCustomPractice[]> => {
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

    const practices = await db
      .select()
      .from(breathPracticesCustom)
      .where(eq(breathPracticesCustom.userId, userId))
      .orderBy(breathPracticesCustom.createdAt);

    return practices.map((practice) => ({
      id: practice.id,
      name: practice.name,
      phases: practice.phases as BreathCustomPractice['phases'],
      createdAt: practice.createdAt.toISOString(),
      updatedAt: practice.updatedAt.toISOString(),
    }));
  }
);
