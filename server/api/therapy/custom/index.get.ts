import { eq } from 'drizzle-orm';
import { therapyTopicsCustom } from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import type { TherapyTopicDto } from '@/shared/dto/notifications';
import { getSessionUser } from '@/server/application/auth/session';

/**
 * GET /api/therapy/custom
 * Получить список пользовательских тем терапии
 */
export default defineEventHandler(async (event): Promise<TherapyTopicDto[]> => {
  const user = await getSessionUser(event);
  if (!user?.id) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    });
  }
  const userId = user.id;

  const topics = await db
    .select()
    .from(therapyTopicsCustom)
    .where(eq(therapyTopicsCustom.userId, userId))
    .orderBy(therapyTopicsCustom.createdAt);

  return topics.map((topic) => ({
    id: topic.id,
    name: topic.name,
    slug: topic.slug ?? null, // ВАЖНО: Возвращаем slug для читаемых URL
    description: topic.description ?? null,
    emoji: topic.emoji ?? null,
    createdAt: topic.createdAt.toISOString(),
    updatedAt: topic.updatedAt.toISOString(),
  }));
});
