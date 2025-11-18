import { eq, and } from 'drizzle-orm';
import {
  habits,
  notificationPreferences,
  notificationSlots,
} from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import { getSessionUser } from '@/server/application/auth/session';

/**
 * DELETE /api/habits/:id
 * Удалить привычку
 */
export default defineEventHandler(
  async (event): Promise<{ success: boolean }> => {
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
        message: 'Habit ID is required',
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

    // Удаляем связанные настройки и запланированные слоты
    await db
      .delete(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.userId, userId),
          eq(notificationPreferences.kind, 'habits'),
          eq(notificationPreferences.habitId, existing.id)
        )
      );

    await db
      .delete(notificationSlots)
      .where(
        and(
          eq(notificationSlots.userId, userId),
          eq(notificationSlots.kind, 'habits'),
          eq(notificationSlots.status, 'planned'),
          eq(notificationSlots.habitId, existing.id)
        )
      );

    // Удаляем привычку
    await db.delete(habits).where(eq(habits.id, id));

    return { success: true };
  }
);
