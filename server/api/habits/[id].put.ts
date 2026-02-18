import { eq, and } from 'drizzle-orm';
import { habits } from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import type { HabitDto, UpdateHabitDto } from '@/shared/dto/notifications';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import {
  getBillingSnapshot,
  getFeatureAccessOrDefault,
  toFeaturePlanRequiredPayload,
} from '@/server/application/subscriptions/entitlements.service';

/**
 * PUT /api/habits/:id
 * Обновить привычку
 */
export default defineEventHandler(async (event): Promise<HabitDto> => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    });
  }
  const userId = sessionUser.id;

  const featureKey = 'habits.custom.create';
  const billing = await getBillingSnapshot(userId, sessionUser.role);
  const access = getFeatureAccessOrDefault(billing, featureKey);
  if (!access.available) {
    throw createError({
      statusCode: 402,
      statusMessage: 'Feature requires higher plan',
      data: toFeaturePlanRequiredPayload({ featureKey, access }),
    });
  }

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

  // Определяем, изменились ли чувствительные поля
  const nameChanged =
    body.name !== undefined && body.name.trim() !== existing.name;
  const descriptionChanged =
    body.description !== undefined &&
    (body.description?.trim() || null) !== existing.description;

  // Формируем данные для обновления
  const updateData: {
    name?: string;
    intent?: 'build' | 'quit' | 'custom';
    habitKey?: string | null;
    emoji?: string | null;
    description?: string | null;
    updatedAt: Date;
  } = {
    updatedAt: new Date(),
  };

  // Обновляем только переданные поля
  if (body.name !== undefined) {
    updateData.name = body.name.trim();
  }
  if (body.intent !== undefined) {
    updateData.intent = body.intent;
  }
  if (body.habitKey !== undefined) {
    updateData.habitKey = body.habitKey ?? null;
  }
  if (body.emoji !== undefined) {
    updateData.emoji = body.emoji ?? null;
  }
  if (body.description !== undefined) {
    updateData.description = body.description?.trim() || null;
  }

  const [updated] = await db
    .update(habits)
    .set(updateData)
    .where(eq(habits.id, id))
    .returning();

  // Перегенерируем AI-тексты при изменении названия или описания
  if (nameChanged || descriptionChanged) {
    const { regenerateAiTextsForEntity } = await import(
      '@/server/application/notifications/regenerate-ai-texts-helper'
    );
    // Запускаем асинхронно, не блокируя ответ
    regenerateAiTextsForEntity({
      userId,
      kind: 'habits',
      entityKey: updated.id, // ID для кастомных сущностей
      entityName: updated.name,
      entityDescription: updated.description,
    }).catch((error) => {
      console.error(`[Habits PUT] ❌ Failed to regenerate AI texts:`, error);
    });
  }

  return {
    id: updated.id,
    name: updated.name,
    intent: updated.intent as 'build' | 'quit' | 'custom',
    habitKey: updated.habitKey ?? null,
    emoji: updated.emoji ?? null,
    description: updated.description ?? null,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  };
});
