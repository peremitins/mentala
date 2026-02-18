import { eq, and } from 'drizzle-orm';
import { therapyTopicsCustom } from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import type { TherapyTopicDto } from '@/shared/dto/notifications';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import {
  getBillingSnapshot,
  getFeatureAccessOrDefault,
  toFeaturePlanRequiredPayload,
} from '@/server/application/subscriptions/entitlements.service';

/**
 * GET /api/therapy/custom/:id
 * Получить пользовательскую тему терапии по ID
 */
export default defineEventHandler(async (event): Promise<TherapyTopicDto> => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    });
  }
  const userId = sessionUser.id;

  const featureKey = 'therapy.custom.create';
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
      message: 'Topic ID is required',
    });
  }

  // Ищем только по ID
  const [topic] = await db
    .select()
    .from(therapyTopicsCustom)
    .where(
      and(
        eq(therapyTopicsCustom.id, id),
        eq(therapyTopicsCustom.userId, userId)
      )
    )
    .limit(1);

  if (!topic) {
    throw createError({
      statusCode: 404,
      message: 'Topic not found',
    });
  }

  return {
    id: topic.id,
    name: topic.name,
    description: topic.description ?? null,
    emoji: topic.emoji ?? null,
    createdAt: topic.createdAt.toISOString(),
    updatedAt: topic.updatedAt.toISOString(),
  };
});
