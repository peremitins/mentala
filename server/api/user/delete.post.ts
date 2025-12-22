import { defineEventHandler, setResponseStatus } from 'h3';
import { getSessionUser, revokeAllUserSessions } from '@@/server/application/auth/session';
import { db } from '@@/server/infrastructure/db/client';
import {
  users,
  userDevices,
  notificationSlots,
} from '@@/server/infrastructure/db/schema';
import { eq, and, sql, isNull } from 'drizzle-orm';
import { userDeletionQueue } from '@@/server/application/users/queues/userDeletion.queue';
import { deleteAll } from '../../utils/storage';

/**
 * 2-фазное удаление пользователя
 * Фаза A: Мгновенное отключение (синхронно, <300ms)
 * - Soft-delete пользователя
 * - Ревокнуть все сессии
 * - Остановить пуши (удалить devices, slots, выключить preferences)
 * - Поставить задачу в BullMQ с delay 7 days
 */
export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    setResponseStatus(event, 401);
    return { error: true, message: 'Unauthorized' } as const;
  }

  const userId = sessionResult.user.id;
  const now = new Date();

  try {
    // 1. Soft-delete пользователя
    // Проверяем, есть ли поля deletion_requested_at и deleted_at в схеме
    // Если нет - используем временное решение через isBlocked
    const userUpdate: any = {};
    
    // Пытаемся обновить поля, если они есть в схеме
    try {
      await db
        .update(users)
        .set({
          // @ts-ignore - поля могут отсутствовать до миграции
          deletionRequestedAt: now,
          // @ts-ignore
          deletedAt: now,
        } as any)
        .where(eq(users.id, userId));
    } catch (error: any) {
      // Если поля не существуют, используем временное решение
      if (error?.message?.includes('deletion_requested_at') || error?.message?.includes('deleted_at')) {
        // Временно блокируем пользователя
        await db
          .update(users)
          .set({ isBlocked: true })
          .where(eq(users.id, userId));
        console.warn('[UserDeletion] Fields deletion_requested_at/deleted_at not found, using isBlocked as fallback');
      } else {
        throw error;
      }
    }

    // 2. Ревокнуть все сессии
    await revokeAllUserSessions(userId);

    // 3. Остановить пуши
    // Удалить user_devices
    await db.delete(userDevices).where(eq(userDevices.userId, userId));

    // Удалить notification_slots со статусами planned и queued
    await db
      .delete(notificationSlots)
      .where(
        and(
          eq(notificationSlots.userId, userId),
          sql`${notificationSlots.status} IN ('planned', 'queued')`
        )
      );

    // НЕ трогаем notification_preferences.enabled - сохраняем предыдущее состояние
    // Вместо этого исключаем deleted users в планировщиках/генерации

    // 4. Поставить задачу в BullMQ с delay 7 days
    const jobId = `user-delete-${userId}`;
    const gracePeriodDays = 7;
    const delayMs = gracePeriodDays * 24 * 60 * 60 * 1000;

    await userDeletionQueue.add(
      'user-deletion',
      { userId },
      {
        jobId,
        delay: delayMs, // 7 дней
        removeOnComplete: true,
      }
    );

    // 5. Удалить файлы пользователя (chat_settings)
    deleteAll(String(userId));

    // 6. Вернуть ответ
    setResponseStatus(event, 202); // Accepted
    return {
      ok: true,
      jobId,
      loggedOut: true,
      canRestore: true,
      message: 'Account deletion requested. You can restore it within 7 days.',
    };
  } catch (error: any) {
    console.error('[UserDeletion] Error in phase A:', error);
    setResponseStatus(event, 500);
    return {
      error: true,
      message: error?.message || 'Failed to delete account',
    } as const;
  }
});
