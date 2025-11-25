import { eq, and, or } from 'drizzle-orm';
import { habits } from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import type { HabitDto } from '@/shared/dto/notifications';
import { getSessionUser } from '@/server/application/auth/session';

/**
 * GET /api/habits/:id
 * Получить конкретную привычку по slug или id (для обратной совместимости)
 */
export default defineEventHandler(async (event): Promise<HabitDto> => {
  const user = await getSessionUser(event);
  if (!user?.id) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    });
  }
  const userId = user.id;

  const identifier = getRouterParam(event, 'id');
  if (!identifier) {
    throw createError({
      statusCode: 400,
      message: 'Habit identifier is required',
    });
  }

  // Ищем по slug или id (для обратной совместимости)
  const [habit] = await db
    .select()
    .from(habits)
    .where(
      and(
        or(eq(habits.id, identifier), eq(habits.slug, identifier)),
        eq(habits.userId, userId)
      )
    )
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
    slug: habit.slug ?? null,
    emoji: habit.emoji ?? null,
    description: habit.description ?? null,
    createdAt: habit.createdAt.toISOString(),
    updatedAt: habit.updatedAt.toISOString(),
  };
});
