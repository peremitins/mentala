import { eq, and } from 'drizzle-orm';
import { habits } from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import type { HabitDto } from '@/shared/dto/notifications';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import {
  getBillingSnapshot,
  getFeatureAccessOrDefault,
  toFeaturePlanRequiredPayload,
} from '@/server/application/subscriptions/entitlements.service';

/**
 * GET /api/habits/:id
 * Получить конкретную привычку по ID
 */
export default defineEventHandler(async (event): Promise<HabitDto> => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    });
  }
  const userId = sessionUser.id;

  const featureKey = 'habits.custom.create';
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
      message: 'Habit ID is required',
    });
  }

  // Ищем только по ID
  const [habit] = await db
    .select()
    .from(habits)
    .where(and(eq(habits.id, id), eq(habits.userId, userId)))
    .limit(1);

  if (!habit) {
    throw createError({
      statusCode: 404,
      message: 'Habit not found',
    });
  }

  return {
    id: habit.id,
    name: habit.name,
    intent: habit.intent as 'build' | 'quit' | 'custom',
    habitKey: habit.habitKey ?? null,
    emoji: habit.emoji ?? null,
    description: habit.description ?? null,
    createdAt: habit.createdAt.toISOString(),
    updatedAt: habit.updatedAt.toISOString(),
  };
});
