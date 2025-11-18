import { nanoid } from 'nanoid';
import { therapyTopicsCustom } from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import type {
  TherapyTopicDto,
  CreateTherapyTopicDto,
} from '@/shared/dto/notifications';
import { getSessionUser } from '@/server/application/auth/session';

/**
 * POST /api/therapy/custom
 * Создать пользовательскую тему терапии
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

    const body = await readBody<CreateTherapyTopicDto>(event);
    if (!body.name || body.name.trim().length === 0) {
      throw createError({
        statusCode: 400,
        message: 'Название обязательно',
      });
    }

    const [created] = await db
      .insert(therapyTopicsCustom)
      .values({
        id: nanoid(),
        userId,
        name: body.name.trim(),
        description: body.description?.trim() || null,
        emoji: body.emoji?.trim() || null,
      })
      .returning();

    return {
      id: created.id,
      name: created.name,
      description: created.description ?? null,
      emoji: created.emoji ?? null,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }
);
