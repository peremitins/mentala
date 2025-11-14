import { eq, and } from 'drizzle-orm';
import { habits } from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import type { HabitDto, UpdateHabitDto } from '@/shared/dto/notifications';
import { getSessionUser } from '@/server/application/auth/session';

/**
 * PUT /api/habits/:id
 * Обновить привычку
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

  const body = await readBody<UpdateHabitDto>(event);

  // Валидация
  if (body.name !== undefined && body.name.trim().length === 0) {
    throw createError({
      statusCode: 400,
      message: 'Habit name cannot be empty',
    });
  }

  if (body.intent && !['build', 'quit', 'custom'].includes(body.intent)) {
    throw createError({
      statusCode: 400,
      message: 'Invalid intent',
    });
  }

  // Проверяем что привычка принадлежит пользователю
  const [existing] = await db
    .select()
    .from(habits)
    .where(and(eq(habits.id, id), eq(habits.userId, userId)))
    .limit(1);

  if (!existing) {
    throw createError({
      statusCode: 404,
      message: 'Habit not found',
    });
  }

  const [updated] = await db
    .update(habits)
    .set({
      name: body.name?.trim() ?? existing.name,
      intent: body.intent ?? existing.intent,
      habitKey: body.habitKey !== undefined ? body.habitKey : existing.habitKey,
      emoji: body.emoji !== undefined ? body.emoji : existing.emoji,
      updatedAt: new Date(),
    })
    .where(eq(habits.id, id))
    .returning();

  return {
    id: updated.id,
    name: updated.name,
    intent: updated.intent as 'build' | 'quit' | 'custom',
    habitKey: updated.habitKey ?? null,
    emoji: updated.emoji ?? null,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  };
});
