import { eq, and, or } from 'drizzle-orm';
import { therapyTopicsCustom } from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import type { TherapyTopicDto } from '@/shared/dto/notifications';
import { getSessionUser } from '@/server/application/auth/session';

/**
 * GET /api/therapy/custom/:id
 * Получить пользовательскую тему терапии по slug или id (для обратной совместимости)
 */
export default defineEventHandler(async (event): Promise<TherapyTopicDto> => {
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
      message: 'Topic identifier is required',
    });
  }

  // Ищем по slug или id (для обратной совместимости)
  const [topic] = await db
    .select()
    .from(therapyTopicsCustom)
    .where(
      and(
        or(
          eq(therapyTopicsCustom.id, identifier),
          eq(therapyTopicsCustom.slug, identifier)
        ),
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
    slug: topic.slug ?? null,
    description: topic.description ?? null,
    emoji: topic.emoji ?? null,
    createdAt: topic.createdAt.toISOString(),
    updatedAt: topic.updatedAt.toISOString(),
  };
});
