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
export default defineEventHandler(async (event): Promise<TherapyTopicDto> => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    });
  }
  const userId = sessionResult.user.id;

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
    .where(
      and(
        eq(therapyTopicsCustom.id, id),
        eq(therapyTopicsCustom.userId, userId)
      )
    )
    .limit(1);

  if (!existing) {
    throw createError({
      statusCode: 404,
      message: 'Topic not found',
    });
  }

  // Определяем, изменились ли чувствительные поля
  const nameChanged =
    body.name !== undefined && body.name.trim() !== existing.name;
  const descriptionChanged =
    body.description !== undefined &&
    (body.description?.trim() || null) !== existing.description;

  // Формируем данные для обновления
  const updateData: {
    name?: string;
    description?: string | null;
    emoji?: string | null;
    updatedAt: Date;
  } = {
    updatedAt: new Date(),
  };

  // Обновляем только переданные поля
  if (body.name !== undefined) {
    updateData.name = body.name.trim();
  }
  if (body.description !== undefined) {
    updateData.description = body.description?.trim() || null;
  }
  if (body.emoji !== undefined) {
    updateData.emoji = body.emoji?.trim() || null;
  }

  const [updated] = await db
    .update(therapyTopicsCustom)
    .set(updateData)
    .where(eq(therapyTopicsCustom.id, id))
    .returning();

  // Перегенерируем AI-тексты при изменении названия или описания
  if (nameChanged || descriptionChanged) {
    const { regenerateAiTextsForEntity } = await import(
      '@/server/application/notifications/regenerate-ai-texts-helper'
    );
    // Запускаем асинхронно, не блокируя ответ
    regenerateAiTextsForEntity({
      userId,
      kind: 'therapy',
      entityKey: updated.id, // ID для кастомных сущностей
      entityName: updated.name,
      entityDescription: updated.description,
    }).catch((error) => {
      console.error(`[Therapy PUT] ❌ Failed to regenerate AI texts:`, error);
    });
  }

  return {
    id: updated.id,
    name: updated.name,
    description: updated.description ?? null,
    emoji: updated.emoji ?? null,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  };
});
