import { eq, and } from 'drizzle-orm';
import { therapyTopicsCustom } from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import type {
  TherapyTopicDto,
  UpdateTherapyTopicDto,
} from '@/shared/dto/notifications';
import { getSessionUser } from '@/server/application/auth/session';

/**
 * PUT /api/therapy/custom/:id
 * Обновить пользовательскую тему терапии
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

    const body = await readBody<UpdateTherapyTopicDto>(event);
    if (body.name !== undefined && body.name.trim().length === 0) {
      throw createError({
        statusCode: 400,
        message: 'Название не может быть пустым',
      });
    }

    const [existing] = await db
      .select()
      .from(therapyTopicsCustom)
      .where(and(eq(therapyTopicsCustom.id, id), eq(therapyTopicsCustom.userId, userId)))
      .limit(1);

    if (!existing) {
      throw createError({
        statusCode: 404,
        message: 'Topic not found',
      });
    }

    const [updated] = await db
      .update(therapyTopicsCustom)
      .set({
        name: body.name?.trim() ?? existing.name,
        description:
          body.description !== undefined
            ? body.description?.trim() || null
            : existing.description,
        emoji:
          body.emoji !== undefined ? body.emoji?.trim() || null : existing.emoji,
        updatedAt: new Date(),
      })
      .where(eq(therapyTopicsCustom.id, id))
      .returning();

    return {
      id: updated.id,
      name: updated.name,
      description: updated.description ?? null,
      emoji: updated.emoji ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }
);
