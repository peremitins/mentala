/**
 * Планировщик для постановки задач генерации слотов в очередь
 */

import { notificationSlotsQueue } from '../queues/notificationSlots.queue';
import { db } from '@/server/infrastructure/db/client';
import { notificationPreferences, users } from '@/server/infrastructure/db/schema';
import { eq, and, inArray } from 'drizzle-orm';

/**
 * Ставит задачи в очередь для всех пользователей с активными preferences
 */
export async function enqueueSlotGenerationForAllActiveUsers(): Promise<void> {
  console.log(
    '[Notification Slots Scheduler] 🔄 Starting enqueue for all active users'
  );

  try {
    // Получаем уникальные userId с активными preferences
    const activeUsers = await db
      .select({ userId: notificationPreferences.userId })
      .from(notificationPreferences)
      .where(eq(notificationPreferences.enabled, true))
      .groupBy(notificationPreferences.userId);

    if (activeUsers.length === 0) {
      console.log('[Notification Slots Scheduler] No active users found');
      return;
    }

    const activeUserIds = activeUsers.map((u) => u.userId);

    // КРИТИЧНО: Проверяем, что все пользователи существуют и не удалены
    const existingUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          inArray(users.id, activeUserIds),
          eq(users.isBlocked, false) // Исключаем заблокированных/удаленных
        )
      );

    const existingUserIds = existingUsers.map((u) => u.id);
    const deletedUserIds = activeUserIds.filter((id) => !existingUserIds.includes(id));

    if (deletedUserIds.length > 0) {
      console.warn(
        `[Notification Slots Scheduler] ⚠️ Found ${deletedUserIds.length} deleted/blocked users with active preferences: [${deletedUserIds.join(', ')}]`
      );
      console.warn(
        `[Notification Slots Scheduler] ⚠️ These users will be skipped. Consider running cleanup script.`
      );
    }

    console.log(
      `[Notification Slots Scheduler] Found ${activeUsers.length} users with active notifications, ${existingUserIds.length} existing and not blocked`
    );

    let enqueuedCount = 0;

    // Используем только существующих пользователей
    for (const userId of existingUserIds) {
      try {
        // Ставим задачу в очередь с детерминированным jobId
        // Один пользователь = одна задача генерации в очереди (защита от дублей)
        await notificationSlotsQueue.add(
          'generate',
          { userId },
          {
            jobId: `slots-${userId}`, // Детерминированный ID по пользователю
            removeOnComplete: true,
            removeOnFail: false,
          }
        );

        enqueuedCount++;
      } catch (error) {
        console.error(
          `[Notification Slots Scheduler] ❌ Error enqueueing user ${userId}:`,
          error
        );
      }
    }

    console.log(
      `[Notification Slots Scheduler] ✅ Completed: enqueued=${enqueuedCount}`
    );
  } catch (error) {
    console.error('[Notification Slots Scheduler] ❌ Fatal error:', error);
    throw error;
  }
}
