import { eq, and } from 'drizzle-orm';
import { habits } from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import type { HabitDto } from '@/shared/dto/notifications';
import { getSessionUser } from '@/server/application/auth/session';

/**
 * GET /api/habits/:id
 * Получить конкретную привычку
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

  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'Habit ID is required',
    });
  }

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
