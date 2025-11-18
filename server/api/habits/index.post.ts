import { nanoid } from 'nanoid';
import { habits } from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import type { HabitDto, CreateHabitDto } from '@/shared/dto/notifications';
import { getSessionUser } from '@/server/application/auth/session';

/**
 * POST /api/habits
 * Создать новую привычку
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

  const body = await readBody<CreateHabitDto>(event);

  // Валидация
  if (!body.name || body.name.trim().length === 0) {
    throw createError({
      statusCode: 400,
      message: 'Habit name is required',
    });
  }

  if (!body.intent || !['build', 'quit', 'custom'].includes(body.intent)) {
    throw createError({
      statusCode: 400,
      message: 'Invalid intent',
    });
  }

  const description = body.description?.trim() || null;

  const [created] = await db
    .insert(habits)
    .values({
      id: nanoid(),
      userId,
      name: body.name.trim(),
      intent: body.intent,
      habitKey: body.habitKey ?? null,
      emoji: body.emoji ?? null,
      description,
    })
    .returning();

  return {
    id: created.id,
    name: created.name,
    intent: created.intent as 'build' | 'quit' | 'custom',
    habitKey: created.habitKey ?? null,
    emoji: created.emoji ?? null,
    description: created.description ?? null,
    createdAt: created.createdAt.toISOString(),
    updatedAt: created.updatedAt.toISOString(),
  };
});
