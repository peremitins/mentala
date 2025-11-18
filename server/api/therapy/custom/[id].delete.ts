import { eq, and } from 'drizzle-orm';
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

  // Удаляем связанные настройки и запланированные уведомления
  await db
    .delete(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.userId, userId),
        eq(notificationPreferences.kind, 'therapy'),
        eq(notificationPreferences.topicKey, id)
      )
    );

  await db
    .delete(notificationSlots)
    .where(
      and(
        eq(notificationSlots.userId, userId),
        eq(notificationSlots.kind, 'therapy'),
        eq(notificationSlots.status, 'planned'),
        eq(notificationSlots.topicKey, id)
      )
    );

  const deleted = await db
    .delete(therapyTopicsCustom)
    .where(and(eq(therapyTopicsCustom.id, id), eq(therapyTopicsCustom.userId, userId)))
    .returning();

  if (!deleted.length) {
    throw createError({
      statusCode: 404,
      message: 'Topic not found',
    });
  }

  return { success: true };
});
