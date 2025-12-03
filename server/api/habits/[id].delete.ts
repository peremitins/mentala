import { eq, and, inArray, sql } from 'drizzle-orm';
import {
  habits,
  notificationPreferences,
  notificationSlots,
  aiGeneratedNotificationTexts,
  aiNotificationTextUsage,
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

    // КРИТИЧНО: Удаляем все связанные данные в правильном порядке (сначала зависимые таблицы)

    // 1. Находим все preference_id для удаления связанных AI-текстов
    const preferences = await db
      .select({ id: notificationPreferences.id })
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.userId, userId),
          eq(notificationPreferences.kind, 'habits'),
          eq(notificationPreferences.entityKey, existing.id)
        )
      );

    const preferenceIds = preferences.map((p) => p.id);

    // 2. Удаляем использование AI-текстов (связанная таблица)
    if (preferenceIds.length > 0) {
      // Находим все AI-тексты для этих preferences
      const aiTexts = await db
        .select({ id: aiGeneratedNotificationTexts.id })
        .from(aiGeneratedNotificationTexts)
        .where(
          and(
            eq(aiGeneratedNotificationTexts.userId, userId),
            inArray(aiGeneratedNotificationTexts.preferenceId, preferenceIds)
          )
        );

      const aiTextIds = aiTexts.map((t) => t.id);

      // Удаляем использование AI-текстов
      if (aiTextIds.length > 0) {
        await db
          .delete(aiNotificationTextUsage)
          .where(inArray(aiNotificationTextUsage.aiTextId, aiTextIds));
        console.log(
          `[Habits DELETE] Deleted ${aiTextIds.length} AI text usage records`
        );
      }

      // 3. Удаляем AI-тексты
      if (preferenceIds.length > 0) {
        await db
          .delete(aiGeneratedNotificationTexts)
          .where(
            and(
              eq(aiGeneratedNotificationTexts.userId, userId),
              inArray(aiGeneratedNotificationTexts.preferenceId, preferenceIds)
            )
          );
        console.log(
          `[Habits DELETE] Deleted AI texts for ${preferenceIds.length} preferences`
        );
      }
    }

    // 4. Удаляем настройки уведомлений
    await db
      .delete(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.userId, userId),
          eq(notificationPreferences.kind, 'habits'),
          eq(notificationPreferences.entityKey, existing.id)
        )
      );

    // 5. Удаляем ВСЕ слоты (не только planned, но и sent, skipped, failed)
    await db
      .delete(notificationSlots)
      .where(
        and(
          eq(notificationSlots.userId, userId),
          eq(notificationSlots.kind, 'habits'),
          eq(notificationSlots.entityKey, existing.id)
        )
      );
    console.log(
      `[Habits DELETE] Deleted all notification slots for habit ${existing.id}`
    );

    // 6. Удаляем привычку
    await db.delete(habits).where(eq(habits.id, id));

    return { success: true };
  }
);
