import { eq, and, or } from 'drizzle-orm';
import {
  notificationPreferences,
  notificationSlots,
  therapyTopicsCustom,
} from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import { getSessionUser } from '@/server/application/auth/session';

/**
 * DELETE /api/therapy/custom/:id
 * Удалить пользовательскую тему терапии
 */
export default defineEventHandler(async (event) => {
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

  // Проверяем, существует ли тема (для получения slug)
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

  // Удаляем связанные настройки и запланированные уведомления
  // ВАЖНО: Ищем preferences по ID и slug, т.к. в БД может быть сохранен slug
  await db
    .delete(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.userId, userId),
        eq(notificationPreferences.kind, 'therapy'),
        or(
          eq(notificationPreferences.entityKey, existing.id),
          eq(notificationPreferences.entityKey, existing.slug || '')
        )
      )
    );

  // ВАЖНО: Удаляем слоты по ID и slug, т.к. в БД может быть сохранен slug
  await db
    .delete(notificationSlots)
    .where(
      and(
        eq(notificationSlots.userId, userId),
        eq(notificationSlots.kind, 'therapy'),
        eq(notificationSlots.status, 'planned'),
        or(
          eq(notificationSlots.entityKey, existing.id),
          eq(notificationSlots.entityKey, existing.slug || '')
        )
      )
    );

  // Удаляем тему (existing уже проверен выше)
  await db
    .delete(therapyTopicsCustom)
    .where(
      and(
        eq(therapyTopicsCustom.id, id),
        eq(therapyTopicsCustom.userId, userId)
      )
    );

  return { success: true };
});
