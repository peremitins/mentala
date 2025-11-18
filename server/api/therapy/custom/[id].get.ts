import { eq, and } from 'drizzle-orm';
import { therapyTopicsCustom } from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import type { TherapyTopicDto } from '@/shared/dto/notifications';
import { getSessionUser } from '@/server/application/auth/session';

/**
 * GET /api/therapy/custom/:id
 * Получить пользовательскую тему терапии
 */
export default defineEventHandler(
  async (event): Promise<TherapyTopicDto> => {
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
        message: 'Topic ID is required',
      });
    }

    const [topic] = await db
      .select()
      .from(therapyTopicsCustom)
      .where(and(eq(therapyTopicsCustom.id, id), eq(therapyTopicsCustom.userId, userId)))
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
  }
);
