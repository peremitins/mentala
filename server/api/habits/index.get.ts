import { eq } from 'drizzle-orm';
import { habits } from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import type { HabitDto } from '@/shared/dto/notifications';
import { getSessionUser } from '@/server/application/auth/session';

/**
 * GET /api/habits
 * Получить список привычек пользователя
 */
export default defineEventHandler(async (event): Promise<HabitDto[]> => {
  const user = await getSessionUser(event);
  if (!user?.id) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    });
  }
  const userId = user.id;

  const userHabits = await db
    .select()
    .from(habits)
    .where(eq(habits.userId, userId))
    .orderBy(habits.createdAt);

  return userHabits.map((h) => ({
    id: h.id,
    name: h.name,
    intent: h.intent as 'build' | 'quit' | 'custom',
    habitKey: h.habitKey ?? null,
    slug: h.slug ?? null, // ВАЖНО: Возвращаем slug для читаемых URL
    emoji: h.emoji ?? null,
    description: h.description ?? null,
    createdAt: h.createdAt.toISOString(),
    updatedAt: h.updatedAt.toISOString(),
  }));
});
